// src/routes/surveys.js
const express = require('express');
const db = require('../db');
const { verifyAdminToken } = require('../middleware/auth');
const gamification = require('../services/gamification');
const surveyController = require('../controllers/surveyController');

const router = express.Router();

// ========================================
// PUBLIC ENDPOINTS
// ========================================

/**
 * GET /api/surveys/active
 * Obtener encuestas públicas activas
 */
router.get('/', surveyController.getSurveys);
router.get('/:id/results', surveyController.getSurveyResults);
router.get('/active', async (req, res) => {
  try {
    console.log('📡 [BACKEND] GET /api/surveys/active - Solicitado');

    const result = await db.query(`
      SELECT
        s.id,
        s.title,
        s.description,
        s.election_type as "electionType",
        s.start_date as "startDate",
        s.end_date as "endDate",
        s.allow_anonymous as "allowAnonymous",
        s.max_responses_per_user as "maxResponsesPerUser",
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

    console.log(`✅ [BACKEND] Encuestas activas encontradas: ${result.rows.length}`);

    res.json({
      surveys: result.rows,
      total: result.rows.length
    });

  } catch (error) {
    console.error('❌ [BACKEND] Error obteniendo encuestas activas:', error);
    res.status(500).json({ error: 'Error obteniendo encuestas' });
  }
});

/**
 * GET /api/surveys/:id/questions
 * Obtener preguntas de una encuesta (público)
 */
router.get('/:id/questions', async (req, res) => {
  try {
    const surveyId = parseInt(req.params.id);

    const surveyCheck = await db.query(`
      SELECT id, title, is_active, is_public, allow_anonymous
      FROM surveys
      WHERE id = $1
    `, [surveyId]);

    if (surveyCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Encuesta no encontrada' });
    }

    const survey = surveyCheck.rows[0];

    if (!survey.is_active || !survey.is_public) {
      return res.status(403).json({ error: 'Encuesta no disponible' });
    }

    const questionsResult = await db.query(`
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

    // ✅ CORRECCIÓN: Agregar options automáticamente para confidence_scale
    const questions = questionsResult.rows.map(q => {
      if (q.questionType === 'confidence_scale' && !q.options) {
        return {
          ...q,
          options: { min: 0, max: 100, step: 1, unit: '%' }
        };
      }
      return q;
    });

    res.json({
      survey: {
        id: survey.id,
        title: survey.title,
        allowAnonymous: survey.allow_anonymous
      },
      questions
    });

  } catch (error) {
    console.error('❌ Error obteniendo preguntas:', error);
    res.status(500).json({ error: 'Error obteniendo preguntas' });
  }
});

/**
 * POST /api/surveys/:id/response
 * ✅ ARREGLADO: Acepta formato de landing (answer, confidence)
 */
router.post('/:id/response', async (req, res) => {
  const client = await db.connect();

  try {
    const surveyId = parseInt(req.params.id);
    const { responses } = req.body;

    console.log('📥 [BACKEND] Respuesta recibida:', { surveyId, responses });

    const token = req.headers.authorization?.replace('Bearer ', '');
    let userId = null;

    if (token) {
      try {
        const jwt = require('jsonwebtoken');
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'dev-secret-change-in-production');
        userId = decoded.userId;
      } catch (err) {
        // Token inválido, continuar como anónimo
      }
    }

    const surveyCheck = await client.query(`
      SELECT 
        id, 
        is_active, 
        is_public, 
        allow_anonymous,
        max_responses_per_user,
        end_date
      FROM surveys
      WHERE id = $1
    `, [surveyId]);

    if (surveyCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Encuesta no encontrada' });
    }

    const survey = surveyCheck.rows[0];

    if (!survey.is_active) {
      return res.status(403).json({ error: 'Encuesta no está activa' });
    }

    if (!survey.is_public) {
      return res.status(403).json({ error: 'Encuesta no es pública' });
    }

    if (!survey.allow_anonymous && !userId) {
      return res.status(401).json({ error: 'Esta encuesta requiere autenticación' });
    }

    if (survey.end_date && new Date(survey.end_date) < new Date()) {
      return res.status(403).json({ error: 'Encuesta finalizada' });
    }

    await client.query('BEGIN');

    // ✅ INSERTAR RESPUESTAS (acepta tanto 'answer' como 'value')
    for (const response of responses) {
      const responseValue = response.answer || response.value;

      await client.query(`
        INSERT INTO survey_responses (
          survey_id,
          question_id,
          user_id,
          response_value,
          confidence,
          ip_address,
          user_agent
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
      `, [
        surveyId,
        response.questionId,
        userId,
        responseValue,
        response.confidence || null,
        req.ip,
        req.get('user-agent')
      ]);

      console.log(`✅ [BACKEND] Respuesta guardada: pregunta ${response.questionId}, valor: ${responseValue}`);
    }

    if (userId) {
      const gamification = require('../services/gamification');
      await gamification.addPoints(userId, 'SURVEY_COMPLETE', client);
    }

    await client.query('COMMIT');

    console.log(`✅ [BACKEND] Respuesta completa enviada: encuesta ${surveyId}, usuario ${userId || 'anónimo'}`);

    res.json({
      success: true,
      message: 'Respuesta enviada exitosamente',
      pointsEarned: userId ? 50 : 0
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ [BACKEND] Error enviando respuesta:', error);
    res.status(500).json({ error: 'Error enviando respuesta: ' + error.message });
  } finally {
    client.release();
  }
});

/**
 * GET /api/surveys/:id/results
 * Obtener resultados agregados (público)
 */
router.get('/:id/results', async (req, res) => {
  try {
    const surveyId = parseInt(req.params.id);

    const surveyCheck = await db.query(`
      SELECT id, title, is_public FROM surveys WHERE id = $1
    `, [surveyId]);

    if (surveyCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Encuesta no encontrada' });
    }

    if (!surveyCheck.rows[0].is_public) {
      return res.status(403).json({ error: 'Resultados no públicos' });
    }

    const result = await db.query(`
      SELECT 
        sq.id as question_id,
        sq.question_text,
        sq.question_type,
        sr.response_value,
        COUNT(*) as count,
        AVG(sr.confidence) as avg_confidence
      FROM survey_questions sq
      LEFT JOIN survey_responses sr ON sr.question_id = sq.id
      WHERE sq.survey_id = $1
      GROUP BY sq.id, sq.question_text, sq.question_type, sr.response_value
      ORDER BY sq.order_num, count DESC
    `, [surveyId]);

    const questionResults = {};
    result.rows.forEach(row => {
      if (!questionResults[row.question_id]) {
        questionResults[row.question_id] = {
          questionText: row.question_text,
          questionType: row.question_type,
          responses: []
        };
      }

      if (row.response_value) {
        questionResults[row.question_id].responses.push({
          value: row.response_value,
          count: parseInt(row.count),
          avgConfidence: row.avg_confidence ? parseFloat(row.avg_confidence).toFixed(1) : null
        });
      }
    });

    res.json({
      surveyTitle: surveyCheck.rows[0].title,
      results: Object.values(questionResults)
    });

  } catch (error) {
    console.error('❌ Error obteniendo resultados:', error);
    res.status(500).json({ error: 'Error obteniendo resultados' });
  }
});

// ========================================
// ADMIN ENDPOINTS
// ========================================

router.get('/admin', verifyAdminToken, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;
    const status = req.query.status;

    let query = `
      SELECT 
        s.id,
        s.title,
        s.description,
        s.election_type,
        s.start_date,
        s.end_date,
        s.is_active,
        s.is_public,
        s.allow_anonymous,
        s.max_responses_per_user,
        s.created_at,
        a.username as created_by_username,
        COUNT(DISTINCT sq.id) as questions_count,
        COUNT(DISTINCT sr.user_id) as unique_respondents,
        COUNT(sr.id) as total_responses
      FROM surveys s
      LEFT JOIN admins a ON a.id = s.created_by
      LEFT JOIN survey_questions sq ON sq.survey_id = s.id
      LEFT JOIN survey_responses sr ON sr.survey_id = s.id
      WHERE 1=1
    `;

    const params = [];
    let paramIndex = 1;

    if (status === 'active') {
      query += ` AND s.is_active = true AND (s.end_date IS NULL OR s.end_date > NOW())`;
    } else if (status === 'inactive') {
      query += ` AND s.is_active = false`;
    } else if (status === 'scheduled') {
      query += ` AND s.start_date > NOW()`;
    } else if (status === 'ended') {
      query += ` AND s.end_date < NOW()`;
    }

    query += ` 
      GROUP BY s.id, a.username
      ORDER BY s.created_at DESC 
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;
    params.push(limit, offset);

    const result = await db.query(query, params);
    const countResult = await db.query('SELECT COUNT(*) FROM surveys');
    const total = parseInt(countResult.rows[0].count);

    res.json({
      surveys: result.rows,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });

  } catch (error) {
    console.error('❌ Error obteniendo encuestas:', error);
    res.status(500).json({ error: 'Error obteniendo encuestas' });
  }
});

router.get('/admin/:id', verifyAdminToken, async (req, res) => {
  try {
    const surveyId = parseInt(req.params.id);

    const surveyResult = await db.query(`
      SELECT 
        s.*,
        a.username as created_by_username
      FROM surveys s
      LEFT JOIN admins a ON a.id = s.created_by
      WHERE s.id = $1
    `, [surveyId]);

    if (surveyResult.rows.length === 0) {
      return res.status(404).json({ error: 'Encuesta no encontrada' });
    }

    const survey = surveyResult.rows[0];

    const questionsResult = await db.query(`
      SELECT
        id,
        question_text,
        question_type,
        options,
        is_required,
        order_num
      FROM survey_questions
      WHERE survey_id = $1
      ORDER BY order_num ASC
    `, [surveyId]);

    // ✅ CORRECCIÓN: Agregar options automáticamente para confidence_scale
    const questions = questionsResult.rows.map(q => {
      if (q.question_type === 'confidence_scale' && !q.options) {
        return {
          ...q,
          options: { min: 0, max: 100, step: 1, unit: '%' }
        };
      }
      return q;
    });

    const statsResult = await db.query(`
      SELECT
        COUNT(DISTINCT user_id) as unique_respondents,
        COUNT(id) as total_responses
      FROM survey_responses
      WHERE survey_id = $1
    `, [surveyId]);

    res.json({
      survey,
      questions,
      stats: statsResult.rows[0]
    });

  } catch (error) {
    console.error('❌ Error obteniendo encuesta:', error);
    res.status(500).json({ error: 'Error obteniendo encuesta' });
  }
});

router.post('/admin', verifyAdminToken, async (req, res) => {
  const client = await db.connect();

  try {
    const {
      title,
      description,
      electionType,
      startDate,
      endDate,
      isPublic,
      allowAnonymous,
      maxResponsesPerUser,
      questions
    } = req.body;

    if (!title || title.length < 5) {
      return res.status(400).json({ error: 'Título debe tener al menos 5 caracteres' });
    }

    if (!questions || questions.length === 0) {
      return res.status(400).json({ error: 'Debe incluir al menos una pregunta' });
    }

    await client.query('BEGIN');

    const surveyResult = await client.query(`
      INSERT INTO surveys (
        title, 
        description, 
        election_type, 
        start_date, 
        end_date, 
        is_public, 
        allow_anonymous, 
        max_responses_per_user,
        created_by
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING id
    `, [
      title,
      description,
      electionType,
      startDate,
      endDate,
      isPublic !== false,
      allowAnonymous !== false,
      maxResponsesPerUser || 1,
      req.adminId
    ]);

    const surveyId = surveyResult.rows[0].id;

    for (let i = 0; i < questions.length; i++) {
      let q = questions[i];

      // ✅ CORRECCIÓN: Detectar preguntas de confianza automáticamente
      const isConfidenceQuestion = q.questionText.toLowerCase().includes('seguro') ||
        q.questionText.toLowerCase().includes('confianza') ||
        q.questionText.toLowerCase().includes('confidence');

      if (isConfidenceQuestion) {
        q.questionType = 'confidence_scale';
      }

      // ✅ CORRECCIÓN: Asegurar options para confidence_scale
      let options = q.options;
      if (q.questionType === 'confidence_scale') {
        options = options || { min: 0, max: 100, step: 1, unit: '%' };
      }

      await client.query(`
        INSERT INTO survey_questions (
          survey_id,
          question_text,
          question_type,
          options,
          is_required,
          order_num
        )
        VALUES ($1, $2, $3, $4, $5, $6)
      `, [
        surveyId,
        q.questionText,
        q.questionType,
        options ? JSON.stringify(options) : null,
        q.isRequired !== false,
        i + 1
      ]);
    }

    await client.query('COMMIT');

    console.log(`✅ Encuesta creada: ${surveyId} - "${title}" por admin ${req.adminUsername}`);

    res.json({
      success: true,
      surveyId,
      message: 'Encuesta creada exitosamente'
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error creando encuesta:', error);
    res.status(500).json({ error: 'Error creando encuesta' });
  } finally {
    client.release();
  }
});

router.put('/admin/:id', verifyAdminToken, async (req, res) => {
  const client = await db.connect();

  try {
    const surveyId = parseInt(req.params.id);
    const {
      title,
      description,
      electionType,
      startDate,
      endDate,
      isPublic,
      allowAnonymous,
      maxResponsesPerUser,
      questions
    } = req.body;

    await client.query('BEGIN');

    await client.query(`
      UPDATE surveys SET
        title = $1,
        description = $2,
        election_type = $3,
        start_date = $4,
        end_date = $5,
        is_public = $6,
        allow_anonymous = $7,
        max_responses_per_user = $8
      WHERE id = $9
    `, [
      title,
      description,
      electionType,
      startDate,
      endDate,
      isPublic,
      allowAnonymous,
      maxResponsesPerUser,
      surveyId
    ]);

    await client.query('DELETE FROM survey_questions WHERE survey_id = $1', [surveyId]);

    for (let i = 0; i < questions.length; i++) {
      let q = questions[i];

      // ✅ CORRECCIÓN: Detectar preguntas de confianza automáticamente
      const isConfidenceQuestion = q.questionText.toLowerCase().includes('seguro') ||
        q.questionText.toLowerCase().includes('confianza') ||
        q.questionText.toLowerCase().includes('confidence');

      if (isConfidenceQuestion) {
        q.questionType = 'confidence_scale';
      }

      // ✅ CORRECCIÓN: Asegurar options para confidence_scale
      let options = q.options;
      if (q.questionType === 'confidence_scale') {
        options = options || { min: 0, max: 100, step: 1, unit: '%' };
      }

      await client.query(`
        INSERT INTO survey_questions (
          survey_id,
          question_text,
          question_type,
          options,
          is_required,
          order_num
        )
        VALUES ($1, $2, $3, $4, $5, $6)
      `, [
        surveyId,
        q.questionText,
        q.questionType,
        options ? JSON.stringify(options) : null,
        q.isRequired !== false,
        i + 1
      ]);
    }

    await client.query('COMMIT');

    console.log(`✅ Encuesta actualizada: ${surveyId} por admin ${req.adminUsername}`);

    res.json({
      success: true,
      message: 'Encuesta actualizada exitosamente'
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error actualizando encuesta:', error);
    res.status(500).json({ error: 'Error actualizando encuesta' });
  } finally {
    client.release();
  }
});

router.delete('/admin/:id', verifyAdminToken, async (req, res) => {
  try {
    const surveyId = parseInt(req.params.id);

    const checkResult = await db.query('SELECT id, title FROM surveys WHERE id = $1', [surveyId]);

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: 'Encuesta no encontrada' });
    }

    await db.query('DELETE FROM surveys WHERE id = $1', [surveyId]);

    console.log(`✅ Encuesta eliminada: ${surveyId} - "${checkResult.rows[0].title}" por admin ${req.adminUsername}`);

    res.json({
      success: true,
      message: 'Encuesta eliminada exitosamente'
    });

  } catch (error) {
    console.error('❌ Error eliminando encuesta:', error);
    res.status(500).json({ error: 'Error eliminando encuesta' });
  }
});

router.patch('/admin/:id/toggle', verifyAdminToken, async (req, res) => {
  try {
    const surveyId = parseInt(req.params.id);

    const result = await db.query(`
      UPDATE surveys 
      SET is_active = NOT is_active
      WHERE id = $1
      RETURNING id, title, is_active
    `, [surveyId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Encuesta no encontrada' });
    }

    const survey = result.rows[0];

    console.log(`✅ Encuesta ${survey.is_active ? 'activada' : 'desactivada'}: ${surveyId} por admin ${req.adminUsername}`);

    res.json({
      success: true,
      isActive: survey.is_active,
      message: `Encuesta ${survey.is_active ? 'activada' : 'desactivada'} exitosamente`
    });

  } catch (error) {
    console.error('❌ Error toggling encuesta:', error);
    res.status(500).json({ error: 'Error actualizando estado' });
  }
});

router.get('/admin/:id/responses', verifyAdminToken, async (req, res) => {
  try {
    const surveyId = parseInt(req.params.id);

    const result = await db.query(`
      SELECT 
        sr.id,
        sr.created_at,
        sq.question_text,
        sq.question_type,
        sr.response_value,
        sr.confidence,
        COALESCE(LEFT(u.phone_hash, 12) || '...', 'Anónimo') as user_preview
      FROM survey_responses sr
      JOIN survey_questions sq ON sq.id = sr.question_id
      LEFT JOIN users u ON u.id = sr.user_id
      WHERE sr.survey_id = $1
      ORDER BY sr.created_at DESC
      LIMIT 500
    `, [surveyId]);

    res.json({
      responses: result.rows,
      total: result.rows.length
    });

  } catch (error) {
    console.error('❌ Error obteniendo respuestas:', error);
    res.status(500).json({ error: 'Error obteniendo respuestas' });
  }
});

router.get('/admin/:id/export', verifyAdminToken, async (req, res) => {
  try {
    const surveyId = parseInt(req.params.id);

    const surveyResult = await db.query('SELECT title FROM surveys WHERE id = $1', [surveyId]);

    if (surveyResult.rows.length === 0) {
      return res.status(404).json({ error: 'Encuesta no encontrada' });
    }

    const result = await db.query(`
      SELECT 
        sr.id,
        TO_CHAR(sr.created_at, 'YYYY-MM-DD HH24:MI:SS') as fecha,
        sq.question_text as pregunta,
        sr.response_value as respuesta,
        sr.confidence as confianza,
        COALESCE(LEFT(u.phone_hash, 12) || '...', 'Anonimo') as usuario
      FROM survey_responses sr
      JOIN survey_questions sq ON sq.id = sr.question_id
      LEFT JOIN users u ON u.id = sr.user_id
      WHERE sr.survey_id = $1
      ORDER BY sr.created_at DESC
    `, [surveyId]);

    const headers = ['ID', 'Fecha', 'Pregunta', 'Respuesta', 'Confianza', 'Usuario'];
    const csvRows = [headers.join(',')];

    result.rows.forEach(row => {
      csvRows.push([
        row.id,
        row.fecha,
        `"${row.pregunta.replace(/"/g, '""')}"`,
        `"${row.respuesta.replace(/"/g, '""')}"`,
        row.confianza || '',
        row.usuario
      ].join(','));
    });

    const csv = csvRows.join('\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=encuesta_${surveyId}_${Date.now()}.csv`);
    res.send('\ufeff' + csv);

    console.log(`✅ Respuestas exportadas: encuesta ${surveyId} por admin ${req.adminUsername}`);

  } catch (error) {
    console.error('❌ Error exportando respuestas:', error);
    res.status(500).json({ error: 'Error exportando datos' });
  }
});

module.exports = router;