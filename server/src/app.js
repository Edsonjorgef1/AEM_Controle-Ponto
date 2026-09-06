import express from 'express';
import cors from 'cors';
import { config } from './config.js';
import { pool } from './db.js';
import { authRouter } from './routes/auth.js';
import { usersRouter } from './routes/users.js';
import { categoriesRouter } from './routes/categories.js';
import { membersRouter } from './routes/members.js';
import { attendanceRouter } from './routes/attendance.js';
import { reportsRouter } from './routes/reports.js';
import { schedulesRouter } from './routes/schedules.js';
import { errorHandler, notFoundHandler } from './middleware/error.js';

export function createApp() {
  const app = express();

  app.set('trust proxy', 1);
  app.use(express.json({ limit: '1mb' }));
  app.use(
    cors({
      origin(origin, callback) {
        // Pedidos sem Origin (apps nativas, curl) e origens autorizadas.
        if (!origin || config.corsOrigins.includes(origin) || config.corsOrigins.includes('*')) {
          return callback(null, true);
        }
        callback(new Error(`Origem não autorizada: ${origin}`));
      },
    }),
  );

  app.get('/api/health', async (_req, res) => {
    try {
      await pool.query('SELECT 1');
      res.json({ status: 'ok', database: 'ligada' });
    } catch (error) {
      res.status(503).json({ status: 'erro', database: 'indisponível', detail: error.message });
    }
  });

  app.use('/api/auth', authRouter);
  app.use('/api/users', usersRouter);
  app.use('/api/categories', categoriesRouter);
  app.use('/api/members', membersRouter);
  app.use('/api/attendance', attendanceRouter);
  app.use('/api/reports', reportsRouter);
  app.use('/api/schedules', schedulesRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
