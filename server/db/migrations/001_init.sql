-- =============================================================================
-- Sistema de Controlo de Ponto por QR Code
-- Esquema inicial da base de dados (PostgreSQL)
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- -----------------------------------------------------------------------------
-- users: contas de acesso ao sistema (login simplificado por email + palavra-passe)
--   admin    -> gere tudo, vê relatórios, configura o sistema
--   operador -> app móvel, apenas regista pontos via leitura de QR Code
--   gestor   -> consulta relatórios (somente leitura)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'operador'
                CHECK (role IN ('admin', 'gestor', 'operador')),
  active        BOOLEAN NOT NULL DEFAULT TRUE,
  last_login_at TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users (lower(email));

-- -----------------------------------------------------------------------------
-- categories: tipos de pessoas registadas (Funcionários, Professores, Estudantes...)
--   Configurável pelo administrador — novas categorias podem ser criadas.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS categories (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL UNIQUE,
  code_prefix TEXT NOT NULL UNIQUE CHECK (code_prefix ~ '^[A-Z]{2,5}$'),
  description TEXT,
  color       TEXT NOT NULL DEFAULT 'primary',
  active      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- -----------------------------------------------------------------------------
-- members: pessoas registadas cujo ponto é controlado.
--   Cada pessoa tem um código interno legível (ex.: FUN0007) e um qr_token
--   opaco que é o conteúdo real do QR Code (não expõe dados pessoais).
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS members (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name     TEXT NOT NULL,
  category_id   INTEGER NOT NULL REFERENCES categories (id) ON DELETE RESTRICT,
  internal_code TEXT NOT NULL UNIQUE,
  qr_token      TEXT NOT NULL UNIQUE,
  position      TEXT,               -- cargo / disciplina
  department    TEXT,               -- departamento / turma
  email         TEXT,
  phone         TEXT,
  active        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_members_category ON members (category_id);
CREATE INDEX IF NOT EXISTS idx_members_active ON members (active);
CREATE INDEX IF NOT EXISTS idx_members_name ON members (lower(full_name));

-- -----------------------------------------------------------------------------
-- attendance: um registo por pessoa por dia, com entrada e saída.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS attendance (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id           UUID NOT NULL REFERENCES members (id) ON DELETE CASCADE,
  work_date           DATE NOT NULL,
  check_in            TIME,
  check_out           TIME,
  status              TEXT NOT NULL DEFAULT 'No horário'
                      CHECK (status IN ('No horário', 'Atrasado', 'Ausente', 'Justificado')),
  late_minutes        INTEGER NOT NULL DEFAULT 0,
  early_leave_minutes INTEGER NOT NULL DEFAULT 0,
  method              TEXT NOT NULL DEFAULT 'qrcode'
                      CHECK (method IN ('qrcode', 'codigo', 'manual')),
  checked_in_by       UUID REFERENCES users (id) ON DELETE SET NULL,
  checked_out_by      UUID REFERENCES users (id) ON DELETE SET NULL,
  notes               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT attendance_member_day_unique UNIQUE (member_id, work_date)
);

CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendance (work_date DESC);
CREATE INDEX IF NOT EXISTS idx_attendance_member ON attendance (member_id);

-- -----------------------------------------------------------------------------
-- work_schedules: horário de trabalho. Um horário global (category_id NULL)
--   e, opcionalmente, um horário específico por categoria.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS work_schedules (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id       INTEGER UNIQUE REFERENCES categories (id) ON DELETE CASCADE,
  start_time        TIME NOT NULL DEFAULT '08:00',
  end_time          TIME NOT NULL DEFAULT '16:00',
  tolerance_minutes INTEGER NOT NULL DEFAULT 10 CHECK (tolerance_minutes >= 0),
  work_days         INTEGER[] NOT NULL DEFAULT '{1,2,3,4,5}',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Apenas um horário global pode existir.
CREATE UNIQUE INDEX IF NOT EXISTS idx_schedule_global
  ON work_schedules ((category_id IS NULL)) WHERE category_id IS NULL;

-- -----------------------------------------------------------------------------
-- scan_log: histórico completo de leituras (inclui tentativas recusadas),
--   útil para auditoria de quem leu o quê e quando.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS scan_log (
  id         BIGSERIAL PRIMARY KEY,
  member_id  UUID REFERENCES members (id) ON DELETE SET NULL,
  user_id    UUID REFERENCES users (id) ON DELETE SET NULL,
  raw_code   TEXT,
  action     TEXT NOT NULL CHECK (action IN ('entrada', 'saida', 'recusado')),
  message    TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_scan_log_created ON scan_log (created_at DESC);

-- -----------------------------------------------------------------------------
-- Trigger genérico para manter updated_at coerente.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['users', 'members', 'attendance', 'work_schedules'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%1$s_updated_at ON %1$s', t);
    EXECUTE format(
      'CREATE TRIGGER trg_%1$s_updated_at BEFORE UPDATE ON %1$s
       FOR EACH ROW EXECUTE FUNCTION set_updated_at()', t);
  END LOOP;
END $$;
