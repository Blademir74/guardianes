-- INTERVENCIÓN CRÍTICA DE DATOS: Guerrero Guardianes
-- PROPÓSITO: Restaurar visibilidad de candidatos y sanitizar duplicados.

-- 1. Asegurar que los candidatos de Chilpancingo (municipio 18) sean visibles
-- en los filtros de la API que buscan election_type = 'municipal'
UPDATE candidates 
SET election_type = 'municipal' 
WHERE municipality_id = 18;

-- 2. Eliminar registros duplicados/basura en municipio ficticio 183
DELETE FROM candidates 
WHERE municipality_id = 183;

-- 3. Verificación de integridad
SELECT id, name, party, election_type 
FROM candidates 
WHERE municipality_id = 18;
