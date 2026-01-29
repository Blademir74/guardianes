// src/routes/surveys.js - GUARDIANES GUERRERO 2027
const express = require('express');
const db = require('../db');
const { verifyAdminToken } = require('../middleware/auth');

const router = express.Router();

// ========================================
// ENDPOINT: RESULTADOS EN VIVO
// ========================================
router.get('/live-results', async (req, res) => {
  try {
    // Estadísticas globales
    const globalStats = await db.query(`
      SELECT 
        COUNT(DISTINCT user_id) FILTER (WHERE user_id IS NOT NULL) as total_participants,
        COUNT(*) as total_responses,
        COUNT(DISTINCT survey_id) as active_surveys
      FROM survey_responses
      WHERE created_at > NOW() - INTERVAL '30 days'
    `);

    // Encuestas activas con resultados
    const surveysData = await db.query(`
      SELECT 
        s.id,
        s.title,
        s.description,
        COUNT(DISTINCT sr.user_id) FILTER (WHERE sr.user_id IS NOT NULL) as total_participants,
        COUNT(sr.id) as total_responses,
        MAX(sr.created_at) as last_response_at
      FROM surveys s
      LEFT JOIN survey_responses sr ON sr.survey_id = s.id
      WHERE s.is_active = true 
        AND s.is_public = true
        AND (s.end_date IS NULL OR s.end_date > NOW())
      GROUP BY s.id, s.title, s.description
      ORDER BY s.created_at DESC
      LIMIT 5
    `);

    const surveys = [];

    for (const survey of surveysData.rows) {
      const questionsData = await db.query(`
        SELECT 
          sq.id,
          sq.question_text,
          sq.question_type
        FROM survey_questions sq
        WHERE sq.survey_id = $1
        ORDER BY sq.order_num
      `, [survey.id]);

      const questions = [];

      for (const question of questionsData.rows) {
        const responsesData = await db.query(`
          SELECT 
            response_value,
            COUNT(*) as count
          FROM survey_responses
          WHERE question_id = $1
          GROUP BY response_value
          ORDER BY count DESC
        `, [question.id]);

        const totalForQuestion = responsesData.rows.reduce((sum, r) => sum + parseInt(r.count), 0);

        questions.push({
          questionText: question.question_text,
          questionType: question.question_type,
          responses: responsesData.rows.map(r => ({
            value: r.response_value,
            count: parseInt(r.count),
            percentage: totalForQuestion > 0 ? Math.round((parseInt(r.count) / totalForQuestion) * 100) : 0
          }))
        });
      }

      surveys.push({
        id: survey.id,
        title: survey.title,
        description: survey.description,
        totalParticipants: parseInt(survey.total_participants) || 0,
        totalResponses: parseInt(survey.total_responses) || 0,
        lastResponseAt: survey.last_response_at,
        questions
      });
    }

    res.json({
      success: true,
      timestamp: new Date().toISOString(),
      globalStats: {
        totalParticipants: parseInt(globalStats.rows[0].total_participants) || 0,
        totalResponses: parseInt(globalStats.rows[0].total_responses) || 0,
        activeSurveys: parseInt(globalStats.rows[0].active_surveys) || 0
      },
      surveys
    });

  } catch (error) {
    console.error('❌ Error obteniendo resultados en vivo:', error);
    res.status(500).json({
      success: false,
      error: 'Error obteniendo resultados en vivo'
    });
  }
});

// ========================================
// ENDPOINT: ENCUESTAS ACTIVAS
// ========================================
// EN surveys.js - REEMPLAZAR el endpoint /active existente
router.get('/active', async (req, res) => {
  try {
    console.log('🔍 Buscando encuestas activas...');

    const result = await db.query(`
      SELECT 
        id,
        title, 
        description,
        election_type as "electionType",
        municipality_id as "municipalityId",
        is_active as "isActive",
        is_public as "isPublic",
        start_date as "startDate",
        end_date as "endDate",
        created_at
      FROM surveys 
      WHERE is_active = true 
        AND is_public = true
        AND (start_date IS NULL OR start_date <= NOW())
        AND (end_date IS NULL OR end_date >= NOW())
      ORDER BY created_at DESC
    `);

    console.log(`✅ Encuestas activas encontradas: ${result.rows.length}`);

    res.json({
      surveys: result.rows,
      total: result.rows.length
    });

  } catch (error) {
    console.error('❌ Error en /api/surveys/active:', error);
    res.status(500).json({ error: 'Error obteniendo encuestas activas' });
  }
});


// EN surveys.js - AÑADIR después del endpoint /active
router.get('/:id/questions', async (req, res) => {
  try {
    const surveyId = parseInt(req.params.id);
    console.log(`🔍 Obteniendo preguntas para encuesta ID: ${surveyId}`);

    // ✅ OBTENER TODOS los datos de la encuesta
    const surveyResult = await db.query(`
      SELECT 
        id,
        title,
        description,
        election_type,
        municipality_id,
        is_active,
        is_public,
        start_date,
        end_date
      FROM surveys 
      WHERE id = $1
    `, [surveyId]);

    if (surveyResult.rows.length === 0) {
      console.log('❌ Encuesta no encontrada');
      return res.status(404).json({ error: 'Encuesta no encontrada' });
    }

    const survey = surveyResult.rows[0];
    console.log('📊 Datos de encuesta:', survey);

    // ✅ OBTENER PREGUNTAS
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

    console.log(`✅ Preguntas encontradas: ${questionsResult.rows.length}`);

    res.json({
      survey: {
        id: survey.id,
        title: survey.title,
        description: survey.description,
        electionType: survey.election_type,
        municipalityId: survey.municipality_id,
        isActive: survey.is_active,
        isPublic: survey.is_public,
        startDate: survey.start_date,
        endDate: survey.end_date
      },
      questions: questionsResult.rows
    });

  } catch (error) {
    console.error('❌ Error obteniendo preguntas:', error);
    res.status(500).json({ error: 'Error obteniendo preguntas' });
  }
});



// ========================================
// ENDPOINT: ENVIAR RESPUESTA
// ========================================
router.post('/:id/response', async (req, res) => {
  let client;

  try {
    client = await db.connect();
    const surveyId = parseInt(req.params.id);
    const { responses } = req.body;

    console.log(`📥 Respuesta recibida para encuesta ${surveyId}:`, {
      responsesCount: responses?.length,
      hasToken: !!req.headers.authorization
    });

    if (!responses || !Array.isArray(responses) || responses.length === 0) {
      return res.status(400).json({ error: 'Debe enviar al menos una respuesta' });
    }

    // Extraer y verificar token
    const token = req.headers.authorization?.replace('Bearer ', '');
    let userId = null;

    if (token) {
      try {
        const jwt = require('jsonwebtoken');
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'dev-secret-2027-guerrero');
        userId = decoded.userId;
        console.log(`✅ Usuario autenticado: ${userId}`);
      } catch (err) {
        console.log('⚠️ Token inválido, procesando como anónimo');
      }
    }

    // Verificar encuesta
    const surveyCheck = await client.query(`
      SELECT id, is_active, is_public, allow_anonymous, end_date
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

    // Insertar respuestas
    let savedCount = 0;
    for (const response of responses) {
      const responseValue = response.answer || response.value || response.response_value;

      if (!response.questionId || !responseValue) {
        console.warn('⚠️ Respuesta incompleta:', response);
        continue;
      }

      await client.query(`
        INSERT INTO survey_responses (
          survey_id,
          question_id,
          user_id,
          response_value,
          confidence,
          created_at
        )
        VALUES ($1, $2, $3, $4, $5, NOW())
      `, [
        surveyId,
        response.questionId,
        userId,
        responseValue.toString(),
        response.confidence || null
      ]);

      savedCount++;
      console.log(`✅ Respuesta ${savedCount} guardada: Q${response.questionId} = ${responseValue}`);
    }

    // Otorgar puntos si está autenticado
    let pointsEarned = 0;
    if (userId) {
      try {
        await client.query(`
          UPDATE users 
          SET points = points + 50, last_active = NOW()
          WHERE id = $1
        `, [userId]);
        pointsEarned = 50;
        console.log(`🎁 +50 puntos otorgados a usuario ${userId}`);
      } catch (err) {
        console.error('⚠️ Error añadiendo puntos:', err);
      }
    }

    await client.query('COMMIT');

    console.log(`✅ Encuesta ${surveyId} completada. Respuestas guardadas: ${savedCount}`);

    res.json({
      success: true,
      message: 'Respuesta enviada exitosamente',
      pointsEarned,
      responsesSaved: savedCount
    });

  } catch (error) {
    if (client) {
      try {
        await client.query('ROLLBACK');
      } catch (e) {
        console.error('❌ Error en rollback:', e);
      }
    }
    console.error('❌ Error procesando respuesta:', error);
    res.status(500).json({
      error: 'Error enviando respuesta',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  } finally {
    if (client) {
      client.release();
    }
  }
});

// ========================================
// ADMIN ENDPOINTS
// ========================================

router.get('/admin', verifyAdminToken, async (req, res) => {
  try {
    const result = await db.query(`
      SELECT 
        s.*,
        COUNT(DISTINCT sq.id) as questions_count,
        COUNT(DISTINCT sr.user_id) as unique_respondents,
        COUNT(sr.id) as total_responses
      FROM surveys s
      LEFT JOIN survey_questions sq ON sq.survey_id = s.id
      LEFT JOIN survey_responses sr ON sr.survey_id = s.id
      GROUP BY s.id
      ORDER BY s.created_at DESC
    `);

    res.json({
      surveys: result.rows,
      total: result.rows.length
    });

  } catch (error) {
    console.error('❌ Error obteniendo encuestas:', error);
    res.status(500).json({ error: 'Error obteniendo encuestas' });
  }
});

router.post('/admin', verifyAdminToken, async (req, res) => {
  let client;

  try {
    client = await db.connect();

    const {
      title,
      description,
      electionType,
      municipalityId,
      startDate,
      endDate,
      isPublic,
      allowAnonymous,
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
        municipality_id,
        start_date, 
        end_date, 
        is_public, 
        allow_anonymous,
        created_by
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING id
    `, [
      title,
      description,
      electionType,
      municipalityId && parseInt(municipalityId) > 0 ? parseInt(municipalityId) : null,
      startDate,
      endDate,
      isPublic !== false,
      allowAnonymous !== false,
      req.adminId
    ]);

    const surveyId = surveyResult.rows[0].id;

    for (let i = 0; i < questions.length; i++) {
  const q = questions[i];

  // ✅ Si es confidence_scale y no tiene opciones, agregar por defecto
  let options = q.options;
  if (q.questionType === 'confidence_scale' && !options) {
    options = {
      min: 0,
      max: 100,
      step: 10,
      unit: "%"
    };
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

    console.log(`✅ Encuesta creada: ${surveyId} - "${title}"`);

    res.json({
      success: true,
      surveyId,
      message: 'Encuesta creada exitosamente'
    });

  } catch (error) {
    if (client) {
      try {
        await client.query('ROLLBACK');
      } catch (e) { }
    }
    console.error('❌ Error creando encuesta:', error);
    res.status(500).json({ error: 'Error creando encuesta' });
  } finally {
    if (client) {
      client.release();
    }
  }
});
// ========================================
// ENDPOINT: RESULTADOS ESPECÍFICOS (POLLING)
// ========================================
router.get('/:id/results', async (req, res) => {
  try {
    const surveyId = parseInt(req.params.id);

    const result = await db.query(`
      SELECT 
        response_value as candidate_id,
        confidence,
        COUNT(*) as count
      FROM survey_responses
      WHERE survey_id = $1
      GROUP BY response_value, confidence
    `, [surveyId]);

    const candidatesMap = {};
    let totalConfidence = 0;
    let totalResponses = 0;

    result.rows.forEach(r => {
      const votes = parseInt(r.count);
      candidatesMap[r.candidate_id] = (candidatesMap[r.candidate_id] || 0) + votes;
      if (r.confidence) {
        totalConfidence += (parseFloat(r.confidence) * votes);
        totalResponses += votes;
      }
    });

    const candidates = Object.entries(candidatesMap).map(([id, votes]) => ({ id, votes }));
    const totalVotes = candidates.reduce((sum, c) => sum + c.votes, 0);
    const avgConfidence = totalResponses > 0 ? (totalConfidence / totalResponses) : 0;

    res.json({
      surveyId,
      totalVotes,
      avgConfidence,
      candidates: candidates.sort((a, b) => b.votes - a.votes)
    });

  } catch (error) {
    console.error('❌ Error polling results:', error);
    res.status(500).json({ error: 'Error polling results' });
  }
});
module.exports = router;