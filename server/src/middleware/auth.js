import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { ApiError } from '../lib/http.js';
import { query } from '../db.js';

export function signToken(user) {
  return jwt.sign(
    { sub: user.id, email: user.email, role: user.role, name: user.name },
    config.jwt.secret,
    { expiresIn: config.jwt.expiresIn },
  );
}

/** Exige um token JWT válido e carrega o utilizador actual em `req.user`. */
export async function requireAuth(req, _res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) throw ApiError.unauthorized('Token de acesso em falta');

    let payload;
    try {
      payload = jwt.verify(token, config.jwt.secret);
    } catch {
      throw ApiError.unauthorized('Sessão inválida ou expirada');
    }

    // Reconfirmar na base de dados: uma conta desactivada perde o acesso
    // imediatamente, sem esperar pela expiração do token.
    const { rows } = await query(
      'SELECT id, name, email, role, active FROM users WHERE id = $1',
      [payload.sub],
    );
    const user = rows[0];
    if (!user || !user.active) throw ApiError.unauthorized('Conta inactiva ou inexistente');

    req.user = user;
    next();
  } catch (error) {
    next(error);
  }
}

/** Restringe a rota aos perfis indicados. Usar sempre depois de requireAuth. */
export function requireRole(...roles) {
  return (req, _res, next) => {
    if (!req.user) return next(ApiError.unauthorized());
    if (!roles.includes(req.user.role)) {
      return next(ApiError.forbidden(`Operação reservada a: ${roles.join(', ')}`));
    }
    next();
  };
}
