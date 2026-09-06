import { query } from '../db.js';

const FALLBACK = {
  start_time: '08:00:00',
  end_time: '16:00:00',
  tolerance_minutes: 10,
  work_days: [1, 2, 3, 4, 5],
};

/**
 * Horário aplicável a uma categoria: o específico da categoria quando existe,
 * caso contrário o global, caso contrário os valores por omissão.
 */
export async function scheduleForCategory(categoryId) {
  const { rows } = await query(
    `SELECT * FROM work_schedules
      WHERE category_id = $1 OR category_id IS NULL
      ORDER BY category_id NULLS LAST
      LIMIT 1`,
    [categoryId ?? null],
  );
  return rows[0] ?? FALLBACK;
}

export { FALLBACK as DEFAULT_SCHEDULE };
