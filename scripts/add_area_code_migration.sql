-- Add area_code column to users table for better transparency
ALTER TABLE users ADD COLUMN area_code VARCHAR(3);

-- Optional: Backfill logic if possible (not possible without raw phone data, which we don't store)
