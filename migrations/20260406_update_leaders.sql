-- migrations/20260406_update_leaders.sql
-- GUARDIANES GUERRERO - INTERVENCIÓN QUIRÚRGICA: LÍDERES Y ESTRUCTURAS

-- 1. Agregar columnas a la tabla survey_responses
-- promoter_id: Identificador del líder que refiere el voto
-- is_territorial_verified: Bandera para votos validados geográficamente
ALTER TABLE survey_responses ADD COLUMN IF NOT EXISTS promoter_id VARCHAR(50);
ALTER TABLE survey_responses ADD COLUMN IF NOT EXISTS is_territorial_verified BOOLEAN DEFAULT FALSE;

-- 2. Crear tabla de promotores (Estructura de Líderes)
-- Relaciona un promoter_id con una sección electoral específica.
CREATE TABLE IF NOT EXISTS promoters (
    id SERIAL PRIMARY KEY,
    promoter_id VARCHAR(50) UNIQUE NOT NULL,
    seccion VARCHAR(10) NOT NULL,
    name VARCHAR(100),
    municipality_id INTEGER,
    created_at TIMESTAMP DEFAULT NOW()
);

-- 3. Índices para optimizar el Monitoreo de Estructuras
CREATE INDEX IF NOT EXISTS idx_survey_responses_promoter ON survey_responses(promoter_id);
CREATE INDEX IF NOT EXISTS idx_promoters_id ON promoters(promoter_id);
CREATE INDEX IF NOT EXISTS idx_promoters_seccion ON promoters(seccion);

-- 4. Inserción de ejemplo (Líder Carlos referido en el prompt)
-- CARLOS1246 vinculado a la sección 1246 (ejemplo)
INSERT INTO promoters (promoter_id, seccion, name) 
VALUES ('CARLOS1246', '1246', 'Carlos L.')
ON CONFLICT (promoter_id) DO NOTHING;
