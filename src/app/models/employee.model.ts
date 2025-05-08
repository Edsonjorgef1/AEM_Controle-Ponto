export interface Employee {
  id?: string;
  name: string;
  position: string;
  internal_code: string; // Changed from internalCode
  department: 'Administracao' | 'Informatica' | 'Costura' | 'Projecto' | 'Direccao' | 'Seguranca';
  created_at?: string;
}

export interface Attendance {
  id?: string;
  employee_id: string;  // Changed from employeeId
  date: Date;
  check_in: string;    // Changed from timeIn
  check_out?: string;
  status: 'Entrada' | 'Em exercício' | 'Saída' | 'Atrasado' | 'No horário' | 'Ausente' | 'Justificado';
  late_minutes?: number;
  observations?: string;
  auth_method?: 'code' | 'face' | 'fingerprint';
  created_at?: Date;
  updated_at?: Date;
}

export interface WorkSchedule {
  id?: string;
  start_time: string;  // Changed from startTime
  end_time: string;    // Changed from endTime
  work_days: number[];
  created_at?: string;
}