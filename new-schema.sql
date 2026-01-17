-- Schema Optimizado para Guerrero Guardianes 2027
-- Incluye: Auth Anónimo, Encuestas Dinámicas, Aspirantes Reales, Gamificación y Validación IEPC

-- ========================================
-- 1. USUARIOS Y AUTH (Totalmente Anónimo)
-- ========================================
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    phone_hash VARCHAR(255) UNIQUE NOT NULL, -- Hash Argon2/Scrypt del teléfono
    role VARCHAR(50) DEFAULT 'citizen', -- 'citizen', 'admin', 'verified_observer'
    points INT DEFAULT 0,
    rank_title VARCHAR(100) DEFAULT 'Ciudadano Vigilante',
    predictions_count INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW(),
    last_active TIMESTAMP DEFAULT NOW()
);

-- Tabla para verificar propiedad del teléfono (OTP) - Se limpia tras verificación
CREATE TABLE IF NOT EXISTS phone_verifications (
    id SERIAL PRIMARY KEY,
    phone_hash VARCHAR(255) NOT NULL,
    otp_code VARCHAR(6) NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    verified BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT NOW()
);

-- ========================================
-- 2. ELECCIONES Y CANDIDATOS (Real World Data)
-- ========================================
CREATE TABLE IF NOT EXISTS elections (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    type VARCHAR(100) NOT NULL, -- 'Gubernatura', 'Ayuntamiento', 'Diputacion'
    date DATE NOT NULL,
    is_active BOOLEAN DEFAULT true
);

CREATE TABLE IF NOT EXISTS municipalities (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    state VARCHAR(100) DEFAULT 'Guerrero',
    population_indigenous_pct FLOAT DEFAULT 0.0,
    population_afromexican_pct FLOAT DEFAULT 0.0
);

CREATE TABLE IF NOT EXISTS candidates (
    id SERIAL PRIMARY KEY,
    election_id INTEGER REFERENCES elections(id) ON DELETE CASCADE,
    municipality_id INTEGER REFERENCES municipalities(id) ON DELETE SET NULL, -- Null para Gubernatura
    name VARCHAR(255) NOT NULL,
    party VARCHAR(100) NOT NULL, -- 'MORENA', 'PRI', 'PVEM', 'INDEPENDIENTE', etc.
    gender VARCHAR(10) NOT NULL, -- 'M', 'F', 'NB'
    demographic_group VARCHAR(50) DEFAULT 'General', -- 'Indigena', 'Afromexicano', 'Joven', 'General'
    photo_url VARCHAR(500),
    is_active BOOLEAN DEFAULT true
);

-- ========================================
-- 3. ENCUESTAS DINÁMICAS
-- ========================================
CREATE TABLE IF NOT EXISTS surveys (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    start_date TIMESTAMP NOT NULL DEFAULT NOW(),
    end_date TIMESTAMP,
    is_active BOOLEAN DEFAULT true,
    created_by INTEGER REFERENCES users(id) -- Admin ID
);

CREATE TABLE IF NOT EXISTS survey_votes (
    id BIGSERIAL PRIMARY KEY,
    survey_id INTEGER REFERENCES surveys(id) ON DELETE CASCADE,
    candidate_id INTEGER REFERENCES candidates(id) ON DELETE CASCADE,
    user_hash VARCHAR(255) NOT NULL, -- Hash para evitar doble voto sin guardar ID directo si se prefiere
    municipality_id INTEGER REFERENCES municipalities(id),
    timestamp TIMESTAMP DEFAULT NOW(),
    metadata JSONB, -- Para guardar info extra si es necesario (sin PII)
    UNIQUE(survey_id, user_hash) -- Un voto por encuesta por teléfono
);

-- ========================================
-- 4. GAMIFICACIÓN E INCIDENTES
-- ========================================
CREATE TABLE IF NOT EXISTS incidents (
    id SERIAL PRIMARY KEY,
    user_hash VARCHAR(255) REFERENCES users(phone_hash) ON DELETE SET NULL, -- Referencia al hash
    type VARCHAR(100) NOT NULL, -- 'Compra de Votos', 'Violencia', 'Falta de Boletas'
    description TEXT NOT NULL,
    lat DECIMAL(10, 8),
    lng DECIMAL(11, 8),
    photo_url VARCHAR(500),
    status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'verified', 'rejected'
    created_at TIMESTAMP DEFAULT NOW()
);

-- ========================================
-- 5. SEED DATA (Aspirantes Reales)
-- ========================================
-- Insertar/Actualizar Elección 2027
INSERT INTO elections (name, type, date) VALUES 
('Gubernatura Guerrero 2027', 'Gubernatura', '2027-06-06')
ON CONFLICT DO NOTHING;

-- Insertar Candidatos Clave (Gubernatura)
-- Asumimos ID 1 para la elección de Gubernatura creada arriba (ajustar en lógica de backend si es dinámico)
DO $$
DECLARE
    elec_id INT;
BEGIN
    SELECT id INTO elec_id FROM elections WHERE name = 'Gubernatura Guerrero 2027' LIMIT 1;

    INSERT INTO candidates (election_id, name, party, gender, demographic_group) VALUES
    (elec_id, 'Félix Salgado Macedonio', 'MORENA', 'M', 'General'),
    (elec_id, 'Beatriz Mojica Morga', 'MORENA', 'F', 'Afromexicano'),
    (elec_id, 'Abelina López Rodríguez', 'MORENA', 'F', 'General'),
    (elec_id, 'Karen Castrejón Trujillo', 'PVEM', 'F', 'General'),
    (elec_id, 'Manuel Añorve Baños', 'PRI', 'M', 'General'),
    (elec_id, 'Pedro Segura', 'INDEPENDIENTE', 'M', 'General');
END $$;

-- Índices Optimización
CREATE INDEX idx_survey_votes_survey ON survey_votes(survey_id);
CREATE INDEX idx_incidents_coords ON incidents(lat, lng);
