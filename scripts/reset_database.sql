-- scripts/reset_database.sql
-- CUIDADO: Esto BORRA TODOS LOS DATOS

BEGIN;

-- Eliminar datos (respetando foreign keys)
TRUNCATE TABLE incidents CASCADE;
TRUNCATE TABLE predictions CASCADE;
TRUNCATE TABLE candidates CASCADE;
TRUNCATE TABLE elections CASCADE;
TRUNCATE TABLE municipalities CASCADE;
TRUNCATE TABLE users CASCADE;
TRUNCATE TABLE phone_verifications CASCADE;
TRUNCATE TABLE electorado_seccional CASCADE;
-- NO tocar resultados_electorales (datos históricos reales)

-- Reiniciar secuencias
ALTER SEQUENCE incidents_id_seq RESTART WITH 1;
ALTER SEQUENCE predictions_id_seq RESTART WITH 1;
ALTER SEQUENCE candidates_id_seq RESTART WITH 1;
ALTER SEQUENCE elections_id_seq RESTART WITH 1;
ALTER SEQUENCE municipalities_id_seq RESTART WITH 1;
ALTER SEQUENCE users_id_seq RESTART WITH 1;
ALTER SEQUENCE phone_verifications_id_seq RESTART WITH 1;

COMMIT;

SELECT 'Base de datos limpia. Ejecuta: node scripts/initialize_all.js' as mensaje;