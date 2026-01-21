// src/routes/admin.js
const express = require('express');
const router = express.Router();
const { query } = require('../db');
const jwt = require('jsonwebtoken');

// Middleware de autenticación admin
const authenticateAdmin = (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }
    
    const decoded = jwt.verify(token, process.env.ADMIN_JWT_SECRET);
    if (decoded.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    req.admin = decoded;
    next();
  } catch (error) {
    console.error('❌ Auth error:', error);
    res.status(401).json({ error: 'Invalid token' });
  }
};

// ===================================
// DASHBOARD - ESTADÍSTICAS
// ===================================
router.get('/stats', authenticateAdmin, async (req, res) => {
  try {
    const stats = {};
    
    // Total usuarios
    const usersResult = await query('SELECT COUNT(*) as count FROM users');
    stats.totalUsers = parseInt(usersResult.rows[0].count);
    
    // Total predicciones
    const predictionsResult = await query('SELECT COUNT(*) as count FROM predictions');
    stats.totalPredictions = parseInt(predictionsResult.rows[0].count);
    
    // Total encuestas
    const surveysResult = await query('SELECT COUNT(*) as count FROM surveys WHERE is_active = true');
    stats.activeSurveys = parseInt(surveysResult.rows[0].count);
    
    // Total incidentes
    const incidentsResult = await query('SELECT COUNT(*) as count FROM incidents');
    stats.totalIncidents = parseInt(incidentsResult.rows[0].count);
    
    // Respuestas hoy
    const todayResult = await query(`
      SELECT COUNT(*) as count 
      FROM survey_responses 
      WHERE DATE(created_at) = CURRENT_DATE
    `);
    stats.responsesToday = parseInt(todayResult.rows[0].count);
    
    res.json(stats);
  } catch (error) {
    console.error('❌ Error en /admin/stats:', error);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// ===================================
// TENDENCIAS (para gráfico)
// ===================================
router.get('/trends', authenticateAdmin, async (req, res) => {
  try {
    const result = await query(`
      SELECT 
        DATE(created_at) as date,
        COUNT(*) as count
      FROM survey_responses
      WHERE created_at >= CURRENT_DATE - INTERVAL '7 days'
      GROUP BY DATE(created_at)
      ORDER BY date ASC
    `);
    
    res.json(result.rows);
  } catch (error) {
    console.error('❌ Error en /admin/trends:', error);
    res.status(500).json({ error: 'Failed to fetch trends' });
  }
});

// ===================================
// PARTICIPACIÓN POR MUNICIPIO
// ===================================
router.get('/participation', authenticateAdmin, async (req, res) => {
  try {
    const result = await query(`
      SELECT 
        m.name as municipality,
        COUNT(DISTINCT sr.user_id) as responses
      FROM municipalities m
      LEFT JOIN survey_responses sr ON sr.municipality_id = m.id
      WHERE sr.created_at >= CURRENT_DATE - INTERVAL '30 days'
      GROUP BY m.id, m.name
      ORDER BY responses DESC
      LIMIT 10
    `);
    
    res.json(result.rows);
  } catch (error) {
    console.error('❌ Error en /admin/participation:', error);
    res.status(500).json({ error: 'Failed to fetch participation' });
  }
});

// ===================================
// USUARIOS RECIENTES
// ===================================
router.get('/recent-users', authenticateAdmin, async (req, res) => {
  try {
    const result = await query(`
      SELECT 
        u.id,
        u.phone_last4,
        u.name,
        m.name as municipality,
        u.created_at,
        COUNT(DISTINCT sr.id) as total_responses
      FROM users u
      LEFT JOIN municipalities m ON u.municipality_id = m.id
      LEFT JOIN survey_responses sr ON sr.user_id = u.id
      GROUP BY u.id, u.phone_last4, u.name, m.name, u.created_at
      ORDER BY u.created_at DESC
      LIMIT 20
    `);
    
    res.json(result.rows);
  } catch (error) {
    console.error('❌ Error en /admin/recent-users:', error);
    res.status(500).json({ error: 'Failed to fetch recent users' });
  }
});

// ===================================
// INCIDENTES RECIENTES
// ===================================
router.get('/recent-incidents', authenticateAdmin, async (req, res) => {
  try {
    const result = await query(`
      SELECT 
        i.id,
        i.type,
        i.description,
        i.status,
        i.location,
        m.name as municipality,
        u.name as reporter_name,
        i.created_at
      FROM incidents i
      LEFT JOIN municipalities m ON i.municipality_id = m.id
      LEFT JOIN users u ON i.user_id = u.id
      ORDER BY i.created_at DESC
      LIMIT 10
    `);
    
    res.json(result.rows);
  } catch (error) {
    console.error('❌ Error en /admin/recent-incidents:', error);
    res.status(500).json({ error: 'Failed to fetch recent incidents' });
  }
});

// ===================================
// EXPORTAR DATOS
// ===================================
router.get('/export/:type', authenticateAdmin, async (req, res) => {
  try {
    const { type } = req.params;
    let result;
    
    switch(type) {
      case 'responses':
        result = await query(`
          SELECT 
            sr.id,
            u.phone_last4,
            u.name as user_name,
            m.name as municipality,
            s.title as survey_title,
            sq.question_text,
            sr.answer_text,
            sr.created_at
          FROM survey_responses sr
          JOIN users u ON sr.user_id = u.id
          LEFT JOIN municipalities m ON sr.municipality_id = m.id
          JOIN surveys s ON sr.survey_id = s.id
          JOIN survey_questions sq ON sr.question_id = sq.id
          ORDER BY sr.created_at DESC
        `);
        break;
        
      case 'predictions':
        result = await query(`
          SELECT 
            p.id,
            u.phone_last4,
            u.name as user_name,
            m.name as municipality,
            c.name as candidate_name,
            c.party,
            p.confidence_level,
            p.created_at
          FROM predictions p
          JOIN users u ON p.user_id = u.id
          LEFT JOIN municipalities m ON p.municipality_id = m.id
          JOIN candidates c ON p.candidate_id = c.id
          ORDER BY p.created_at DESC
        `);
        break;
        
      case 'incidents':
        result = await query(`
          SELECT 
            i.id,
            i.type,
            i.description,
            i.status,
            i.location,
            m.name as municipality,
            u.name as reporter_name,
            u.phone_last4,
            i.created_at
          FROM incidents i
          LEFT JOIN municipalities m ON i.municipality_id = m.id
          LEFT JOIN users u ON i.user_id = u.id
          ORDER BY i.created_at DESC
        `);
        break;
        
      default:
        return res.status(400).json({ error: 'Invalid export type' });
    }
    
    // Convertir a CSV
    if (result.rows.length === 0) {
      return res.json({ data: [] });
    }
    
    const headers = Object.keys(result.rows[0]);
    const csv = [
      headers.join(','),
      ...result.rows.map(row => 
        headers.map(h => `"${row[h] || ''}"`).join(',')
      )
    ].join('\n');
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=${type}_${Date.now()}.csv`);
    res.send(csv);
    
  } catch (error) {
    console.error('❌ Error en /admin/export:', error);
    res.status(500).json({ error: 'Failed to export data' });
  }
});

// ===================================
// CREAR ENCUESTA CON PREGUNTAS
// ===================================
router.post('/surveys', authenticateAdmin, async (req, res) => {
  try {
    const { title, description, municipality_id, election_type, questions } = req.body;
    
    // Validaciones
    if (!title || !questions || questions.length === 0) {
      return res.status(400).json({ error: 'Title and questions are required' });
    }

    // Crear encuesta
    const surveyResult = await query(`
      INSERT INTO surveys (title, description, municipality_id, election_type, is_active)
      VALUES ($1, $2, $3, $4, true)
      RETURNING id
    `, [title, description, municipality_id || null, election_type]);
    
    const surveyId = surveyResult.rows[0].id;

    // Crear preguntas
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      
      const questionResult = await query(`
        INSERT INTO survey_questions (survey_id, question_text, question_type, question_order)
        VALUES ($1, $2, $3, $4)
        RETURNING id
      `, [surveyId, q.text, q.type, i + 1]);
      
      const questionId = questionResult.rows[0].id;

      // Crear opciones si existen
      if (q.options && q.options.length > 0) {
        for (let j = 0; j < q.options.length; j++) {
          await query(`
            INSERT INTO survey_options (question_id, option_text, option_order)
            VALUES ($1, $2, $3)
          `, [questionId, q.options[j], j + 1]);
        }
      }
    }

    res.json({ 
      success: true, 
      surveyId,
      message: 'Survey created successfully'
    });
    
  } catch (error) {
    console.error('❌ Error creating survey:', error);
    res.status(500).json({ error: 'Failed to create survey' });
  }
});

module.exports = router;
