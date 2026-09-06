import { Router } from 'express';
import { z } from 'zod';
import { pool, query, withTransaction } from '../db.js';
import { ApiError, asyncHandler, parse } from '../lib/http.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { scheduleForCategory } from '../lib/schedule.js';
import { earlyLeaveMinutes, isoDate, lateMinutes, timeOfDay, toMinutes } from '../lib/time.js';

export const attendanceRouter = Router();

attendanceRouter.use(requireAuth);

// Duas leituras do mesmo cartão em menos de 2 minutos são tratadas como
// duplicado do mesmo gesto, não como uma saída imediata a seguir à entrada.
const MIN_SCAN_INTERVAL_MINUTES = 2;

const RECORD_SELECT = `
  a.id, a.member_id, a.work_date, a.check_in, a.check_out, a.status,
  a.late_minutes, a.early_leave_minutes, a.method, a.notes, a.created_at,
  m.full_name, m.internal_code, m.position, m.department,
  c.id AS category_id, c.name AS category_name, c.color AS category_color`;

const RECORD_FROM = `
  FROM attendance a
  JOIN members m ON m.id = a.member_id
  JOIN categories c ON c.id = m.category_id`;

async function logScan(db, { memberId, userId, rawCode, action, message }) {
  await db.query(
    'INSERT INTO scan_log (member_id, user_id, raw_code, action, message) VALUES ($1, $2, $3, $4, $5)',
    [memberId ?? null, userId ?? null, rawCode ?? null, action, message ?? null],
  );
}

/**
 * Leitura recusada. O registo de auditoria não pode ser escrito dentro da
 * transação — o rollback que acompanha o erro apagá-lo-ia — por isso a
 * entrada do histórico viaja no erro e é gravada depois, fora da transação.
 */
class ScanRefused extends ApiError {
  constructor(status, message, log) {
    super(status, message);
    this.log = log;
  }
}

const scanSchema = z.object({
  code: z.string().trim().min(3, 'Código do QR Code em falta'),
  action: z.enum(['auto', 'entrada', 'saida']).default('auto'),
});

/**
 * Leitura do QR Code (ou introdução manual do código interno).
 * Decide sozinho se é entrada ou saída consoante o estado do dia.
 */
attendanceRouter.post(
  '/scan',
  asyncHandler(async (req, res) => {
    const { code, action: requested } = parse(scanSchema, req.body);
    const userId = req.user.id;

    const runScan = () => withTransaction(async (client) => {
      const { rows: members } = await client.query(
        `SELECT m.*, c.name AS category_name, c.color AS category_color
           FROM members m JOIN categories c ON c.id = m.category_id
          WHERE m.qr_token = $1 OR upper(m.internal_code) = upper($1)`,
        [code],
      );
      const member = members[0];

      if (!member) {
        throw new ScanRefused(404, 'QR Code não reconhecido. Verifique o cartão.', {
          userId, rawCode: code, action: 'recusado', message: 'Código não reconhecido',
        });
      }
      if (!member.active) {
        throw new ScanRefused(403, `${member.full_name} está inactivo(a) no sistema.`, {
          memberId: member.id, userId, rawCode: code,
          action: 'recusado', message: 'Pessoa inactiva',
        });
      }

      const now = new Date();
      const workDate = isoDate(now);
      const currentTime = timeOfDay(now);
      const schedule = await scheduleForCategory(member.category_id);

      // Bloqueia a linha do dia para que duas leituras simultâneas não
      // criem dois registos nem escrevam a saída em cima da entrada.
      const { rows: existing } = await client.query(
        'SELECT * FROM attendance WHERE member_id = $1 AND work_date = $2 FOR UPDATE',
        [member.id, workDate],
      );
      const record = existing[0];

      const wantsCheckIn = requested === 'entrada' || (requested === 'auto' && !record?.check_in);
      const wantsCheckOut = requested === 'saida' || (requested === 'auto' && record?.check_in && !record.check_out);

      if (record?.check_in && record?.check_out && requested !== 'entrada') {
        throw new ScanRefused(
          409,
          `${member.full_name} já registou entrada (${record.check_in.slice(0, 5)}) e saída (${record.check_out.slice(0, 5)}) hoje.`,
          {
            memberId: member.id, userId, rawCode: code,
            action: 'recusado', message: 'Entrada e saída já registadas',
          },
        );
      }

      if (wantsCheckIn) {
        if (record) {
          throw ApiError.conflict(`${member.full_name} já tem entrada registada hoje.`);
        }
        const late = lateMinutes(currentTime, schedule.start_time, schedule.tolerance_minutes);
        const { rows } = await client.query(
          `INSERT INTO attendance (member_id, work_date, check_in, status, late_minutes, method, checked_in_by)
           VALUES ($1, $2, $3, $4, $5, 'qrcode', $6) RETURNING id`,
          [member.id, workDate, currentTime, late > 0 ? 'Atrasado' : 'No horário', late, userId],
        );
        await logScan(client, { memberId: member.id, userId, rawCode: code, action: 'entrada' });
        return { id: rows[0].id, action: 'entrada', member, late_minutes: late, time: currentTime };
      }

      if (wantsCheckOut) {
        const elapsed = toMinutes(currentTime) - toMinutes(record.check_in);
        if (elapsed < MIN_SCAN_INTERVAL_MINUTES) {
          throw new ScanRefused(
            409,
            `Entrada de ${member.full_name} acabou de ser registada às ${record.check_in.slice(0, 5)}.`,
            {
              memberId: member.id, userId, rawCode: code,
              action: 'recusado', message: 'Leitura duplicada',
            },
          );
        }

        const early = earlyLeaveMinutes(currentTime, schedule.end_time);
        const { rows } = await client.query(
          `UPDATE attendance
              SET check_out = $1, early_leave_minutes = $2, checked_out_by = $3
            WHERE id = $4 RETURNING id`,
          [currentTime, early, userId, record.id],
        );
        await logScan(client, { memberId: member.id, userId, rawCode: code, action: 'saida' });
        return { id: rows[0].id, action: 'saida', member, early_leave_minutes: early, time: currentTime };
      }

      throw ApiError.conflict('Não foi possível determinar a operação para esta leitura.');
    });

    let result;
    try {
      result = await runScan();
    } catch (error) {
      // A recusa já foi decidida: grava a auditoria antes de a devolver.
      if (error instanceof ScanRefused) await logScan(pool, error.log);
      throw error;
    }

    const { rows } = await query(`SELECT ${RECORD_SELECT} ${RECORD_FROM} WHERE a.id = $1`, [result.id]);
    const record = rows[0];

    res.status(result.action === 'entrada' ? 201 : 200).json({
      action: result.action,
      message: result.action === 'entrada'
        ? `Entrada registada às ${result.time.slice(0, 5)}${result.late_minutes > 0 ? ` — ${result.late_minutes} min de atraso` : ''}`
        : `Saída registada às ${result.time.slice(0, 5)}`,
      record,
    });
  }),
);

/** Registos de hoje, para o painel ao vivo. */
attendanceRouter.get(
  '/today',
  asyncHandler(async (_req, res) => {
    const { rows } = await query(
      `SELECT ${RECORD_SELECT} ${RECORD_FROM}
        WHERE a.work_date = CURRENT_DATE
        ORDER BY a.check_in DESC NULLS LAST`,
    );
    res.json(rows);
  }),
);

const listSchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inicial inválida').optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data final inválida').optional(),
  member_id: z.string().uuid('Identificador de pessoa inválido').optional(),
  category_id: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(1000).default(200),
  offset: z.coerce.number().int().min(0).default(0),
});

attendanceRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const f = parse(listSchema, req.query);

    const where = [];
    const values = [];
    const add = (sql, val) => { values.push(val); where.push(sql.replace('$?', `$${values.length}`)); };

    if (f.from) add('a.work_date >= $?', f.from);
    if (f.to) add('a.work_date <= $?', f.to);
    if (f.member_id) add('a.member_id = $?', f.member_id);
    if (f.category_id) add('m.category_id = $?', f.category_id);

    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    values.push(f.limit, f.offset);

    const { rows } = await query(
      `SELECT ${RECORD_SELECT}, COUNT(*) OVER() AS total_count ${RECORD_FROM}
       ${clause}
       ORDER BY a.work_date DESC, a.check_in DESC NULLS LAST
       LIMIT $${values.length - 1} OFFSET $${values.length}`,
      values,
    );

    res.json({
      total: rows.length ? Number(rows[0].total_count) : 0,
      limit: f.limit,
      offset: f.offset,
      items: rows.map(({ total_count, ...r }) => r),
    });
  }),
);

const manualSchema = z.object({
  member_id: z.string().uuid('Pessoa obrigatória'),
  work_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida'),
  check_in: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, 'Hora de entrada inválida').optional().nullable(),
  check_out: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, 'Hora de saída inválida').optional().nullable(),
  status: z.enum(['No horário', 'Atrasado', 'Ausente', 'Justificado']).optional(),
  notes: z.string().trim().optional().nullable(),
});

/** Lançamento ou correcção manual pelo administrador (falha de leitura, justificação). */
attendanceRouter.post(
  '/manual',
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const data = parse(manualSchema, req.body);

    if (data.check_in && data.check_out && toMinutes(data.check_out) < toMinutes(data.check_in)) {
      throw ApiError.badRequest('A hora de saída não pode ser anterior à de entrada');
    }

    const { rows: members } = await query('SELECT * FROM members WHERE id = $1', [data.member_id]);
    if (!members[0]) throw ApiError.notFound('Pessoa não encontrada');

    const schedule = await scheduleForCategory(members[0].category_id);
    const late = data.check_in ? lateMinutes(data.check_in, schedule.start_time, schedule.tolerance_minutes) : 0;
    const early = data.check_out ? earlyLeaveMinutes(data.check_out, schedule.end_time) : 0;
    const status = data.status ?? (data.check_in ? (late > 0 ? 'Atrasado' : 'No horário') : 'Ausente');

    const { rows } = await query(
      `INSERT INTO attendance
         (member_id, work_date, check_in, check_out, status, late_minutes, early_leave_minutes, method, checked_in_by, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'manual', $8, $9)
       ON CONFLICT (member_id, work_date) DO UPDATE SET
         check_in = EXCLUDED.check_in,
         check_out = EXCLUDED.check_out,
         status = EXCLUDED.status,
         late_minutes = EXCLUDED.late_minutes,
         early_leave_minutes = EXCLUDED.early_leave_minutes,
         method = 'manual',
         notes = EXCLUDED.notes
       RETURNING id`,
      [
        data.member_id, data.work_date, data.check_in || null, data.check_out || null,
        status, late, early, req.user.id, data.notes ?? null,
      ],
    );

    const { rows: full } = await query(`SELECT ${RECORD_SELECT} ${RECORD_FROM} WHERE a.id = $1`, [rows[0].id]);
    res.status(201).json(full[0]);
  }),
);

attendanceRouter.delete(
  '/:id',
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const { rowCount } = await query('DELETE FROM attendance WHERE id = $1', [req.params.id]);
    if (!rowCount) throw ApiError.notFound('Registo não encontrado');
    res.status(204).end();
  }),
);

/** Últimas leituras, incluindo recusadas — auditoria do posto de controlo. */
attendanceRouter.get(
  '/scan-log',
  requireRole('admin', 'gestor'),
  asyncHandler(async (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const { rows } = await query(
      `SELECT s.id::INT AS id, s.action, s.message, s.created_at, s.raw_code,
              m.full_name, m.internal_code, u.name AS operator_name
         FROM scan_log s
         LEFT JOIN members m ON m.id = s.member_id
         LEFT JOIN users u ON u.id = s.user_id
        ORDER BY s.created_at DESC
        LIMIT $1`,
      [limit],
    );
    res.json(rows);
  }),
);
