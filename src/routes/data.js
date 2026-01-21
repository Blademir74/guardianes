// src/routes/data.js
// Rutas para datos públicos (municipios, históricos, estadísticas)
const express = require('express');
const router = express.Router();
const { query } = require('../db'); // ✅ IMPORTACIÓN CORRECTA

// ===================================
// 1. LISTAR MUNICIPIOS
// ===================================
router.get('/municipios', async (req, res) => {
    try {
        const result = await query(
            'SELECT id, name, region, total_voters, latitude, longitude FROM municipalities ORDER BY name'
        );
        
        res.json(result.rows);
    } catch (error) {
        console.error('❌ Error en /municipios:', error);
        res.status(500).json({ 
            error: 'Failed to fetch municipalities',
            details: error.message 
        });
    }
});

// ===================================
// 2. LISTAR CANDIDATOS POR MUNICIPIO
// ===================================
router.get('/candidatos/:municipioId', async (req, res) => {
    try {
        const { municipioId } = req.params;
        
        const result = await query(
            `SELECT id, name, party, election_type, gender, photo_url, bio 
             FROM candidates 
             WHERE (municipality_id = $1 OR municipality_id IS NULL) 
             AND is_active = true
             ORDER BY name`,
            [municipioId]
        );
        
        res.json(result.rows);
    } catch (error) {
        console.error('❌ Error en /candidatos:', error);
        res.status(500).json({ 
            error: 'Failed to fetch candidates',
            details: error.message 
        });
    }
});

// ===================================
// 3. COMPARACIÓN HISTÓRICA POR MUNICIPIO
// ===================================
router.get('/comparacion/:municipioId', async (req, res) => {
    try {
        const { municipioId } = req.params;
        
        const result = await query(`
            SELECT 
                election_type as tipo_eleccion,
                MAX(CASE WHEN election_year = 2024 THEN percentage END) as "2024",
                MAX(CASE WHEN election_year = 2021 THEN percentage END) as "2021",
                MAX(CASE WHEN election_year = 2018 THEN percentage END) as "2018"
            FROM historical_results
            WHERE municipality_id = $1
            GROUP BY election_type
            ORDER BY election_type
        `, [municipioId]);
        
        res.json(result.rows);
    } catch (error) {
        console.error('❌ Error en /comparacion:', error);
        res.status(500).json({ 
            error: 'Failed to fetch comparison data',
            details: error.message 
        });
    }
});

// ===================================
// 4. PARTICIPACIÓN HISTÓRICA
// ===================================
router.get('/participacion/:municipioId', async (req, res) => {
    try {
        const { municipioId } = req.params;
        
        const result = await query(`
            SELECT 
                election_year as year,
                election_type as tipo_eleccion,
                AVG(turnout_percentage) as participacion
            FROM historical_results
            WHERE municipality_id = $1
            GROUP BY election_year, election_type
            ORDER BY election_year DESC, election_type
        `, [municipioId]);
        
        res.json(result.rows);
    } catch (error) {
        console.error('❌ Error en /participacion:', error);
        res.status(500).json({ 
            error: 'Failed to fetch participation data',
            details: error.message 
        });
    }
});

// ===================================
// 5. ESTADÍSTICAS GENERALES
// ===================================
router.get('/stats', async (req, res) => {
    try {
        const stats = {};
        
        // Total usuarios
        const usersResult = await query('SELECT COUNT(*) as count FROM users');
        stats.users = parseInt(usersResult.rows[0].count);
        
        // Total predicciones
        const predictionsResult = await query('SELECT COUNT(*) as count FROM predictions');
        stats.predictions = parseInt(predictionsResult.rows[0].count);
        
        // Total encuestas
        const surveysResult = await query('SELECT COUNT(*) as count FROM surveys WHERE is_active = true');
        stats.surveys = parseInt(surveysResult.rows[0].count);
        
        // Total incidentes
        const incidentsResult = await query('SELECT COUNT(*) as count FROM incidents');
        stats.incidents = parseInt(incidentsResult.rows[0].count);
        
        res.json(stats);
    } catch (error) {
        console.error('❌ Error en /stats:', error);
        res.status(500).json({ 
            error: 'Failed to fetch stats',
            details: error.message 
        });
    }
});

module.exports = router;