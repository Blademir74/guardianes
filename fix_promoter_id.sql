-- Script de Blindaje de Base de Datos para Sistema Guardianes (Caso: promoter_id)
-- Ejecutar en la base de datos (Neon/PostgreSQL) para evitar Errores 500 al insertar votos masivos de líderes territoriales

BEGIN;

-- Ampliar el tamaño de promoter_id en la tabla survey_responses
-- (Por si el líder territorial usa un ref=CARLOS1246 u otro formato largo no anticipado)
ALTER TABLE survey_responses 
ALTER COLUMN promoter_id TYPE VARCHAR(255);

-- Opcional: También asegurarnos de que el índice sobre promoter_id no tenga problemas 
-- y mejorar consultas por territorialidad.
CREATE INDEX IF NOT EXISTS idx_survey_responses_promoter_id ON survey_responses(promoter_id);

COMMIT;

-- Comentario para registro de auditoría
COMMENT ON COLUMN survey_responses.promoter_id IS 'Identificador del líder territorial (ampliado a 255 caracteres para prevenir data truncation en cargas masivas)';
