-- migrations/20260406_fix_active_column_unity.sql
-- 1. Sincronizar todos los estados: is_active será la única fuente de verdad.
UPDATE surveys SET is_active = active WHERE is_active IS NULL AND active IS NOT NULL;

-- 2. Asegurar que active sea falso para encuestas que ya fueron pausadas mediante is_active.
UPDATE surveys SET active = false WHERE is_active = false;

-- 3. (Opcional) Eliminar la redundancia lógica:
-- De ahora en adelante el código solo consulta is_active.
-- UPDATE surveys SET active = is_active;
