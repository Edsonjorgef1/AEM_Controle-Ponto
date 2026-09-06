import { Router } from 'express';
import { z } from 'zod';
import QRCode from 'qrcode';
import { query, withTransaction } from '../db.js';
import { ApiError, asyncHandler, parse } from '../lib/http.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { generateQrToken, nextInternalCode } from '../lib/codes.js';

export const membersRouter = Router();

membersRouter.use(requireAuth);

const SELECT = `
  m.id, m.full_name, m.category_id, m.internal_code, m.qr_token, m.position,
  m.department, m.email, m.phone, m.active, m.created_at,
  c.name AS category_name, c.code_prefix AS category_prefix, c.color AS category_color`;

const createSchema = z.object({
  full_name: z.string().trim().min(3, 'Nome demasiado curto'),
  category_id: z.coerce.number().int().positive('Categoria obrigatória'),
  position: z.string().trim().optional().nullable(),
  department: z.string().trim().optional().nullable(),
  email: z.string().trim().email('Email inválido').optional().nullable().or(z.literal('')),
  phone: z.string().trim().optional().nullable(),
});

const updateSchema = createSchema.partial().extend({ active: z.boolean().optional() });

const listSchema = z.object({
  q: z.string().trim().optional(),
  category_id: z.coerce.number().int().positive().optional(),
  active: z.enum(['true', 'false']).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});

membersRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const { q, category_id, active, limit, offset } = parse(listSchema, req.query);

    const where = [];
    const values = [];
    if (q) {
      values.push(`%${q}%`);
      where.push(`(m.full_name ILIKE $${values.length} OR m.internal_code ILIKE $${values.length})`);
    }
    if (category_id) {
      values.push(category_id);
      where.push(`m.category_id = $${values.length}`);
    }
    if (active !== undefined) {
      values.push(active === 'true');
      where.push(`m.active = $${values.length}`);
    }
    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';

    values.push(limit, offset);
    const { rows } = await query(
      `SELECT ${SELECT}, COUNT(*) OVER() AS total_count
         FROM members m JOIN categories c ON c.id = m.category_id
         ${clause}
        ORDER BY m.full_name
        LIMIT $${values.length - 1} OFFSET $${values.length}`,
      values,
    );

    res.json({
      total: rows.length ? Number(rows[0].total_count) : 0,
      limit,
      offset,
      items: rows.map(({ total_count, ...m }) => m),
    });
  }),
);

membersRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const { rows } = await query(
      `SELECT ${SELECT} FROM members m JOIN categories c ON c.id = m.category_id WHERE m.id = $1`,
      [req.params.id],
    );
    if (!rows[0]) throw ApiError.notFound('Pessoa não encontrada');
    res.json(rows[0]);
  }),
);

membersRouter.post(
  '/',
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const data = parse(createSchema, req.body);

    const member = await withTransaction(async (client) => {
      // Bloqueia a categoria durante a transação para que dois registos
      // simultâneos não recebam o mesmo código sequencial.
      const { rows: cats } = await client.query(
        'SELECT id, code_prefix FROM categories WHERE id = $1 FOR UPDATE',
        [data.category_id],
      );
      if (!cats[0]) throw ApiError.badRequest('Categoria inexistente');

      const internalCode = await nextInternalCode(client, cats[0].id, cats[0].code_prefix);
      const { rows } = await client.query(
        `INSERT INTO members (full_name, category_id, internal_code, qr_token, position, department, email, phone)
         VALUES ($1, $2, $3, $4, $5, $6, NULLIF($7, ''), $8) RETURNING id`,
        [
          data.full_name, cats[0].id, internalCode, generateQrToken(),
          data.position ?? null, data.department ?? null, data.email ?? null, data.phone ?? null,
        ],
      );
      return rows[0].id;
    });

    const { rows } = await query(
      `SELECT ${SELECT} FROM members m JOIN categories c ON c.id = m.category_id WHERE m.id = $1`,
      [member],
    );
    res.status(201).json(rows[0]);
  }),
);

membersRouter.patch(
  '/:id',
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const data = parse(updateSchema, req.body);

    const fields = [];
    const values = [];
    for (const [col, val] of Object.entries(data)) {
      if (val === undefined) continue;
      values.push(col === 'email' && val === '' ? null : val);
      fields.push(`${col} = $${values.length}`);
    }
    if (!fields.length) throw ApiError.badRequest('Nada para actualizar');

    values.push(req.params.id);
    const { rows } = await query(
      `UPDATE members SET ${fields.join(', ')} WHERE id = $${values.length} RETURNING id`,
      values,
    );
    if (!rows[0]) throw ApiError.notFound('Pessoa não encontrada');

    const { rows: full } = await query(
      `SELECT ${SELECT} FROM members m JOIN categories c ON c.id = m.category_id WHERE m.id = $1`,
      [rows[0].id],
    );
    res.json(full[0]);
  }),
);

membersRouter.delete(
  '/:id',
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const { rowCount } = await query('DELETE FROM members WHERE id = $1', [req.params.id]);
    if (!rowCount) throw ApiError.notFound('Pessoa não encontrada');
    res.status(204).end();
  }),
);

/** Imagem do QR Code (PNG em data-URL) pronta a imprimir ou enviar. */
membersRouter.get(
  '/:id/qrcode',
  asyncHandler(async (req, res) => {
    const { rows } = await query(
      `SELECT m.id, m.full_name, m.internal_code, m.qr_token, c.name AS category_name
         FROM members m JOIN categories c ON c.id = m.category_id
        WHERE m.id = $1`,
      [req.params.id],
    );
    const member = rows[0];
    if (!member) throw ApiError.notFound('Pessoa não encontrada');

    const options = { errorCorrectionLevel: 'M', margin: 2, width: 512 };

    if (req.query.format === 'png') {
      const buffer = await QRCode.toBuffer(member.qr_token, options);
      res.type('png').send(buffer);
      return;
    }

    res.json({ ...member, image: await QRCode.toDataURL(member.qr_token, options) });
  }),
);

/** Emite um novo QR Code e invalida o anterior (cartão perdido ou roubado). */
membersRouter.post(
  '/:id/regenerate-qr',
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const { rows } = await query(
      'UPDATE members SET qr_token = $1 WHERE id = $2 RETURNING id, internal_code, qr_token',
      [generateQrToken(), req.params.id],
    );
    if (!rows[0]) throw ApiError.notFound('Pessoa não encontrada');
    res.json(rows[0]);
  }),
);
