// src/routes/data.js
const express = require('express');
const router = express.Router();
const { query } = require('../db');

// ===================================
// 1. LISTAR MUNICIPIOS
// ===================================
router.get('/municipalities', async (req, res) => {
  try {
    const result = await query(
      'SELECT id, name FROM municipalities ORDER BY name'
    );

    console.log(`✅ Municipios: ${result.rows.length}`);
    res.json(result.rows);
  } catch (error) {
    console.error('❌ Error /municipalities:', error);
    res.status(500).json({ error: 'Error obteniendo municipios' });
  }
});

// ===================================
// 2. LISTAR CANDIDATOS
// ===================================
router.get('/candidates/:municipioId', async (req, res) => {
  try {
    const { municipioId } = req.params;
    console.log(`🔍 Solicitud candidates para: ${municipioId}`);

    let result;

    if (municipioId === 'gubernatura') {
      // CONSULTA para gubernatura: municipality_id es NULL
      result = await query(
        `SELECT 
                    id, 
                    name, 
                    party, 
                    photo_url,
                    photo_url as img
                 FROM candidates 
                 WHERE municipality_id IS NULL
                 ORDER BY id`
      );
      console.log(`✅ Gubernatura: ${result.rows.length} candidatos`);
    } else {
      const muniId = parseInt(municipioId);
      if (isNaN(muniId)) {
        return res.status(400).json({ error: 'ID inválido' });
      }

      result = await query(
        `SELECT 
                    id, 
                    name, 
                    party, 
                    photo_url,
                    photo_url as img
                 FROM candidates 
                 WHERE municipality_id = $1
                 ORDER BY name`,
        [muniId]
      );
      console.log(`✅ Municipal ${muniId}: ${result.rows.length} candidatos`);
    }

    console.log('📤 Datos enviados al frontend:', result.rows);
    res.json(result.rows);

  } catch (error) {
    console.error('❌ Error en candidates endpoint:', error);
    res.status(500).json({ error: 'Error obteniendo candidatos' });
  }
});



// ===================================
// 3. COMPARACIÓN HISTÓRICA
// ===================================
router.get('/comparison/:municipioId', async (req, res) => {
  try {
    const { municipioId } = req.params;

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
    `, [municipioId]);

    console.log(`✅ Comparación: ${result.rows.length}`);
    res.json(result.rows);

  } catch (error) {
    console.error('❌ Error /comparison:', error);
    res.status(500).json({ error: 'Error comparación' });
  }
});

// ===================================
// 4. PARTICIPACIÓN
// ===================================
router.get('/participation/:municipioId', async (req, res) => {
  try {
    const { municipioId } = req.params;

    const result = await query(`
      SELECT 
        election_year as year,
        election_type as tipo_eleccion,
        SUM(votes) as total_votes,
        AVG(percentage) as participacion
      FROM historical_results
      WHERE municipality_id = $1
      GROUP BY election_year, election_type
      ORDER BY election_year DESC
    `, [municipioId]);

    console.log(`✅ Participación: ${result.rows.length}`);
    res.json(result.rows);

  } catch (error) {
    console.error('❌ Error /participation:', error);
    res.status(500).json({ error: 'Error participación' });
  }
});

// ===================================
// 5. STATS
// ===================================
router.get('/stats', async (req, res) => {
  try {
    const stats = {};

    const users = await query('SELECT COUNT(*) FROM users');
    stats.users = parseInt(users.rows[0].count);

    const preds = await query('SELECT COUNT(*) FROM predictions');
    stats.predictions = parseInt(preds.rows[0].count);

    const surveys = await query('SELECT COUNT(*) FROM surveys WHERE is_active = true');
    stats.surveys = parseInt(surveys.rows[0].count);

    res.json(stats);
  } catch (error) {
    console.error('❌ Error /stats:', error);
    res.status(500).json({ error: 'Error stats' });
  }
});

module.exports = router;