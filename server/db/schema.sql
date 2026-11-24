CREATE TABLE IF NOT EXISTS departments (
  id SERIAL PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  phone TEXT, email TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('STUDENT','SECURITY','WARDEN','MEDICAL','ADMIN')),
  department_id INT REFERENCES departments(id),
  registration_no TEXT, hostel TEXT, phone TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  is_verified BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS password_resets (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE TABLE IF NOT EXISTS responders (
  id SERIAL PRIMARY KEY,
  user_id INT UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  department_id INT NOT NULL REFERENCES departments(id),
  availability TEXT NOT NULL DEFAULT 'AVAILABLE' CHECK (availability IN ('AVAILABLE','BUSY','OFFLINE')),
  max_workload INT NOT NULL DEFAULT 3
);
CREATE TABLE IF NOT EXISTS incidents (
  id SERIAL PRIMARY KEY,
  incident_reference TEXT UNIQUE NOT NULL,
  incident_type TEXT NOT NULL,
  incident_source TEXT NOT NULL CHECK (incident_source IN ('PUBLIC_SOS','AUTHENTICATED_COMPLAINT','SIMULATION')),
  student_id INT REFERENCES users(id),
  anonymous_session_id TEXT,
  department_id INT REFERENCES departments(id),
  supporting_department_id INT REFERENCES departments(id),
  assigned_responder_id INT REFERENCES responders(id) ON DELETE SET NULL,
  title TEXT, description TEXT,
  priority TEXT NOT NULL DEFAULT 'MEDIUM' CHECK (priority IN ('CRITICAL','HIGH','MEDIUM','LOW')),
  status TEXT NOT NULL,
  latitude DOUBLE PRECISION, longitude DOUBLE PRECISION, location_accuracy DOUBLE PRECISION,
  location_status TEXT NOT NULL DEFAULT 'UNAVAILABLE',
  manual_location TEXT, contact_info TEXT,
  is_confidential BOOLEAN NOT NULL DEFAULT FALSE,
  is_simulation BOOLEAN NOT NULL DEFAULT FALSE,
  is_delayed BOOLEAN NOT NULL DEFAULT FALSE,
  incident_time TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  acknowledged_at TIMESTAMPTZ, assigned_at TIMESTAMPTZ, resolved_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ, cancelled_at TIMESTAMPTZ, escalated_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_inc_dept ON incidents(department_id, status);
CREATE INDEX IF NOT EXISTS idx_inc_support ON incidents(supporting_department_id);
CREATE INDEX IF NOT EXISTS idx_inc_student ON incidents(student_id);
CREATE INDEX IF NOT EXISTS idx_inc_created ON incidents(created_at);
CREATE INDEX IF NOT EXISTS idx_inc_session ON incidents(anonymous_session_id);
CREATE TABLE IF NOT EXISTS incident_updates (
  id SERIAL PRIMARY KEY,
  incident_id INT NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  status TEXT, comment TEXT,
  is_internal BOOLEAN NOT NULL DEFAULT FALSE,
  actor_id INT REFERENCES users(id),
  actor_label TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_upd_inc ON incident_updates(incident_id, created_at);
CREATE TABLE IF NOT EXISTS incident_assignments (
  id SERIAL PRIMARY KEY,
  incident_id INT NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  responder_id INT NOT NULL REFERENCES responders(id),
  assigned_by INT REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','ACCEPTED','REJECTED','REASSIGNED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  responded_at TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS incident_messages (
  id SERIAL PRIMARY KEY,
  incident_id INT NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  sender_id INT NOT NULL REFERENCES users(id),
  body TEXT NOT NULL,
  is_internal BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS notifications (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL, body TEXT, type TEXT,
  incident_id INT REFERENCES incidents(id) ON DELETE CASCADE,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(user_id, is_read, created_at);
CREATE TABLE IF NOT EXISTS evidence_files (
  id SERIAL PRIMARY KEY,
  incident_id INT NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  uploaded_by INT REFERENCES users(id),
  original_name TEXT NOT NULL, stored_name TEXT NOT NULL,
  mime_type TEXT NOT NULL, size_bytes INT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS audit_logs (
  id SERIAL PRIMARY KEY,
  actor_id INT REFERENCES users(id),
  action TEXT NOT NULL, entity TEXT, entity_id TEXT,
  details JSONB, ip TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS emergency_contacts (
  id SERIAL PRIMARY KEY,
  label TEXT NOT NULL, category TEXT, phone TEXT,
  sort_order INT NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS department_routing_rules (
  id SERIAL PRIMARY KEY,
  incident_type TEXT UNIQUE NOT NULL,
  label TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('EMERGENCY','COMPLAINT','BOTH')),
  primary_department_id INT NOT NULL REFERENCES departments(id),
  supporting_department_id INT REFERENCES departments(id),
  default_priority TEXT NOT NULL DEFAULT 'MEDIUM',
  is_confidential BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE
);
CREATE TABLE IF NOT EXISTS escalation_rules (
  id SERIAL PRIMARY KEY,
  priority TEXT UNIQUE NOT NULL,
  ack_minutes INT NOT NULL
);
CREATE TABLE IF NOT EXISTS simulation_scenarios (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL, incident_type TEXT NOT NULL,
  description TEXT, instructions TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE
);
CREATE TABLE IF NOT EXISTS simulation_sessions (
  id SERIAL PRIMARY KEY,
  scenario_id INT NOT NULL REFERENCES simulation_scenarios(id),
  user_id INT NOT NULL REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'IN_PROGRESS',
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ, score INT
);
CREATE TABLE IF NOT EXISTS simulation_events (
  id SERIAL PRIMARY KEY,
  session_id INT NOT NULL REFERENCES simulation_sessions(id) ON DELETE CASCADE,
  step TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (session_id, step)
);
