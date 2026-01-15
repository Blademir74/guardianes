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

-- Índices para mejorar el rendimiento
CREATE INDEX idx_users_phone_hash ON users(phone_hash);
CREATE INDEX idx_predictions_user_id ON predictions(user_id);
CREATE INDEX idx_predictions_election_municipality ON predictions(election_id, municipality_id);
CREATE INDEX idx_incidents_municipality_id ON incidents(municipality_id);
CREATE INDEX idx_incidents_status ON incidents(status);
CREATE INDEX idx_candidates_election_municipality ON candidates(election_id, municipality_id);

-- Tabla para el electorado por sección (desde INE_limpio.csv)
-- Esta tabla nos da el "perfil" de quiénes pueden votar en cada sección.
CREATE TABLE IF NOT EXISTS electorado_seccional (
    id SERIAL PRIMARY KEY,
    distrito_federal INT,
    clave_municipio INT,
    nombre_municipio VARCHAR(100),
    seccion VARCHAR(10) UNIQUE NOT NULL, -- La sección es nuestro identificador único
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
-- Esta tabla nos dice "cómo votó" cada ámbito en cada elección.
CREATE TABLE IF NOT EXISTS resultados_electorales (
    id SERIAL PRIMARY KEY,
    anio INT NOT NULL,
    tipo_eleccion VARCHAR(50) NOT NULL, -- 'Ayuntamiento', 'Diputación Local', 'Gubernatura'
    distrito_local INT, -- Puede ser NULL en elecciones de gobernatura
    -- Esta columna almacenará el valor de "Municipio / clave municipio / sección"
    ambito_nombre VARCHAR(100), 
    -- Columnas de votos por partido
    votos_pan INT DEFAULT 0,
    votos_pri INT DEFAULT 0,
    votos_prd INT DEFAULT 0,
    votos_pvem INT DEFAULT 0,
    votos_pt INT DEFAULT 0,
    votos_mc INT DEFAULT 0,
    votos_na INT DEFAULT 0,
    votos_morena INT DEFAULT 0,
    -- Columnas de totales
    votos_validos INT DEFAULT 0,
    votos_nulos INT DEFAULT 0,
    total_votos INT DEFAULT 0,
    lista_nominal INT DEFAULT 0
);

-- Crear índices para optimizar las consultas
CREATE INDEX IF NOT EXISTS idx_electorado_seccion ON electorado_seccional(seccion);
CREATE INDEX IF NOT EXISTS idx_resultados_anio ON resultados_electorales(anio);
CREATE INDEX IF NOT EXISTS idx_resultados_tipo ON resultados_electorales(tipo_eleccion);
CREATE INDEX IF NOT EXISTS idx_resultados_ambito ON resultados_electorales(ambito_nombre);

-- Agregar a schema.sql
CREATE TABLE phone_verifications (
    id SERIAL PRIMARY KEY,
    phone_hash VARCHAR(255) NOT NULL,
    code VARCHAR(6) NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    verified BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_phone_verifications_hash ON phone_verifications(phone_hash);
CREATE INDEX idx_phone_verifications_expires ON phone_verifications(expires_at);

backend/admin-schema.sql
-- Tabla de administradores del sistema Guardianes Guerrero

-- ========================================
-- TABLA: admins
-- ========================================
CREATE TABLE IF NOT EXISTS admins (
  id SERIAL PRIMARY KEY,
  username VARCHAR(50) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(20) DEFAULT 'admin' CHECK (role IN ('admin', 'super_admin')),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  last_login TIMESTAMP,
  created_by INTEGER REFERENCES admins(id),
  CONSTRAINT username_format CHECK (username ~ '^[a-z0-9_]{3,50}$')
);

-- ========================================
-- ÍNDICES
-- ========================================
CREATE INDEX IF NOT EXISTS idx_admins_username ON admins(username);
CREATE INDEX IF NOT EXISTS idx_admins_active ON admins(is_active);
CREATE INDEX IF NOT EXISTS idx_admins_role ON admins(role);

-- ========================================
-- COLUMNAS ADICIONALES EN INCIDENTS
-- ========================================
-- Para tracking de verificación de incidentes por admins
ALTER TABLE incidents 
ADD COLUMN IF NOT EXISTS verified_by INTEGER REFERENCES admins(id),
ADD COLUMN IF NOT EXISTS verified_at TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_incidents_verified_by ON incidents(verified_by);

-- ========================================
-- COMENTARIOS (DOCUMENTACIÓN)
-- ========================================
COMMENT ON TABLE admins IS 'Administradores del sistema Guardianes Guerrero';
COMMENT ON COLUMN admins.username IS 'Username único para login (solo minúsculas, números y guiones bajos)';
COMMENT ON COLUMN admins.password_hash IS 'Hash bcrypt del password (NUNCA almacenar password en texto plano)';
COMMENT ON COLUMN admins.role IS 'Rol del admin: admin (permisos básicos) o super_admin (todos los permisos)';
COMMENT ON COLUMN admins.is_active IS 'Indica si el admin puede hacer login (permite desactivar sin borrar)';
COMMENT ON COLUMN admins.last_login IS 'Último acceso al dashboard';
COMMENT ON COLUMN admins.created_by IS 'ID del admin que creó esta cuenta (auditoría)';

-- ========================================
-- VERIFICACIÓN
-- ========================================
-- Mostrar tabla creada
\dt admins

-- Mostrar estructura
\d admins

-- Confirmar que está vacía
SELECT COUNT(*) as total_admins FROM admins;

COMMENT ON DATABASE guardianes_db IS 'Base de datos de Guardianes Guerrero - Sistema de predicciones electorales ciudadanas para Guerrero, México';