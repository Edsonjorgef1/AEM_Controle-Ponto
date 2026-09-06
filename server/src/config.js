import 'dotenv/config';

const isProd = process.env.NODE_ENV === 'production';

const DEV_JWT_SECRET = 'dev-secret-nao-usar-em-producao';

if (isProd && !process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET é obrigatório quando NODE_ENV=production');
}

export const config = {
  isProd,
  port: Number(process.env.PORT ?? 3000),
  jwt: {
    secret: process.env.JWT_SECRET || DEV_JWT_SECRET,
    expiresIn: process.env.JWT_EXPIRES_IN || '12h',
  },
  corsOrigins: (process.env.CORS_ORIGIN ?? 'http://localhost:8100,http://localhost:4200')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean),
  db: {
    connectionString: process.env.DATABASE_URL || undefined,
    host: process.env.PGHOST,
    port: process.env.PGPORT ? Number(process.env.PGPORT) : undefined,
    database: process.env.PGDATABASE,
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
    ssl: process.env.PGSSL === 'true' ? { rejectUnauthorized: false } : undefined,
  },
  admin: {
    name: process.env.ADMIN_NAME || 'Administrador',
    email: process.env.ADMIN_EMAIL || 'admin@aem.local',
    password: process.env.ADMIN_PASSWORD || 'admin123',
  },
};
