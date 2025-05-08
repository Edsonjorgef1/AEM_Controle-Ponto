-- Atualizar estrutura da tabela attendance
alter table attendance 
  alter column employee_id type uuid using employee_id::uuid,
  alter column date type date using date::date,
  alter column time_in type time using time_in::time,
  alter column late_minutes set default 0,
  alter column created_at set default timezone('utc'::text, now());

-- Adicionar índices para melhor performance
create index if not exists idx_attendance_employee_id on attendance(employee_id);
create index if not exists idx_attendance_date on attendance(date);

-- Garantir que políticas RLS estão corretas
alter table attendance enable row level security;

create policy "Allow authenticated users full access to attendance"
  on attendance
  for all
  to authenticated
  using (true)
  with check (true);
