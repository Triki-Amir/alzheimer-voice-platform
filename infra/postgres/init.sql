CREATE TABLE IF NOT EXISTS patients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    external_ref TEXT,
    first_name TEXT not null,
    last_name TEXT not null,
    date_of_birth DATE,
    doctor_id UUID,  -- FK vers users(id) ajoutée plus bas (ordre de création des tables)
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID REFERENCES patients(id),
    status TEXT NOT NULL DEFAULT 'created',
    raw_audio_path TEXT,
    patient_audio_path TEXT,
    wrapped_data_key TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS session_features (
    session_id UUID REFERENCES sessions(id),
    feature_type TEXT NOT NULL,      -- 'acoustic' | 'linguistic' | 'fused'
    payload JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (session_id, feature_type)
);

CREATE TABLE IF NOT EXISTS session_results (
    session_id UUID REFERENCES sessions(id) PRIMARY KEY,
    prediction TEXT,
    probability FLOAT,
    shap_explanation JSONB,
    report_path TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT UNIQUE NOT NULL,
    hashed_password TEXT NOT NULL,
    role TEXT DEFAULT 'clinician',
    name TEXT not null,
    family_name TEXT not null,
    created_at TIMESTAMPTZ DEFAULT now(),
    -- Authentification à deux facteurs (TOTP)
    totp_secret TEXT,
    totp_enabled BOOLEAN NOT NULL DEFAULT false,
    backup_codes TEXT,

    failed_login_attempts INTEGER NOT NULL DEFAULT 0,

    locked_until TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS doctor_voice_profiles (
    doctor_id UUID PRIMARY KEY REFERENCES users(id),
    embedding FLOAT8[] NOT NULL,        -- vecteur d'embedding (ex: 192 dims ECAPA-TDNN)
    created_at TIMESTAMPTZ DEFAULT now()
);

-- patients.doctor_id référence users(id) : ajoutée ici car `users` est créée après `patients`
ALTER TABLE patients
    ADD CONSTRAINT fk_patients_doctor
    FOREIGN KEY (doctor_id) REFERENCES users(id);

CREATE TABLE IF NOT EXISTS audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_id UUID NOT NULL REFERENCES users(id),
    action VARCHAR NOT NULL,        -- ex: "delete_doctor", "view_audio"
    target_type VARCHAR,            -- ex: "doctor", "patient", "session"
    target_id UUID,
    details JSONB,                  -- contexte libre (ex: email supprime)
    created_at TIMESTAMPTZ DEFAULT now()
);