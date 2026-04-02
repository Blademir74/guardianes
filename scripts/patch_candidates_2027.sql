-- scripts/patch_candidates_2027.sql
-- Intervención quirúrgica: Limpieza profunda y registro oficial de aspirantes 2027 con FOTOS

DO $$ 
BEGIN
    -- 1. Eliminar candidatos "fantasmas" de Gubernatura (muni NULL)
    DELETE FROM candidates 
    WHERE (municipality_id IS NULL) 
      AND (election_type IS NULL OR election_type = 'gubernatura');

    -- 2. Insertar Aspirantes Mujeres Líderes + Indeciso (Gubernatura 2027) con URLs de Imagen Reales
    INSERT INTO candidates (name, party, gender, is_active, election_type, municipality_id, photo_url) VALUES
    ('Karen Castrejón Trujillo', 'PVEM', 'F', true, 'gubernatura', NULL, 'https://i.ibb.co/kVyCR0Wn/karen-castrejon.jpg'),
    ('Beatriz Mojica Morga', 'Morena', 'F', true, 'gubernatura', NULL, 'https://i.ibb.co/Hfdw3DdZ/Beatriz.jpg'),
    ('Esthela Damián Peralta', 'Morena', 'F', true, 'gubernatura', NULL, 'https://i.ibb.co/RkX5Tb3V/esthela-damian.jpg'),
    ('Abelina López Rodríguez', 'Morena', 'F', true, 'gubernatura', NULL, 'https://i.ibb.co/G3cwx4Bv/abelina-lopez.jpg'),
    ('Yesenia Galarza Castro', 'PAN', 'F', true, 'gubernatura', NULL, 'https://i.ibb.co/k26SCnxB/yesenia.jpg'),
    ('Indeciso', 'CIUDADANO', 'NB', true, 'gubernatura', NULL, 'https://i.ibb.co/zTPzGm3x/indeciso.jpg');

    -- 3. Asegurar integridad en encuestas antiguas
    UPDATE surveys 
    SET is_active = false, active = false 
    WHERE created_at < NOW() - INTERVAL '60 days';

END $$;

-- Verificación de limpieza y fotos
SELECT id, name, party, photo_url 
FROM candidates 
WHERE municipality_id IS NULL;
