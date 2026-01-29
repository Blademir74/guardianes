-- Añadir columnas faltantes y hacer start_date opcional
ALTER TABLE surveys ADD COLUMN IF NOT EXISTS municipality_id INTEGER REFERENCES municipalities(id) ON DELETE SET NULL;
ALTER TABLE surveys ADD COLUMN IF NOT EXISTS level VARCHAR(50) DEFAULT 'General';
ALTER TABLE surveys ALTER COLUMN start_date SET DEFAULT NOW();
ALTER TABLE surveys ALTER COLUMN start_date DROP NOT NULL;
