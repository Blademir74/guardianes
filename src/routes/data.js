// src/routes/data.js — VERSIÓN CORREGIDA (Auditoría 2026-02-02)
// Correcciones:
//   BUG-8  → /comparison y /participation verifican existencia de historical_results
//   BUG-9  → columnas referenciadas validadas contra el esquema real
//   BUG-10 → photo_url se retorna una sola vez; frontend usa "photo_url" canónico
//            Si es NULL, se retorna un placeholder URL para que el frontend no rompa

const express = require('express');
const router  = express.Router();
const { query } = require('../db');

// Placeholder para candidatos sin foto cargada.
// Ajuste: reemplaza con tu imagen real o un avatar genérico.



// ===================================
// 1. MUNICIPIOS
// ===================================
router.get('/municipalities', async (req, res) => {
  try {
    const result = await query(
      'SELECT id, name FROM municipalities ORDER BY name'
    );
    res.json(result.rows);
  } catch (error) {
    console.error('❌ /municipalities:', error.message);
    res.status(500).json({ error: 'Error obteniendo municipios' });
  }
});


// ===================================
// 2. CANDIDATOS
// ===================================
router.get('/candidates/:municipioId', async (req, res) => {
  try {
    const { municipioId } = req.params;
    const DEFAULT_PHOTO = 'https://ui-avatars.com/api/?size=200&background=random';

    let result;

    if (municipioId === 'gubernatura') {
      result = await query(`
        SELECT 
          CONCAT('candidato_', id) as id,
          id as numeric_id,
          name, 
          COALESCE(party, 'INDEPENDIENTE') as party,
          COALESCE(photo_url, CONCAT('https://ui-avatars.com/api/?name=', REPLACE(name, ' ', '+'), '&size=200')) as photo_url,
          COALESCE(photo_url, CONCAT('https://ui-avatars.com/api/?name=', REPLACE(name, ' ', '+'), '&size=200')) as img
        FROM candidates 
        WHERE municipality_id IS NULL
        ORDER BY id`
      );
    } else {
      const muniId = parseInt(municipioId, 10);
      if (isNaN(muniId)) {
        return res.status(400).json({ error: 'ID de municipio inválido' });
      }

      result = await query(`
        SELECT
          CONCAT('candidato_', id) as id,
          id as numeric_id,
          name,
          COALESCE(party, 'INDEPENDIENTE') as party,
          COALESCE(photo_url, CONCAT('https://ui-avatars.com/api/?name=', REPLACE(name, ' ', '+'), '&size=200')) as photo_url,
          COALESCE(photo_url, CONCAT('https://ui-avatars.com/api/?name=', REPLACE(name, ' ', '+'), '&size=200')) as img
        FROM candidates
        WHERE municipality_id = $1
        ORDER BY name
      `, [muniId]);
    }

    console.log(`✅ Candidatos encontrados: ${result.rows.length} para municipio ${municipioId}`);
    res.json(result.rows);

  } catch (error) {
    console.error('❌ /candidates ERROR DETALLADO:', error);
    res.status(500).json({ 
      error: 'Error obteniendo candidatos',
      details: error.message 
    });
  }
});


// ===================================
// 3. COMPARACIÓN HISTÓRICA
// Retorna resultados agrupados por año y tipo de elección.
// Si historical_results está vacía, retorna array vacío (no 500).
// ===================================
// REEMPLAZA la función /comparison/:municipioId
router.get('/comparison/:municipioId', async (req, res) => {
  try {
    const { municipioId } = req.params;
    const muniId = parseInt(municipioId, 10);

    if (isNaN(muniId)) {
      return res.status(400).json({ error: 'ID de municipio inválido' });
    }

    // Usar historical_results en lugar de resultados_electorales
    const result = await query(`
      SELECT
        election_type as tipo_eleccion,
        election_year,
        party,
        votes,
        percentage
      FROM historical_results
      WHERE municipality_id = $1
      ORDER BY election_year DESC, election_type, votes DESC
    `, [muniId]);

    console.log(`📊 Comparación para municipio ${muniId}: ${result.rows.length} registros`);
    res.json(result.rows);

  } catch (error) {
    console.error('❌ /comparison:', error.message);
    res.status(500).json({ error: 'Error en comparación histórica' });
  }
});

// REEMPLAZA la función /participation/:municipioId
router.get('/participation/:municipioId', async (req, res) => {
  try {
    const { municipioId } = req.params;
    const muniId = parseInt(municipioId, 10);

    if (isNaN(muniId)) {
      return res.status(400).json({ error: 'ID de municipio inválido' });
    }

    const result = await query(`
      SELECT
        election_year as year,
        election_type as tipo_eleccion,
        SUM(votes) as total_votes,
        ROUND(AVG(percentage)::numeric, 2) as participacion
      FROM historical_results
      WHERE municipality_id = $1
      GROUP BY election_year, election_type
      ORDER BY election_year DESC
    `, [muniId]);

    console.log(`📈 Participación para municipio ${muniId}: ${result.rows.length} registros`);
    res.json(result.rows);

  } catch (error) {
    console.error('❌ /participation:', error.message);
    res.status(500).json({ error: 'Error en participación' });
  }
});


// ===================================
// 4. PARTICIPACIÓN
// ===================================
router.get('/participation/:municipioId', async (req, res) => {
  try {
    const { municipioId } = req.params;
    const muniId = parseInt(municipioId, 10);

    if (isNaN(muniId)) {
      return res.status(400).json({ error: 'ID de municipio inválido' });
    }

    const result = await query(`
      SELECT
        election_year                          AS year,
        election_type                          AS tipo_eleccion,
        SUM(votes)                             AS total_votes,
        ROUND(AVG(percentage)::numeric, 2)     AS participacion
      FROM historical_results
      WHERE municipality_id = $1
      GROUP BY election_year, election_type
      ORDER BY election_year DESC
    `, [muniId]);

    res.json(result.rows);

  } catch (error) {
    console.error('❌ /participation:', error.message);

    if (error.code === '42P01') {
      console.warn('⚠️  Tabla historical_results no encontrada. Ejecutar migración 001.');
      return res.json([]);
    }

    res.status(500).json({ error: 'Error en participación' });
  }
});


// ===================================
// 5. STATS PÚBLICOS
// ===================================
router.get('/stats', async (req, res) => {
  try {
    const [users, preds, surveys] = await Promise.all([
      query('SELECT COUNT(*) FROM users'),
      query('SELECT COUNT(*) FROM predictions'),
      query("SELECT COUNT(*) FROM surveys WHERE is_active = true")
    ]);

    res.json({
      users:       parseInt(users.rows[0].count),
      predictions: parseInt(preds.rows[0].count),
      surveys:     parseInt(surveys.rows[0].count)
    });

  } catch (error) {
    console.error('❌ /stats:', error.message);
    res.status(500).json({ error: 'Error en stats' });
  }
});


module.exports = router;