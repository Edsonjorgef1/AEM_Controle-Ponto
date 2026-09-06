/** "HH:MM" ou "HH:MM:SS" -> minutos desde a meia-noite. */
export function toMinutes(time) {
  if (!time) return null;
  const [h, m] = String(time).split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

/** Date -> "HH:MM:SS" na hora local do servidor. */
export function timeOfDay(date = new Date()) {
  return date.toTimeString().slice(0, 8);
}

/** Date -> "YYYY-MM-DD" na hora local do servidor (sem deslocação UTC). */
export function isoDate(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Minutos de atraso à entrada, descontando a tolerância configurada.
 * Devolve 0 quando a pessoa chegou dentro do horário.
 */
export function lateMinutes(checkIn, startTime, toleranceMinutes = 0) {
  const inMin = toMinutes(checkIn);
  const startMin = toMinutes(startTime);
  if (inMin === null || startMin === null) return 0;
  return Math.max(0, inMin - startMin - toleranceMinutes);
}

/** Minutos de saída antecipada face ao fim do horário. */
export function earlyLeaveMinutes(checkOut, endTime) {
  const outMin = toMinutes(checkOut);
  const endMin = toMinutes(endTime);
  if (outMin === null || endMin === null) return 0;
  return Math.max(0, endMin - outMin);
}

/** Minutos trabalhados entre entrada e saída. */
export function workedMinutes(checkIn, checkOut) {
  const inMin = toMinutes(checkIn);
  const outMin = toMinutes(checkOut);
  if (inMin === null || outMin === null) return 0;
  return Math.max(0, outMin - inMin);
}

/** 245 -> "4h05". */
export function formatMinutes(total) {
  const minutes = Math.max(0, Math.round(total || 0));
  return `${Math.floor(minutes / 60)}h${String(minutes % 60).padStart(2, '0')}`;
}

/** Dia da semana no formato usado em work_days: 1 = segunda ... 7 = domingo. */
export function isoWeekday(date = new Date()) {
  return date.getDay() === 0 ? 7 : date.getDay();
}
