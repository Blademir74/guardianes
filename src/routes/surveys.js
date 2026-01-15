// src/routes/surveys.js
const express = require('express');
const router = express.Router();
// YA NO REQUERIMOS LA BD AQUÍ. USAMOS EL HELPER GLOBAL.
// const db = require('../config/database'); <-- ¡LÍNEA ELIMINADA!

// El middleware de verificación de admin se importará de auth.js
// const { verifyAdminToken } = require('../middleware/auth'); <-- Ajustaremos esto si es necesario

// ========================================
// FUNCIONES DE AUDITORÍA Y LOGGING (Consistentes con server.js)
// ========================================
function logAudit(level, action, details, userId = null) {
    const logEntry = {
        timestamp: new Date().toISOString(),
        level: level,
        action: action,
        userId: userId,
        details: details,
        ip: details.ip || 'N/A'
    };
    console.log(`[AUDIT-${level}] ${action}:`, JSON.stringify(logEntry));
    // LÍNEA CANARIO - PARA VERIFICAR DESPLIEGUE
    console.log('✅ DESPLIEGUE DE PRUEBA: surveys.js v2.0 CARGADO CORRECTAMENTE');
}

// ========================================
// PUBLIC ENDPOINTS
// ========================================

/**
 * GET /api/surveys/active
 */
router.get('/active', async (req, res) => {
  try {
    logAudit('INFO', 'SURVEYS_ACTIVE_FETCHED', { ip: req.ip });

    // ✅ USAMOS EL HELPER GLOBAL
    const result = await global.dbQuery(`
      SELECT
        s.id,
        s.title,
        s.description,
        s.election_type as "electionType",
        s.start_date as "startDate",
        s.end_date as "endDate",
        COUNT(DISTINCT sq.id) as "questionsCount",
        COUNT(DISTINCT sr.user_id) as "totalRespondents"
      FROM surveys s
      LEFT JOIN survey_questions sq ON sq.survey_id = s.id
      LEFT JOIN survey_responses sr ON sr.survey_id = s.id
      WHERE s.is_active = true
        AND s.is_public = true
        AND (s.end_date IS NULL OR s.end_date > NOW())
      GROUP BY s.id
      ORDER BY s.created_at DESC
    `);

    logAudit('INFO', 'SURVEYS_ACTIVE_SUCCESS', { count: result.rows.length, ip: req.ip });

    res.json({
      success: true,
      surveys: result.rows
    });

  } catch (error) {
    logAudit('ERROR', 'SURVEYS_ACTIVE_FAILED', { error: error.message, ip: req.ip });
    res.status(500).json({ success: false, error: 'Error al obtener encuestas activas' });
  }
});

/**
 * GET /api/surveys/:id/questions
 */
router.get('/:id/questions', async (req, res) => {
  try {
    const surveyId = parseInt(req.params.id);

    // ✅ USAMOS EL HELPER GLOBAL
    const surveyCheck = await global.dbQuery(`
      SELECT id, title, is_active, is_public FROM surveys WHERE id = $1
    `, [surveyId]);

    if (surveyCheck.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Encuesta no encontrada' });
    }

    const survey = surveyCheck.rows[0];
    if (!survey.is_active || !survey.is_public) {
      return res.status(403).json({ success: false, error: 'Encuesta no disponible' });
    }

    // ✅ USAMOS EL HELPER GLOBAL
    const questionsResult = await global.dbQuery(`
      SELECT
        id,
        question_text as "questionText",
        question_type as "questionType",
        options,
        is_required as "isRequired",
        order_num as "orderNum"
      FROM survey_questions
      WHERE survey_id = $1
      ORDER BY order_num ASC
    `, [surveyId]);

    const questions = questionsResult.rows.map(q => {
      if (q.questionType === 'confidence_scale' && !q.options) {
        return { ...q, options: { min: 0, max: 100, step: 1, unit: '%' } };
      }
      if (typeof q.options === 'string') {
        try { q.options = JSON.parse(q.options); } catch (e) { q.options = null; }
      }
      return q;
    });

    res.json({
      success: true,
      questions
    });

  } catch (error) {
    logAudit('ERROR', 'SURVEY_QUESTIONS_FAILED', { surveyId: req.params.id, error: error.message, ip: req.ip });
    res.status(500).json({ success: false, error: 'Error al obtener preguntas' });
  }
});

/**
 * POST /api/surveys/:id/response
 */
router.post('/:id/response', async (req, res) => {
  // ... (El resto del código de este archivo también debe usar global.dbQuery)
  // Por ejemplo, en la transacción:
  const client = await getDbPool().connect(); // Esta línea está bien, usa el pool directamente
  try {
    // ...
    const surveyCheck = await client.query(`...`); // Las queries dentro de la transacción usan el cliente
    // ...
  } finally {
    client.release();
  }
});

// ... (El resto de los endpoints de admin también deben ser adaptados para usar global.dbQuery donde sea posible)

module.exports = router;