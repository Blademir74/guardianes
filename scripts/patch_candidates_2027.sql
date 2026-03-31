-- scripts/patch_candidates_2027.sql
-- Intervención quirúrgica: Limpieza profunda y registro oficial de aspirantes 2027

DO $$ 
BEGIN
    -- 1. Eliminar candidatos "fantasmas" de Gubernatura (muni NULL)
    -- Esto remueve cualquier registro de hace meses que esté causando ruido.
    DELETE FROM candidates 
    WHERE (municipality_id IS NULL) 
      AND (election_type IS NULL OR election_type = 'gubernatura');

    -- 2. Insertar Aspirantes Mujeres Líderes + Indeciso (Gubernatura 2027)
    -- Nota: election_type='gubernatura', municipality_id=NULL
    INSERT INTO candidates (name, party, gender, is_active, election_type, municipality_id) VALUES
    ('Karen Castrejón Trujillo', 'PVEM', 'F', true, 'gubernatura', NULL),
    ('Beatriz Mojica Morga', 'Morena', 'F', true, 'gubernatura', NULL),
    ('Esthela Damián Peralta', 'Morena', 'F', true, 'gubernatura', NULL),
    ('Abelina López Rodríguez', 'Morena', 'F', true, 'gubernatura', NULL),
    ('Yesenia Galarza Castro', 'PAN', 'F', true, 'gubernatura', NULL),
    ('Indeciso', 'CIUDADANO', 'NB', true, 'gubernatura', NULL);

    -- 3. Asegurar integridad en encuestas antiguas
    -- Marcar como inactivas todas las encuestas con más de 60 días
    UPDATE surveys 
    SET is_active = false, active = false 
    WHERE created_at < NOW() - INTERVAL '60 days';

END $$;

-- Verificación de limpieza
SELECT id, name, party, election_type 
FROM candidates 
WHERE municipality_id IS NULL;
