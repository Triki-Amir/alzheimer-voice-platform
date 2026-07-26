-- Migration: ajoute les champs 2FA sur `users` et l'identité + médecin
-- référent sur `patients`. À exécuter manuellement si la base Postgres
-- existe déjà (init.sql ne tourne qu'une fois, au premier démarrage du
-- volume Postgres).
--
-- Usage :
--   docker compose exec -T postgres psql -U $POSTGRES_USER -d $POSTGRES_DB \
--     < infra/postgres/migrations/002_add_2fa_and_patient_fields.sql

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS full_name TEXT,
    ADD COLUMN IF NOT EXISTS totp_secret TEXT,
    ADD COLUMN IF NOT EXISTS totp_enabled BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS backup_codes TEXT;

ALTER TABLE patients
    ADD COLUMN IF NOT EXISTS first_name TEXT,
    ADD COLUMN IF NOT EXISTS last_name TEXT,
    ADD COLUMN IF NOT EXISTS date_of_birth DATE,
    ADD COLUMN IF NOT EXISTS doctor_id UUID;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'fk_patients_doctor'
    ) THEN
        ALTER TABLE patients
            ADD CONSTRAINT fk_patients_doctor
            FOREIGN KEY (doctor_id) REFERENCES users(id);
    END IF;
END $$;
