export type Role = 'admin' | 'gestor' | 'operador';

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  active?: boolean;
  last_login_at?: string | null;
  created_at?: string;
}

export interface Category {
  id: number;
  name: string;
  code_prefix: string;
  description?: string | null;
  color: string;
  active: boolean;
  members_count?: number;
}

/** Pessoa registada cujo ponto é controlado (funcionário, professor, estudante...). */
export interface Member {
  id: string;
  full_name: string;
  category_id: number;
  internal_code: string;
  qr_token: string;
  position?: string | null;
  department?: string | null;
  email?: string | null;
  phone?: string | null;
  active: boolean;
  created_at?: string;
  category_name: string;
  category_prefix?: string;
  category_color: string;
}

export type AttendanceStatus = 'No horário' | 'Atrasado' | 'Ausente' | 'Justificado';

export interface AttendanceRecord {
  id: string;
  member_id: string;
  work_date: string;
  check_in: string | null;
  check_out: string | null;
  status: AttendanceStatus;
  late_minutes: number;
  early_leave_minutes: number;
  method: 'qrcode' | 'codigo' | 'manual';
  notes?: string | null;
  full_name: string;
  internal_code: string;
  position?: string | null;
  department?: string | null;
  category_id: number;
  category_name: string;
  category_color: string;
}

export interface ScanResult {
  action: 'entrada' | 'saida';
  message: string;
  record: AttendanceRecord;
}

export interface WorkSchedule {
  id?: string;
  category_id: number | null;
  category_name?: string | null;
  start_time: string;
  end_time: string;
  tolerance_minutes: number;
  work_days: number[];
}

export interface ReportRow {
  member_id: string;
  full_name: string;
  internal_code: string;
  position?: string | null;
  department?: string | null;
  category_id: number;
  category_name: string;
  category_color: string;
  expected_days: number;
  present_days: number;
  absent_days: number;
  justified_days: number;
  late_days: number;
  late_minutes: number;
  early_leave_days: number;
  early_leave_minutes: number;
  open_days: number;
  worked_minutes: number;
  worked_hours: string;
  late_hours: string;
  attendance_rate: number;
}

export interface ReportSummary {
  period: { from: string; to: string };
  totals: {
    members: number;
    present_days: number;
    absent_days: number;
    late_days: number;
    late_minutes: number;
    worked_minutes: number;
    worked_hours: string;
    late_hours: string;
  };
  items: ReportRow[];
}

export interface Dashboard {
  date: string;
  totals: { total_members: number; present: number; late: number; inside: number; absent: number };
  by_category: { id: number; name: string; color: string; total_members: number; present: number; late: number; inside: number }[];
  recent: {
    id: string;
    check_in: string | null;
    check_out: string | null;
    status: AttendanceStatus;
    late_minutes: number;
    full_name: string;
    internal_code: string;
    category_name: string;
    category_color: string;
  }[];
}

export interface Paged<T> {
  total: number;
  limit: number;
  offset: number;
  items: T[];
}
