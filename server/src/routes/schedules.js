import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db.js';
import { ApiError, asyncHandler, parse } from '../lib/http.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

export const schedulesRouter = Router();

schedulesRouter.use(requireAuth);

const scheduleSchema = z.object({
  category_id: z.coerce.number().int().positive().nullable().optional(),
  start_time: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, 'Hora de início inválida'),
  end_time: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, 'Hora de saída inválida'),
  tolerance_minutes: z.coerce.number().int().min(0).max(120).default(10),
  work_days: z.array(z.coerce.number().int().min(1).max(7)).min(1, 'Escolha pelo menos um dia'),
});

schedulesRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    const { rows } = await query(
      `SELECT w.*, c.name AS category_name
         FROM work_schedules w
         LEFT JOIN categories c ON c.id = w.category_id
        ORDER BY w.category_id NULLS FIRST`,
    );
    res.json(rows);
  }),
);

/**
 * Grava o horário global (category_id nulo) ou o de uma categoria.
 * Substitui o existente em vez de acumular versões.
 */
schedulesRouter.put(
  '/',
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const data = parse(scheduleSchema, req.body);

    if (data.start_time >= data.end_time) {
      throw ApiError.badRequest('A hora de saída deve ser posterior à de entrada');
    }

    const workDays = [...new Set(data.work_days)].sort((a, b) => a - b);
    const categoryId = data.category_id ?? null;

    const { rows } = categoryId === null
      ? await query(
          `INSERT INTO work_schedules (category_id, start_time, end_time, tolerance_minutes, work_days)
           VALUES (NULL, $1, $2, $3, $4)
           ON CONFLICT ((category_id IS NULL)) WHERE category_id IS NULL
           DO UPDATE SET start_time = EXCLUDED.start_time, end_time = EXCLUDED.end_time,
                         tolerance_minutes = EXCLUDED.tolerance_minutes, work_days = EXCLUDED.work_days
           RETURNING *`,
          [data.start_time, data.end_time, data.tolerance_minutes, workDays],
        )
      : await query(
          `INSERT INTO work_schedules (category_id, start_time, end_time, tolerance_minutes, work_days)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (category_id)
           DO UPDATE SET start_time = EXCLUDED.start_time, end_time = EXCLUDED.end_time,
                         tolerance_minutes = EXCLUDED.tolerance_minutes, work_days = EXCLUDED.work_days
           RETURNING *`,
          [categoryId, data.start_time, data.end_time, data.tolerance_minutes, workDays],
        );

    res.json(rows[0]);
  }),
);

/** Remove o horário específico de uma categoria: volta a valer o global. */
schedulesRouter.delete(
  '/:categoryId',
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const { rowCount } = await query('DELETE FROM work_schedules WHERE category_id = $1', [
      req.params.categoryId,
    ]);
    if (!rowCount) throw ApiError.notFound('Horário não encontrado');
    res.status(204).end();
  }),
);
