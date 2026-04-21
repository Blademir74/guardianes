-- ══════════════════════════════════════════════════════════════
-- migrations/001_integrity_columns.sql
-- Columnas de integridad para survey_responses
-- Extraídas del AUTO-HEAL que se ejecutaba en cada request de voto.
-- EJECUTAR UNA SOLA VEZ en la base de datos de producción.
-- ══════════════════════════════════════════════════════════════

-- Columnas de identidad y anti-fraude
ALTER TABLE survey_responses ADD COLUMN IF NOT EXISTS fingerprint_id VARCHAR(255);
ALTER TABLE survey_responses ADD COLUMN IF NOT EXISTS ip_address VARCHAR(45);
ALTER TABLE survey_responses ADD COLUMN IF NOT EXISTS phone_hash VARCHAR(255);

-- Columnas de geolocalización
ALTER TABLE survey_responses ADD COLUMN IF NOT EXISTS latitude DECIMAL(10, 8);
ALTER TABLE survey_responses ADD COLUMN IF NOT EXISTS longitude DECIMAL(11, 8);
ALTER TABLE survey_responses ADD COLUMN IF NOT EXISTS location_status VARCHAR(32);

-- Columnas de estructura territorial
ALTER TABLE survey_responses ADD COLUMN IF NOT EXISTS promoter_id VARCHAR(50);
ALTER TABLE survey_responses ADD COLUMN IF NOT EXISTS is_territorial_verified BOOLEAN DEFAULT FALSE;

-- Índice único para anti-doble-voto por huella digital
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_survey_fingerprint
ON survey_responses(survey_id, fingerprint_id)
WHERE fingerprint_id IS NOT NULL;

-- Índice para optimizar consultas de resultados por encuesta
CREATE INDEX IF NOT EXISTS idx_responses_survey_value
ON survey_responses(survey_id, response_value);

-- Índice para optimizar consultas de resultados con location_status
CREATE INDEX IF NOT EXISTS idx_responses_location
ON survey_responses(survey_id, location_status)
WHERE location_status IS NOT NULL;
