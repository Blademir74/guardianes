-- scripts/migration_surveys_v2.sql
-- Intervención quirúrgica para corregir Error 500 y habilitar Sellos de Seguridad de manera segura (idempotente)

DO $$ 
BEGIN
    -- 1. Asegurar columnas en surveys
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='surveys' AND column_name='active') THEN
        ALTER TABLE surveys ADD COLUMN active BOOLEAN DEFAULT true;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='surveys' AND column_name='total_respondents') THEN
        ALTER TABLE surveys ADD COLUMN total_respondents INTEGER DEFAULT 0;
    END IF;

    -- 2. Crear tabla survey_options si no existe
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='survey_options') THEN
        CREATE TABLE survey_options (
            id SERIAL PRIMARY KEY,
            survey_id INTEGER NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
            option_label VARCHAR(255) NOT NULL,
            option_value VARCHAR(255) NOT NULL,
            photo_url TEXT,
            order_num INTEGER DEFAULT 1,
            created_at TIMESTAMP DEFAULT NOW()
        );
        CREATE INDEX idx_survey_options_survey ON survey_options(survey_id);
    END IF;

    -- 3. Asegurar columnas de integridad en survey_responses
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='survey_responses' AND column_name='integrity_hash') THEN
        ALTER TABLE survey_responses ADD COLUMN integrity_hash VARCHAR(255);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='survey_responses' AND column_name='fingerprint_id') THEN
        ALTER TABLE survey_responses ADD COLUMN fingerprint_id VARCHAR(255);
    END IF;

END $$;

COMMENT ON COLUMN surveys.total_respondents IS 'Contador denormalizado para el Dashboard Admin';
COMMENT ON TABLE survey_options IS 'Relación de opciones/candidatos para encuestas dinámicas';
