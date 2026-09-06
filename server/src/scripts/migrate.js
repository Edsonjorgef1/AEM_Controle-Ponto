import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from '../db.js';

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), '../../db/migrations');

/** Aplica, por ordem, as migrações ainda não registadas em schema_migrations. */
async function migrate() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name       TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);

  const { rows } = await pool.query('SELECT name FROM schema_migrations');
  const applied = new Set(rows.map((r) => r.name));

  const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith('.sql')).sort();
  let count = 0;

  for (const file of files) {
    if (applied.has(file)) continue;

    const sql = await readFile(join(MIGRATIONS_DIR, file), 'utf8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
      await client.query('COMMIT');
      console.log(`[migrate] aplicada: ${file}`);
      count += 1;
    } catch (error) {
      await client.query('ROLLBACK');
      throw new Error(`Falha na migração ${file}: ${error.message}`);
    } finally {
      client.release();
    }
  }

  console.log(count ? `[migrate] ${count} migração(ões) aplicada(s).` : '[migrate] Base de dados já actualizada.');
}

migrate()
  .then(() => pool.end())
  .catch(async (error) => {
    console.error('[migrate]', error.message);
    await pool.end();
    process.exit(1);
  });
