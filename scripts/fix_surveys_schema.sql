-- Fix surveys table schema to match code expectations

-- 1. Add municipality_id if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'surveys' 
        AND column_name = 'municipality_id'
    ) THEN
        ALTER TABLE surveys ADD COLUMN municipality_id INTEGER REFERENCES municipalities(id);
    END IF;
END $$;

-- 2. Add election_type if it doesn't exist (it appeared in surveys-schema.sql but verification is good)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'surveys' 
        AND column_name = 'election_type'
    ) THEN
        ALTER TABLE surveys ADD COLUMN election_type VARCHAR(50);
    END IF;
END $$;
