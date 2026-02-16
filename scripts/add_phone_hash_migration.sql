-- Migración: agregar phone_hash a survey_responses para control de voto único
-- Ejecutar en Neon PostgreSQL

ALTER TABLE survey_responses ADD COLUMN IF NOT EXISTS phone_hash VARCHAR(64);

-- Índice compuesto para búsqueda rápida de voto duplicado
CREATE INDEX IF NOT EXISTS idx_survey_responses_phone_hash 
  ON survey_responses(survey_id, phone_hash) 
  WHERE phone_hash IS NOT NULL;

-- Verificar
SELECT column_name, data_type FROM information_schema.columns 
WHERE table_name = 'survey_responses' AND column_name = 'phone_hash';
