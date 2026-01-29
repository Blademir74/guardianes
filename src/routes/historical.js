// src/routes/historical.js
const express = require('express');
const router = express.Router();
const { query } = require('../db');

// GET /api/historical/years
// Retorna años disponibles [2024, 2021, 2018]
router.get('/years', async (req, res) => {
  try {
    const result = await query(`
      SELECT DISTINCT anio 
      FROM resultados_electorales 
      ORDER BY anio DESC
    `);
    res.json(result.rows.map(r => r.anio));
  } catch (error) {
    console.error('Error getting years:', error);
    res.status(500).json({ error: 'Error interno' });
  }
});

// GET /api/historical/elections/:year
// Retorna tipos de elección disponibles para un año
router.get('/elections/:year', async (req, res) => {
  try {
    const { year } = req.params;
    const result = await query(`
      SELECT DISTINCT tipo_eleccion 
      FROM resultados_electorales 
      WHERE anio = $1
      ORDER BY tipo_eleccion
    `, [year]);
    res.json(result.rows.map(r => r.tipo_eleccion));
  } catch (error) {
    console.error('Error getting elections:', error);
    res.status(500).json({ error: 'Error interno' });
  }
});

// GET /api/historical/results
// Query params: year, type, municipalityId
router.get('/results', async (req, res) => {
  try {
    const { year, type, municipalityId } = req.query;

    let sql = `
      SELECT re.*,
             m.name as municipality_clean_name
      FROM resultados_electorales re
      LEFT JOIN municipalities m ON re.ambito_nombre LIKE '%' || m.name || '%'
      WHERE 1=1
    `;
    const params = [];
    let idx = 1;

    if (year) {
      sql += ` AND re.anio = $${idx++}`;
      params.push(year);
    }
    if (type) {
      sql += ` AND re.tipo_eleccion = $${idx++}`;
      params.push(type);
    }

    // Filtro por municipio específico
    if (municipalityId) {
      // Obtener el nombre limpio del municipio desde la tabla municipalities
      const muniResult = await query('SELECT name FROM municipalities WHERE id = $1', [municipalityId]);
      if (muniResult.rows.length > 0) {
        const cleanMuniName = muniResult.rows[0].name.replace(/^\d+\s*-\s*/, '').trim();
        sql += ` AND (re.ambito_nombre LIKE $${idx++} OR re.ambito_nombre LIKE $${idx++})`;
        params.push(`%${cleanMuniName}%`, `%${municipalityId}%`);
      }
    }

    sql += ` ORDER BY re.votos_morena DESC LIMIT 100`; // Safety limit

    const result = await query(sql, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error getting results:', error);
    res.status(500).json({ error: 'Error interno' });
  }
});

// GET /api/historical/comparison
// Compara años por municipio (ej. Acapulco 2018 vs 2021)
router.get('/comparison', async (req, res) => {
  try {
    const { municipalityName } = req.query; // 'Acapulco de Juárez'
    if (!municipalityName) {
      return res.status(400).json({ error: 'municipalityName requerido' });
    }

    const result = await query(`
      SELECT anio, tipo_eleccion, votos_morena, votos_pri, votos_pan, total_votos
      FROM resultados_electorales
      WHERE ambito_nombre ILIKE $1
      ORDER BY anio ASC
    `, [`%${municipalityName}%`]);

    res.json(result.rows);
  } catch (error) {
    console.error('Error getting comparison:', error);
    res.status(500).json({ error: 'Error interno' });
  }
});

// Obtener resultados históricos por municipio (Legacy/Specific)
router.get('/results/:municipalityId', async (req, res) => {
  try {
    const { municipalityId } = req.params;
    // Este endpoint asume que existía una columna municipality_id o similar.
    // Si la tabla es resultados_electorales y no tiene ID, esto fallará.
    // Voy a comentar la query original y dejar un TODO o adaptarlo
    /*
    const result = await query(`
      SELECT ... FROM historical_results WHERE municipality_id = $1 ...
    `, [municipalityId]);
    */

    // Fallback: retornar vacío por ahora hasta tener clara la relación
    res.json([]);
  } catch (error) {
    console.error('Error en /historical/results/:id:', error);
    res.status(500).json({ error: 'Error al obtener históricos' });
  }
});

module.exports = router;