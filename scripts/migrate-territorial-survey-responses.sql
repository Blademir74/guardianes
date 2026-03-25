-- Migración Territorial (Caja Negra Democrática)
-- Agrega metadatos de validación geográfica SIN datos personales.
-- Ligado únicamente a fingerprint_id (ya existente en survey_responses).

ALTER TABLE survey_responses
  ADD COLUMN IF NOT EXISTS latitude DECIMAL(10, 8),
  ADD COLUMN IF NOT EXISTS longitude DECIMAL(11, 8),
  ADD COLUMN IF NOT EXISTS location_status VARCHAR(32);

-- Índice para reportes rápidos por encuesta + calidad territorial
CREATE INDEX IF NOT EXISTS idx_survey_responses_location_status
  ON survey_responses (survey_id, location_status);

