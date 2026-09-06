-- =============================================================================
-- Dados base: categorias predefinidas e horário global.
-- Idempotente — pode correr várias vezes sem duplicar.
-- =============================================================================

INSERT INTO categories (name, code_prefix, description, color) VALUES
  ('Funcionários', 'FUN', 'Pessoal administrativo e de apoio',        'primary'),
  ('Professores',  'PRO', 'Corpo docente',                            'tertiary'),
  ('Estudantes',   'EST', 'Alunos inscritos',                         'success'),
  ('Visitantes',   'VIS', 'Acesso temporário',                        'warning')
ON CONFLICT (name) DO NOTHING;

INSERT INTO work_schedules (category_id, start_time, end_time, tolerance_minutes, work_days)
SELECT NULL, '08:00', '16:00', 10, '{1,2,3,4,5}'
WHERE NOT EXISTS (SELECT 1 FROM work_schedules WHERE category_id IS NULL);
