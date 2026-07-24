CREATE TABLE IF NOT EXISTS patients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    external_ref TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID REFERENCES patients(id),
    status TEXT NOT NULL DEFAULT 'created',
    raw_audio_path TEXT,
    patient_audio_path TEXT,
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
    created_at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE IF NOT EXISTS doctor_voice_profiles (
    doctor_id UUID PRIMARY KEY REFERENCES users(id),
    embedding FLOAT8[] NOT NULL,        -- vecteur d'embedding (ex: 192 dims ECAPA-TDNN)
    created_at TIMESTAMPTZ DEFAULT now()
);