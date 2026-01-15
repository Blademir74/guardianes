-- backend/surveys-schema.sql
-- Sistema de encuestas para Guardianes Guerrero

-- ========================================
-- TABLA: surveys (Encuestas)
-- ========================================
CREATE TABLE IF NOT EXISTS surveys (
  id SERIAL PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  election_type VARCHAR(50), -- 'gubernatura', 'ayuntamiento', 'diputacion', 'senado'
  start_date TIMESTAMP NOT NULL,
  end_date TIMESTAMP,
  is_active BOOLEAN DEFAULT false,
  is_public BOOLEAN DEFAULT true,
  allow_anonymous BOOLEAN DEFAULT true,
  max_responses_per_user INTEGER DEFAULT 1,
  created_by INTEGER REFERENCES admins(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  -- Validación de fechas
  CONSTRAINT valid_dates CHECK (end_date IS NULL OR end_date > start_date)
);

-- ========================================
-- TABLA: survey_questions (Preguntas)
-- ========================================
CREATE TABLE IF NOT EXISTS survey_questions (
  id SERIAL PRIMARY KEY,
  survey_id INTEGER NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
  question_text TEXT NOT NULL,
  question_type VARCHAR(20) NOT NULL, -- 'single_choice', 'multiple_choice', 'confidence_scale', 'text'
  options JSONB, -- Array de opciones: [{"value": "candidato1", "label": "Juan Pérez"}, ...]
  is_required BOOLEAN DEFAULT true,
  order_num INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  
  CONSTRAINT valid_question_type CHECK (question_type IN ('single_choice', 'multiple_choice', 'confidence_scale', 'text'))
);

-- ========================================
-- TABLA: survey_responses (Respuestas)
-- ========================================
CREATE TABLE IF NOT EXISTS survey_responses (
  id BIGSERIAL PRIMARY KEY,
  survey_id INTEGER NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
  question_id INTEGER NOT NULL REFERENCES survey_questions(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL, -- NULL si es anónimo
  response_value TEXT NOT NULL, -- Puede ser JSON string para múltiples respuestas
  confidence INTEGER, -- Solo para confidence_scale (50-100)
  ip_address VARCHAR(45), -- Para detección de duplicados
  user_agent TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- ========================================
-- ÍNDICES
-- ========================================
CREATE INDEX IF NOT EXISTS idx_surveys_active ON surveys(is_active);
CREATE INDEX IF NOT EXISTS idx_surveys_public ON surveys(is_public);
CREATE INDEX IF NOT EXISTS idx_surveys_dates ON surveys(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_surveys_election_type ON surveys(election_type);

CREATE INDEX IF NOT EXISTS idx_questions_survey ON survey_questions(survey_id);
CREATE INDEX IF NOT EXISTS idx_questions_order ON survey_questions(survey_id, order_num);

CREATE INDEX IF NOT EXISTS idx_responses_survey ON survey_responses(survey_id);
CREATE INDEX IF NOT EXISTS idx_responses_question ON survey_responses(question_id);
CREATE INDEX IF NOT EXISTS idx_responses_user ON survey_responses(user_id);
CREATE INDEX IF NOT EXISTS idx_responses_created ON survey_responses(created_at);

-- ========================================
-- FUNCIÓN: Actualizar updated_at automáticamente
-- ========================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger para surveys
CREATE TRIGGER update_surveys_updated_at BEFORE UPDATE ON surveys
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ========================================
-- VISTA: survey_stats (Estadísticas rápidas)
-- ========================================
CREATE OR REPLACE VIEW survey_stats AS
SELECT 
    s.id,
    s.title,
    s.is_active,
    COUNT(DISTINCT sr.user_id) as unique_respondents,
    COUNT(sr.id) as total_responses,
    COUNT(DISTINCT sq.id) as total_questions,
    MIN(sr.created_at) as first_response_at,
    MAX(sr.created_at) as last_response_at
FROM surveys s
LEFT JOIN survey_questions sq ON sq.survey_id = s.id
LEFT JOIN survey_responses sr ON sr.survey_id = s.id
GROUP BY s.id, s.title, s.is_active;

-- ========================================
-- DATOS DE EJEMPLO (OPCIONAL - SOLO DESARROLLO)
-- ========================================
-- Descomentar para insertar encuesta de ejemplo

/*
-- Encuesta piloto Gubernatura 2027
INSERT INTO surveys (title, description, election_type, start_date, is_active, is_public, created_by)
VALUES (
  'Predicción Gubernatura Guerrero 2027',
  'Encuesta piloto para medir intención de voto ciudadana',
  'gubernatura',
  NOW(),
  true,
  true,
  (SELECT id FROM admins LIMIT 1)
) RETURNING id;

-- Suponiendo que el ID generado es 1
INSERT INTO survey_questions (survey_id, question_text, question_type, options, order_num) VALUES
(1, '¿Quién crees que ganará la gubernatura de Guerrero en 2027?', 'single_choice', 
 '[
   {"value": "beatriz_mojica", "label": "Beatriz Mojica Morga (MORENA)"},
   {"value": "felix_salgado", "label": "Félix Salgado Macedonio (MORENA)"},
   {"value": "manuel_anorve", "label": "Manuel Añorve Baños (PRI)"},
   {"value": "karen_castrejon", "label": "Karen Castrejón Trujillo (PVEM)"},
   {"value": "eloy_salmeron", "label": "Eloy Salmerón Díaz (PAN)"},
   {"value": "julian_lopez", "label": "Julián López Galeana (MC)"},
   {"value": "pedro_segura", "label": "Pedro Segura Valladares (Independiente)"},
   {"value": "otro", "label": "Otro candidato"}
 ]'::jsonb,
 1),
(1, '¿Qué tan seguro estás de tu predicción?', 'confidence_scale', NULL, 2);
*/

-- ========================================
-- COMENTARIOS (DOCUMENTACIÓN)
-- ========================================
COMMENT ON TABLE surveys IS 'Encuestas electorales creadas por administradores';
COMMENT ON COLUMN surveys.allow_anonymous IS 'Si true, permite respuestas sin autenticación';
COMMENT ON COLUMN surveys.max_responses_per_user IS 'Máximo de veces que un usuario puede responder';

COMMENT ON TABLE survey_questions IS 'Preguntas de cada encuesta';
COMMENT ON COLUMN survey_questions.options IS 'Array JSON de opciones para preguntas de selección';

COMMENT ON TABLE survey_responses IS 'Respuestas de usuarios a encuestas';
COMMENT ON COLUMN survey_responses.response_value IS 'Valor de la respuesta (puede ser JSON para múltiples opciones)';

-- ========================================
-- VERIFICACIÓN
-- ========================================
-- Listar tablas creadas
\dt surveys*

-- Ver estructura
\d surveys
\d survey_questions
\d survey_responses

-- Ver vista
\d survey_stats