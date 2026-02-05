// src/routes/historical.js - VERSIÓN DEFINITIVA v3.0
// Sistema Electoral "Guardianes" - Arquitectura Robusta
// ====================================================

const express = require('express');
const router = express.Router();
const { query } = require('../db');

// Middleware de logging para debugging
const logRequest = (endpoint) => {
  return (req, res, next) => {
    console.log(`📍 [${new Date().toISOString()}] ${endpoint}`, req.params, req.query);
    next();
  };
};

// ====================================
// ENDPOINT: Años disponibles
// ====================================
router.get('/years', logRequest('/historical/years'), async (req, res) => {
  try {
    // Query robusta con validación de NULLs
    const result = await query(`
      SELECT DISTINCT election_year as year
      FROM historical_results 
      WHERE election_year IS NOT NULL
        AND election_year > 2000
        AND election_year < 2030
      ORDER BY election_year DESC
    `);
    
    if (result.rows.length === 0) {
      console.warn('⚠️ No hay años disponibles en historical_results');
      return res.json([2024, 2021, 2018]); // Fallback values
    }
    
    const years = result.rows.map(r => r.year).filter(y => y);
    console.log('✅ Años disponibles:', years);
    res.json(years);
    
  } catch (error) {
    console.error('❌ Error crítico en /years:', error);
    // Fallback robusto
    res.json([2024, 2021, 2018]);
  }
});

// ====================================
// ENDPOINT: Tipos de elección por año
// ====================================
router.get('/elections/:year', logRequest('/historical/elections'), async (req, res) => {
  try {
    const year = parseInt(req.params.year);
    
    if (isNaN(year) || year < 2000 || year > 2030) {
      return res.status(400).json({ error: 'Año inválido' });
    }
    
    const result = await query(`
      SELECT DISTINCT election_type 
      FROM historical_results 
      WHERE election_year = $1
        AND election_type IS NOT NULL
      ORDER BY election_type
    `, [year]);
    
    if (result.rows.length === 0) {
      // Valores por defecto según año
      const defaultTypes = year === 2018 ? ['MUNICIPAL', 'FEDERAL'] :
                          year === 2021 ? ['MUNICIPAL', 'GUBERNATURA'] :
                          ['MUNICIPAL', 'GUBERNATURA'];
      return res.json(defaultTypes);
    }
    
    res.json(result.rows.map(r => r.election_type));
    
  } catch (error) {
    console.error('❌ Error en /elections/:year:', error);
    res.status(500).json({ error: 'Error obteniendo tipos de elección' });
  }
});

// ====================================
// ENDPOINT: Resultados con filtros
// ====================================
router.get('/results', logRequest('/historical/results'), async (req, res) => {
  try {
    const { year, type, municipalityId } = req.query;
    
    let sql = `
      SELECT 
        hr.id,
        hr.municipality_id,
        hr.election_year,
        hr.election_type,
        hr.party,
        hr.votes,
        hr.percentage,
        COALESCE(m.name, 'Municipio ' || hr.municipality_id) as municipality_name
      FROM historical_results hr
      LEFT JOIN municipalities m ON hr.municipality_id = m.id
      WHERE 1=1
    `;
    
    const params = [];
    let paramIndex = 1;

    if (year && !isNaN(parseInt(year))) {
      sql += ` AND hr.election_year = $${paramIndex++}`;
      params.push(parseInt(year));
    }
    
    if (type) {
      sql += ` AND hr.election_type = $${paramIndex++}`;
      params.push(type);
    }

    if (municipalityId && !isNaN(parseInt(municipalityId))) {
      sql += ` AND hr.municipality_id = $${paramIndex++}`;
      params.push(parseInt(municipalityId));
    }

    sql += ` ORDER BY hr.votes DESC NULLS LAST LIMIT 500`;

    const result = await query(sql, params);
    
    console.log(`✅ Resultados encontrados: ${result.rows.length}`);
    res.json(result.rows);
    
  } catch (error) {
    console.error('❌ Error en /results:', error);
    res.status(500).json({ 
      error: 'Error obteniendo resultados',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// ====================================
// ENDPOINT: Resultados por municipio
// ====================================
router.get('/results/:municipalityId', logRequest('/historical/results/:id'), async (req, res) => {
  try {
    const municipalityId = parseInt(req.params.municipalityId);
    
    if (isNaN(municipalityId)) {
      return res.status(400).json({ error: 'ID de municipio inválido' });
    }
    
    // Query optimizada con índices
    const result = await query(`
      SELECT 
        hr.election_year,
        hr.election_type,
        hr.party,
        hr.votes,
        hr.percentage,
        m.name as municipality_name
      FROM historical_results hr
      LEFT JOIN municipalities m ON hr.municipality_id = m.id
      WHERE hr.municipality_id = $1
      ORDER BY hr.election_year DESC, hr.votes DESC
    `, [municipalityId]);
    
    if (result.rows.length === 0) {
      console.warn(`⚠️ No hay datos históricos para municipio ${municipalityId}`);
      return res.json({
        municipalityId,
        message: 'No hay datos históricos disponibles para este municipio',
        data: []
      });
    }
    
    // Agrupar resultados por año/elección
    const grouped = result.rows.reduce((acc, row) => {
      const key = `${row.election_year}_${row.election_type}`;
      if (!acc[key]) {
        acc[key] = {
          year: row.election_year,
          election_type: row.election_type,
          municipality: row.municipality_name,
          parties: []
        };
      }
      acc[key].parties.push({
        party: row.party,
        votes: row.votes,
        percentage: row.percentage
      });
      return acc;
    }, {});
    
    res.json({
      municipalityId,
      totalRecords: result.rows.length,
      elections: Object.values(grouped),
      raw: result.rows
    });
    
  } catch (error) {
    console.error(`❌ Error para municipio ${req.params.municipalityId}:`, error);
    res.status(500).json({ 
      error: 'Error al obtener históricos',
      municipalityId: req.params.municipalityId
    });
  }
});

// ====================================
// ENDPOINT: Comparación temporal
// ====================================
router.get('/comparison', logRequest('/historical/comparison'), async (req, res) => {
  try {
    const { municipalityId, municipalityName } = req.query;
    
    if (!municipalityId && !municipalityName) {
      return res.status(400).json({ 
        error: 'Se requiere municipalityId o municipalityName' 
      });
    }
    
    let sql, params;
    
    if (municipalityId && !isNaN(parseInt(municipalityId))) {
      sql = `
        SELECT 
          election_year,
          election_type,
          party,
          votes,
          percentage
        FROM historical_results
        WHERE municipality_id = $1
        ORDER BY election_year DESC, percentage DESC
      `;
      params = [parseInt(municipalityId)];
    } else {
      sql = `
        SELECT 
          hr.election_year,
          hr.election_type,
          hr.party,
          hr.votes,
          hr.percentage
        FROM historical_results hr
        JOIN municipalities m ON hr.municipality_id = m.id
        WHERE UPPER(m.name) LIKE UPPER($1)
        ORDER BY hr.election_year DESC, hr.percentage DESC
      `;
      params = [`%${municipalityName}%`];
    }

    const result = await query(sql, params);
    
    if (result.rows.length === 0) {
      return res.json({
        message: 'No hay datos de comparación disponibles',
        data: []
      });
    }
    
    res.json(result.rows);
    
  } catch (error) {
    console.error('❌ Error en comparación:', error);
    res.status(500).json({ error: 'Error en comparación histórica' });
  }
});

// ====================================
// ENDPOINT: Estadísticas generales
// ====================================
router.get('/stats', logRequest('/historical/stats'), async (req, res) => {
  try {
    const result = await query(`
      SELECT 
        COUNT(DISTINCT municipality_id) as total_municipalities,
        COUNT(DISTINCT election_year) as total_years,
        COUNT(DISTINCT election_type) as total_election_types,
        COUNT(DISTINCT party) as total_parties,
        COUNT(*) as total_records,
        MIN(election_year) as earliest_year,
        MAX(election_year) as latest_year,
        ROUND(AVG(percentage)::numeric, 2) as avg_percentage,
        SUM(votes) as total_votes_all_time
      FROM historical_results
      WHERE election_year IS NOT NULL
    `);
    
    res.json(result.rows[0]);
    
  } catch (error) {
    console.error('❌ Error en stats:', error);
    res.status(500).json({ error: 'Error obteniendo estadísticas' });
  }
});

// ====================================
// ENDPOINT: Tendencias por partido
// ====================================
router.get('/trends/:party', logRequest('/historical/trends'), async (req, res) => {
  try {
    const { party } = req.params;
    const { municipalityId } = req.query;
    
    let sql = `
      SELECT 
        election_year,
        election_type,
        AVG(percentage) as avg_percentage,
        SUM(votes) as total_votes,
        COUNT(DISTINCT municipality_id) as municipalities_won
      FROM historical_results
      WHERE UPPER(party) = UPPER($1)
    `;
    
    const params = [party];
    
    if (municipalityId && !isNaN(parseInt(municipalityId))) {
      sql += ` AND municipality_id = $2`;
      params.push(parseInt(municipalityId));
    }
    
    sql += ` GROUP BY election_year, election_type
             ORDER BY election_year DESC`;
    
    const result = await query(sql, params);
    
    res.json({
      party,
      trends: result.rows
    });
    
  } catch (error) {
    console.error('❌ Error en trends:', error);
    res.status(500).json({ error: 'Error obteniendo tendencias' });
  }
});

module.exports = router;