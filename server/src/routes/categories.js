import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db.js';
import { ApiError, asyncHandler, parse } from '../lib/http.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

export const categoriesRouter = Router();

categoriesRouter.use(requireAuth);

const categorySchema = z.object({
  name: z.string().trim().min(2, 'Nome demasiado curto'),
  code_prefix: z.string().trim().toUpperCase()
    .regex(/^[A-Z]{2,5}$/, 'O prefixo deve ter 2 a 5 letras maiúsculas'),
  description: z.string().trim().optional().nullable(),
  color: z.string().trim().optional(),
});

categoriesRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    // Contagem de pessoas por categoria para os painéis do administrador.
    const { rows } = await query(
      `SELECT c.*, COUNT(m.id) FILTER (WHERE m.active) AS members_count
         FROM categories c
         LEFT JOIN members m ON m.category_id = c.id
        GROUP BY c.id
        ORDER BY c.name`,
    );
    res.json(rows.map((r) => ({ ...r, members_count: Number(r.members_count) })));
  }),
);

categoriesRouter.post(
  '/',
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const data = parse(categorySchema, req.body);
    const { rows } = await query(
      `INSERT INTO categories (name, code_prefix, description, color)
       VALUES ($1, $2, $3, COALESCE($4, 'primary')) RETURNING *`,
      [data.name, data.code_prefix, data.description ?? null, data.color ?? null],
    );
    res.status(201).json(rows[0]);
  }),
);

categoriesRouter.patch(
  '/:id',
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const data = parse(categorySchema.partial().extend({ active: z.boolean().optional() }), req.body);

    const fields = [];
    const values = [];
    for (const [col, val] of Object.entries(data)) {
      if (val === undefined) continue;
      values.push(val);
      fields.push(`${col} = $${values.length}`);
    }
    if (!fields.length) throw ApiError.badRequest('Nada para actualizar');

    values.push(req.params.id);
    const { rows } = await query(
      `UPDATE categories SET ${fields.join(', ')} WHERE id = $${values.length} RETURNING *`,
      values,
    );
    if (!rows[0]) throw ApiError.notFound('Categoria não encontrada');
    res.json(rows[0]);
  }),
);

categoriesRouter.delete(
  '/:id',
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const { rows } = await query(
      'SELECT COUNT(*)::INT AS total FROM members WHERE category_id = $1',
      [req.params.id],
    );
    if (rows[0].total > 0) {
      throw ApiError.conflict(
        `Não é possível eliminar: existem ${rows[0].total} pessoa(s) nesta categoria`,
      );
    }
    const { rowCount } = await query('DELETE FROM categories WHERE id = $1', [req.params.id]);
    if (!rowCount) throw ApiError.notFound('Categoria não encontrada');
    res.status(204).end();
  }),
);
