import { ApiError } from '../lib/http.js';

export function notFoundHandler(req, res) {
  res.status(404).json({ error: `Rota não encontrada: ${req.method} ${req.originalUrl}` });
}

// eslint-disable-next-line no-unused-vars -- o Express identifica o handler pelos 4 argumentos
export function errorHandler(err, req, res, _next) {
  if (err instanceof ApiError) {
    return res.status(err.status).json({ error: err.message, details: err.details });
  }

  // Violações de integridade do PostgreSQL traduzidas para mensagens úteis.
  if (err.code === '23505') {
    return res.status(409).json({ error: 'Já existe um registo com esses dados', details: err.detail });
  }
  if (err.code === '23503') {
    return res.status(409).json({ error: 'Registo referenciado por outros dados', details: err.detail });
  }
  if (err.code === '22P02') {
    return res.status(400).json({ error: 'Identificador ou valor com formato inválido' });
  }
  if (err.code === '23514') {
    return res.status(400).json({ error: 'Valor fora dos limites permitidos', details: err.detail });
  }

  console.error('[api] erro não tratado:', err);
  res.status(500).json({ error: 'Erro interno do servidor' });
}
