import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db.js';
import { asyncHandler, parse } from '../lib/http.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { formatMinutes, isoDate } from '../lib/time.js';

export const reportsRouter = Router();

// Relatórios são a área do administrador e do gestor; o operador só regista.
reportsRouter.use(requireAuth, requireRole('admin', 'gestor'));

const rangeSchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inicial inválida').optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data final inválida').optional(),
  category_id: z.coerce.number().int().positive().optional(),
});

/** Intervalo por omissão: o mês corrente. */
function resolveRange(input) {
  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth(), 1);
  return {
    from: input.from ?? isoDate(first),
    to: input.to ?? isoDate(now),
    categoryId: input.category_id ?? null,
  };
}

/**
 * Dias úteis esperados por categoria no intervalo, segundo o horário
 * configurado (específico da categoria ou global).
 */
const SUMMARY_SQL = `
WITH params AS (
  SELECT $1::date AS from_date, $2::date AS to_date
),
sched AS (
  SELECT c.id AS category_id,
         COALESCE(cs.work_days, gs.work_days, '{1,2,3,4,5}'::int[]) AS work_days
    FROM categories c
    LEFT JOIN work_schedules cs ON cs.category_id = c.id
    LEFT JOIN work_schedules gs ON gs.category_id IS NULL
),
expected AS (
  SELECT s.category_id, COUNT(*)::int AS expected_days
    FROM sched s
    CROSS JOIN params p
    CROSS JOIN LATERAL generate_series(p.from_date, p.to_date, interval '1 day') AS d
   WHERE EXTRACT(ISODOW FROM d)::int = ANY (s.work_days)
   GROUP BY s.category_id
),
records AS (
  SELECT a.*
    FROM attendance a
    CROSS JOIN params p
   WHERE a.work_date BETWEEN p.from_date AND p.to_date
)
SELECT
  m.id                AS member_id,
  m.full_name,
  m.internal_code,
  m.position,
  m.department,
  c.id                AS category_id,
  c.name              AS category_name,
  c.color             AS category_color,
  COALESCE(e.expected_days, 0)                                              AS expected_days,
  COUNT(r.id) FILTER (WHERE r.check_in IS NOT NULL)::int                    AS present_days,
  COUNT(r.id) FILTER (WHERE r.late_minutes > 0)::int                        AS late_days,
  COALESCE(SUM(r.late_minutes), 0)::int                                     AS late_minutes,
  COUNT(r.id) FILTER (WHERE r.early_leave_minutes > 0)::int                 AS early_leave_days,
  COALESCE(SUM(r.early_leave_minutes), 0)::int                              AS early_leave_minutes,
  COUNT(r.id) FILTER (WHERE r.status = 'Justificado')::int                  AS justified_days,
  COUNT(r.id) FILTER (WHERE r.check_in IS NOT NULL AND r.check_out IS NULL)::int AS open_days,
  COALESCE(SUM(
    CASE WHEN r.check_in IS NOT NULL AND r.check_out IS NOT NULL
         THEN EXTRACT(EPOCH FROM (r.check_out - r.check_in)) / 60
         ELSE 0 END
  ), 0)::int                                                                AS worked_minutes
FROM members m
JOIN categories c ON c.id = m.category_id
LEFT JOIN expected e ON e.category_id = c.id
LEFT JOIN records r ON r.member_id = m.id
WHERE m.active AND ($3::int IS NULL OR m.category_id = $3)
GROUP BY m.id, m.full_name, m.internal_code, m.position, m.department,
         c.id, c.name, c.color, e.expected_days
ORDER BY m.full_name`;

async function buildSummary(range) {
  const { rows } = await query(SUMMARY_SQL, [range.from, range.to, range.categoryId]);
  return rows.map((r) => {
    const absentDays = Math.max(0, r.expected_days - r.present_days - r.justified_days);
    return {
      ...r,
      absent_days: absentDays,
      attendance_rate: r.expected_days > 0
        ? Math.round((r.present_days / r.expected_days) * 100)
        : 0,
      worked_hours: formatMinutes(r.worked_minutes),
      late_hours: formatMinutes(r.late_minutes),
    };
  });
}

/** Relatório de presenças, atrasos e ausências por pessoa no intervalo. */
reportsRouter.get(
  '/summary',
  asyncHandler(async (req, res) => {
    const range = resolveRange(parse(rangeSchema, req.query));
    const items = await buildSummary(range);

    const totals = items.reduce(
      (acc, i) => ({
        members: acc.members + 1,
        present_days: acc.present_days + i.present_days,
        absent_days: acc.absent_days + i.absent_days,
        late_days: acc.late_days + i.late_days,
        late_minutes: acc.late_minutes + i.late_minutes,
        worked_minutes: acc.worked_minutes + i.worked_minutes,
      }),
      { members: 0, present_days: 0, absent_days: 0, late_days: 0, late_minutes: 0, worked_minutes: 0 },
    );

    res.json({
      period: { from: range.from, to: range.to },
      totals: {
        ...totals,
        worked_hours: formatMinutes(totals.worked_minutes),
        late_hours: formatMinutes(totals.late_minutes),
      },
      items,
    });
  }),
);

/** Números do dia para o painel inicial do administrador. */
reportsRouter.get(
  '/dashboard',
  asyncHandler(async (_req, res) => {
    const { rows: byCategory } = await query(
      `SELECT c.id, c.name, c.color,
              COUNT(m.id) FILTER (WHERE m.active)::int AS total_members,
              COUNT(a.id) FILTER (WHERE a.check_in IS NOT NULL)::int AS present,
              COUNT(a.id) FILTER (WHERE a.late_minutes > 0)::int AS late,
              COUNT(a.id) FILTER (WHERE a.check_in IS NOT NULL AND a.check_out IS NULL)::int AS inside
         FROM categories c
         LEFT JOIN members m ON m.category_id = c.id AND m.active
         LEFT JOIN attendance a ON a.member_id = m.id AND a.work_date = CURRENT_DATE
        GROUP BY c.id, c.name, c.color
        ORDER BY c.name`,
    );

    const totals = byCategory.reduce(
      (acc, c) => ({
        total_members: acc.total_members + c.total_members,
        present: acc.present + c.present,
        late: acc.late + c.late,
        inside: acc.inside + c.inside,
      }),
      { total_members: 0, present: 0, late: 0, inside: 0 },
    );

    const { rows: recent } = await query(
      `SELECT a.id, a.check_in, a.check_out, a.status, a.late_minutes,
              m.full_name, m.internal_code, c.name AS category_name, c.color AS category_color
         FROM attendance a
         JOIN members m ON m.id = a.member_id
         JOIN categories c ON c.id = m.category_id
        WHERE a.work_date = CURRENT_DATE
        ORDER BY GREATEST(a.check_in, COALESCE(a.check_out, a.check_in)) DESC
        LIMIT 10`,
    );

    res.json({
      date: isoDate(),
      totals: { ...totals, absent: Math.max(0, totals.total_members - totals.present) },
      by_category: byCategory,
      recent,
    });
  }),
);

const CSV_COLUMNS = [
  ['internal_code', 'Codigo'],
  ['full_name', 'Nome'],
  ['category_name', 'Categoria'],
  ['position', 'Cargo'],
  ['department', 'Departamento'],
  ['expected_days', 'Dias previstos'],
  ['present_days', 'Dias presentes'],
  ['absent_days', 'Faltas'],
  ['justified_days', 'Justificadas'],
  ['late_days', 'Dias com atraso'],
  ['late_minutes', 'Minutos de atraso'],
  ['early_leave_days', 'Saidas antecipadas'],
  ['worked_hours', 'Horas trabalhadas'],
  ['attendance_rate', 'Assiduidade (%)'],
];

const csvCell = (value) => {
  const text = value === null || value === undefined ? '' : String(value);
  return /[";\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

/** Exportação do relatório em CSV (separador ';', compatível com Excel em pt). */
reportsRouter.get(
  '/export',
  asyncHandler(async (req, res) => {
    const range = resolveRange(parse(rangeSchema, req.query));
    const items = await buildSummary(range);

    const lines = [
      `Relatorio de presencas;${range.from} a ${range.to}`,
      '',
      CSV_COLUMNS.map(([, label]) => label).join(';'),
      ...items.map((item) => CSV_COLUMNS.map(([key]) => csvCell(item[key])).join(';')),
    ];

    // BOM para o Excel reconhecer os acentos como UTF-8.
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="presencas_${range.from}_${range.to}.csv"`);
    res.send('﻿' + lines.join('\n'));
  }),
);
