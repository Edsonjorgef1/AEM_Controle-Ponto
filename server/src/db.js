import pg from 'pg';
import { config } from './config.js';

// O PostgreSQL devolve DATE/TIME como texto para evitar conversões de fuso
// horário que deslocariam os dias e as horas do registo de ponto.
pg.types.setTypeParser(pg.types.builtins.DATE, (v) => v);
pg.types.setTypeParser(pg.types.builtins.TIME, (v) => v);
// NUMERIC -> número (usado nas médias dos relatórios).
pg.types.setTypeParser(pg.types.builtins.NUMERIC, (v) => (v === null ? null : Number(v)));

export const pool = new pg.Pool({
  ...config.db,
  max: 10,
  idleTimeoutMillis: 30_000,
});

pool.on('error', (err) => {
  console.error('[db] erro inesperado no pool de ligações:', err.message);
});

export function query(text, params) {
  return pool.query(text, params);
}

/** Corre `fn` dentro de uma transação, com commit/rollback automático. */
export async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
