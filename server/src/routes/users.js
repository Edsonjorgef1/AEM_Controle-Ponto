import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { query } from '../db.js';
import { ApiError, asyncHandler, parse } from '../lib/http.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

export const usersRouter = Router();

// Gestão de contas do sistema: exclusiva do administrador.
usersRouter.use(requireAuth, requireRole('admin'));

const ROLES = ['admin', 'gestor', 'operador'];

const createSchema = z.object({
  name: z.string().trim().min(2, 'Nome demasiado curto'),
  email: z.string().trim().email('Email inválido'),
  password: z.string().min(6, 'A palavra-passe deve ter pelo menos 6 caracteres'),
  role: z.enum(ROLES),
});

const updateSchema = z.object({
  name: z.string().trim().min(2).optional(),
  email: z.string().trim().email('Email inválido').optional(),
  password: z.string().min(6, 'A palavra-passe deve ter pelo menos 6 caracteres').optional(),
  role: z.enum(ROLES).optional(),
  active: z.boolean().optional(),
});

const SELECT = 'id, name, email, role, active, last_login_at, created_at';

usersRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    const { rows } = await query(`SELECT ${SELECT} FROM users ORDER BY name`);
    res.json(rows);
  }),
);

usersRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const data = parse(createSchema, req.body);
    const { rows } = await query(
      `INSERT INTO users (name, email, password_hash, role)
       VALUES ($1, $2, $3, $4) RETURNING ${SELECT}`,
      [data.name, data.email.toLowerCase(), await bcrypt.hash(data.password, 10), data.role],
    );
    res.status(201).json(rows[0]);
  }),
);

usersRouter.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const data = parse(updateSchema, req.body);

    // Um administrador não se pode despromover nem desactivar a si próprio:
    // evita que o sistema fique sem nenhum administrador activo.
    if (req.params.id === req.user.id && (data.role && data.role !== 'admin' || data.active === false)) {
      throw ApiError.badRequest('Não pode alterar o seu próprio perfil ou desactivar a sua conta');
    }

    const fields = [];
    const values = [];
    const add = (col, val) => { values.push(val); fields.push(`${col} = $${values.length}`); };

    if (data.name !== undefined) add('name', data.name);
    if (data.email !== undefined) add('email', data.email.toLowerCase());
    if (data.role !== undefined) add('role', data.role);
    if (data.active !== undefined) add('active', data.active);
    if (data.password !== undefined) add('password_hash', await bcrypt.hash(data.password, 10));

    if (!fields.length) throw ApiError.badRequest('Nada para actualizar');

    values.push(req.params.id);
    const { rows } = await query(
      `UPDATE users SET ${fields.join(', ')} WHERE id = $${values.length} RETURNING ${SELECT}`,
      values,
    );
    if (!rows[0]) throw ApiError.notFound('Utilizador não encontrado');
    res.json(rows[0]);
  }),
);

usersRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    if (req.params.id === req.user.id) {
      throw ApiError.badRequest('Não pode eliminar a sua própria conta');
    }
    const { rowCount } = await query('DELETE FROM users WHERE id = $1', [req.params.id]);
    if (!rowCount) throw ApiError.notFound('Utilizador não encontrado');
    res.status(204).end();
  }),
);
