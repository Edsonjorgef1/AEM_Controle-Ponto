import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { query } from '../db.js';
import { ApiError, asyncHandler, parse } from '../lib/http.js';
import { requireAuth, signToken } from '../middleware/auth.js';

export const authRouter = Router();

// Trava tentativas de força bruta sem afectar o resto da API.
const loginLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiadas tentativas de login. Tente novamente dentro de alguns minutos.' },
});

const loginSchema = z.object({
  email: z.string().trim().min(1, 'Email obrigatório'),
  password: z.string().min(1, 'Palavra-passe obrigatória'),
});

const publicUser = (u) => ({ id: u.id, name: u.name, email: u.email, role: u.role });

authRouter.post(
  '/login',
  loginLimiter,
  asyncHandler(async (req, res) => {
    const { email, password } = parse(loginSchema, req.body);

    const { rows } = await query(
      'SELECT * FROM users WHERE lower(email) = lower($1)',
      [email],
    );
    const user = rows[0];

    // Mensagem única para email inexistente e palavra-passe errada, para não
    // revelar que contas existem.
    const ok = user ? await bcrypt.compare(password, user.password_hash) : false;
    if (!ok) throw ApiError.unauthorized('Email ou palavra-passe incorrectos');
    if (!user.active) throw ApiError.forbidden('Esta conta está desactivada');

    await query('UPDATE users SET last_login_at = now() WHERE id = $1', [user.id]);

    res.json({ token: signToken(user), user: publicUser(user) });
  }),
);

authRouter.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json({ user: publicUser(req.user) });
  }),
);

const passwordSchema = z.object({
  current_password: z.string().min(1, 'Palavra-passe actual obrigatória'),
  new_password: z.string().min(6, 'A nova palavra-passe deve ter pelo menos 6 caracteres'),
});

authRouter.post(
  '/change-password',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { current_password, new_password } = parse(passwordSchema, req.body);

    const { rows } = await query('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
    const ok = await bcrypt.compare(current_password, rows[0].password_hash);
    if (!ok) throw ApiError.badRequest('Palavra-passe actual incorrecta');

    await query('UPDATE users SET password_hash = $1 WHERE id = $2', [
      await bcrypt.hash(new_password, 10),
      req.user.id,
    ]);

    res.json({ message: 'Palavra-passe actualizada' });
  }),
);
