-- users table (doctors/patients)
CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text UNIQUE NOT NULL,
  role text NOT NULL, -- 'doctor' or 'patient'
  password_hash text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- appointments
CREATE TABLE appointments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id uuid REFERENCES users(id),
  patient_id uuid REFERENCES users(id),
  scheduled_at timestamptz,
  status text,
  created_at timestamptz DEFAULT now()
);

-- audio recordings metadata
CREATE TABLE recordings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id uuid REFERENCES appointments(id),
  s3_key text NOT NULL, -- encrypted file path
  kms_encrypted_key bytea NOT NULL, -- data key encrypted by KMS
  length_seconds integer,
  created_by uuid REFERENCES users(id),
  created_at timestamptz DEFAULT now(),
  status text DEFAULT 'uploaded' -- 'uploaded','processing','transcribed','failed'
);

-- AI-generated draft prescriptions
CREATE TABLE ai_prescriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recording_id uuid REFERENCES recordings(id),
  appointment_id uuid REFERENCES appointments(id),
  generated_by text, -- 'ai' or 'human'
  draft_text text,
  structured jsonb, -- parsed meds, dosages, durations
  status text DEFAULT 'draft', -- 'draft','approved','rejected'
  created_at timestamptz DEFAULT now(),
  reviewed_by uuid REFERENCES users(id),
  reviewed_at timestamptz
);
