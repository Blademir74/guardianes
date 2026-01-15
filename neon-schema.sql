-- Schema completo para Guardianes Guerrero
-- Combinación de schema.sql y surveys-schema.sql

-- ========================================
-- TABLAS PRINCIPALES (Originales)
-- ========================================

-- Tabla de usuarios
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    phone_hash VARCHAR(255) UNIQUE NOT NULL,
    points INT DEFAULT 0,
    predictions_count INT DEFAULT 0,
    accuracy_pct FLOAT DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW(),
    last_active TIMESTAMP DEFAULT NOW()
);

-- Tabla de administradores
CREATE TABLE admins (
    id SERIAL PRIMARY KEY,
    username VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Tabla de elecciones
CREATE TABLE elections (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    election_type VARCHAR(100) NOT NULL,
    date DATE NOT NULL,
    is_active BOOLEAN DEFAULT true
);

-- Tabla de municipios
CREATE TABLE municipalities (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    state VARCHAR(100) DEFAULT 'Guerrero'
);

-- Tabla de candidatos
CREATE TABLE candidates (
    id SERIAL PRIMARY KEY,
    election_id INTEGER REFERENCES elections(id) ON DELETE CASCADE,
    municipality_id INTEGER REFERENCES municipalities(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    party VARCHAR(255)
);

-- Tabla de predicciones
CREATE TABLE predictions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    election_id INTEGER REFERENCES elections(id) ON DELETE CASCADE,
    municipality_id INTEGER REFERENCES municipalities(id) ON DELETE CASCADE,
    candidate_id INTEGER REFERENCES candidates(id) ON DELETE CASCADE,
    confidence INTEGER CHECK (confidence >= 0 AND confidence <= 100),
    created_at TIMESTAMP DEFAULT NOW()
);

-- Tabla de incidentes
CREATE TABLE incidents (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    municipality_id INTEGER REFERENCES municipalities(id) ON DELETE CASCADE,
    type VARCHAR(100) NOT NULL,
    description TEXT NOT NULL,
    latitude DECIMAL(10, 8),
    longitude DECIMAL(11, 8),
    photo_url VARCHAR(500),
    status VARCHAR(50) DEFAULT 'pending',
    verified_by INTEGER REFERENCES users(id),
    created_at TIMESTAMP DEFAULT NOW()
);

-- ========================================
-- TABLAS DE ENCUESTAS
-- ========================================

-- TABLA: surveys (Encuestas)
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

-- TABLA: survey_questions (Preguntas)
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

-- TABLA: survey_responses (Respuestas)
CREATE TABLE IF NOT EXISTS survey_responses (
  id BIGSERIAL PRIMARY KEY,
  survey_id INTEGER NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
  question_id INTEGER NOT NULL REFERENCES survey_questions(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL, -- NULL si es anónimo
  response_value TEXT NOT NULL, -- Puede ser JSON string para múltiples respuestas
  confidence INTEGER CHECK (confidence >= 0 AND confidence <= 100), -- Para preguntas de confianza
  created_at TIMESTAMP DEFAULT NOW()
);

-- ========================================
-- TABLAS ADICIONALES
-- ========================================

-- Tabla para el electorado por sección (desde INE_limpio.csv)
CREATE TABLE IF NOT EXISTS electorado_seccional (
    id SERIAL PRIMARY KEY,
    distrito_federal INT,
    clave_municipio INT,
    nombre_municipio VARCHAR(100),
    seccion VARCHAR(10) UNIQUE NOT NULL,
    lista_nominal_total INT,
    hombres_ln INT,
    mujeres_ln INT,
    -- Columnas de rangos de edad (Hombres/Mujeres)
    hombres_18 INT, mujeres_18 INT,
    hombres_19 INT, mujeres_19 INT,
    hombres_20_24 INT, mujeres_20_24 INT,
    hombres_25_29 INT, mujeres_25_29 INT,
    hombres_30_34 INT, mujeres_30_34 INT,
    hombres_35_39 INT, mujeres_35_39 INT,
    hombres_40_44 INT, mujeres_40_44 INT,
    hombres_45_49 INT, mujeres_45_49 INT,
    hombres_50_54 INT, mujeres_50_54 INT,
    hombres_55_59 INT, mujeres_55_59 INT,
    hombres_60_64 INT, mujeres_60_64 INT,
    hombres_65_mas INT, mujeres_65_mas INT
);

-- Tabla para resultados históricos (desde la carpeta Historico votaciones)
CREATE TABLE IF NOT EXISTS resultados_electorales (
    id SERIAL PRIMARY KEY,
    anio INT NOT NULL,
    tipo_eleccion VARCHAR(50) NOT NULL, -- 'Ayuntamiento', 'Diputación Local', 'Gubernatura'
    distrito_local INT,
    ambito_nombre VARCHAR(255) NOT NULL, -- '001 - Acapulco - 0001'
    votos_pan INT DEFAULT 0,
    votos_pri INT DEFAULT 0,
    votos_prd INT DEFAULT 0,
    votos_pvem INT DEFAULT 0,
    votos_pt INT DEFAULT 0,
    votos_mc INT DEFAULT 0,
    votos_na INT DEFAULT 0,
    votos_morena INT DEFAULT 0,
    votos_validos INT DEFAULT 0,
    votos_nulos INT DEFAULT 0,
    total_votos INT DEFAULT 0,
    lista_nominal INT DEFAULT 0
);

-- ========================================
-- ÍNDICES PARA MEJORAR RENDIMIENTO
-- ========================================
CREATE INDEX IF NOT EXISTS idx_users_phone_hash ON users(phone_hash);
CREATE INDEX IF NOT EXISTS idx_predictions_user_id ON predictions(user_id);
CREATE INDEX IF NOT EXISTS idx_predictions_election_municipality ON predictions(election_id, municipality_id);
CREATE INDEX IF NOT EXISTS idx_incidents_municipality_id ON incidents(municipality_id);
CREATE INDEX IF NOT EXISTS idx_incidents_status ON incidents(status);
CREATE INDEX IF NOT EXISTS idx_candidates_election_municipality ON candidates(election_id, municipality_id);

-- Índices para encuestas
CREATE INDEX IF NOT EXISTS idx_surveys_active ON surveys(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_survey_responses_survey_user ON survey_responses(survey_id, user_id);
CREATE INDEX IF NOT EXISTS idx_survey_questions_survey ON survey_questions(survey_id, order_num);

-- Índices para resultados electorales
CREATE INDEX IF NOT EXISTS idx_resultados_anio_tipo ON resultados_electorales(anio, tipo_eleccion);
CREATE INDEX IF NOT EXISTS idx_resultados_ambito ON resultados_electorales(ambito_nombre);

-- ========================================
-- DATOS INICIALES
-- ========================================

-- Administrador por defecto (contraseña: admin123)
INSERT INTO admins (username, password_hash) VALUES
('admin', '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi')
ON CONFLICT (username) DO NOTHING;

-- Elección activa por defecto
INSERT INTO elections (name, election_type, date, is_active) VALUES
('Elecciones Estatales 2027', 'Gubernatura', '2027-06-06', true)
ON CONFLICT DO NOTHING;