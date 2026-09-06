import bcrypt from 'bcryptjs';
import { config } from '../config.js';
import { pool } from '../db.js';

/** Cria (ou reaproveita) a conta de administrador definida no .env. */
async function seed() {
  const { name, email, password } = config.admin;

  const { rows } = await pool.query(
    `INSERT INTO users (name, email, password_hash, role)
     VALUES ($1, lower($2), $3, 'admin')
     ON CONFLICT (email) DO NOTHING
     RETURNING id, email`,
    [name, email, await bcrypt.hash(password, 10)],
  );

  if (rows[0]) {
    console.log(`[seed] Administrador criado: ${rows[0].email}`);
    if (password === 'admin123') {
      console.warn('[seed] AVISO: está a usar a palavra-passe por omissão. Altere-a após o primeiro acesso.');
    }
  } else {
    console.log(`[seed] O administrador ${email} já existe — nada a fazer.`);
  }

  const { rows: cats } = await pool.query('SELECT name FROM categories ORDER BY name');
  console.log(`[seed] Categorias disponíveis: ${cats.map((c) => c.name).join(', ')}`);
}

seed()
  .then(() => pool.end())
  .catch(async (error) => {
    console.error('[seed]', error.message);
    await pool.end();
    process.exit(1);
  });
