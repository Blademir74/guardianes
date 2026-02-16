// src/routes/surveys.js — VERSIÓN CORREGIDA (Auditoría 2026-02-02)
// Correcciones:
//   BUG-11 → /live-results ahora carga preguntas y respuestas con queries en batch, no N+1
//   BUG-12 → Las preguntas se buscan por el survey_id correcto (la migración las reasigna)
//   MEJORA → /:id/results incluye datos de candidatos (nombre, party, photo) en la respuesta

const express = require('express');
const db = require('../db');
const { verifyAdminToken } = require('../middleware/auth');

const router = express.Router();

// ========================================
// Helper: sincronizar CANDIDATES a partir de la encuesta creada en Admin
// ========================================
async function syncCandidatesFromSurveyPayload(client, payload) {
  try {
    const { electionType, municipalityId, level, questions } = payload;

    // 1) Determinar ámbito: gubernatura → municipality_id NULL, municipal → municipality_id numérico
    let muniId = null;
    const isGubernatura =
      (level && level.toLowerCase() === 'estado') ||
      (electionType && electionType.toLowerCase() === 'gubernatura');

    if (!isGubernatura) {
      const parsed = parseInt(municipalityId, 10);
      muniId = Number.isNaN(parsed) ? null : parsed;
    }

    // 2) Extraer candidatos desde preguntas de tipo single_choice
    const candidates = [];
    (questions || []).forEach(q => {
      if (q.type === 'single_choice' && Array.isArray(q.options)) {
        q.options.forEach(opt => {
          const rawLabel = (opt.label || opt.value || '').trim();
          if (!rawLabel) return;

          candidates.push({
            name: rawLabel,
            party: opt.party || 'INDEPENDIENTE',
            photo_url: opt.photo || null
          });
        });
      }
    });

    if (!candidates.length) {
      console.log('ℹ️ syncCandidatesFromSurveyPayload: sin candidatos detectados en payload');
      return;
    }

    console.log(
      `🔁 Sincronizando ${candidates.length} candidatos para municipio=${muniId}, electionType=${electionType}`
    );

    // 3) Borrar candidatos anteriores para este municipio/elección
    await client.query(
      `
      DELETE FROM candidates
      WHERE ( (municipality_id = $1) OR ($1 IS NULL AND municipality_id IS NULL) )
        AND (election_type = $2 OR $2 IS NULL)
      `,
      [muniId, electionType || null]
    );

    // 4) Insertar nuevos candidatos
    for (const cand of candidates) {
      await client.query(
        `
        INSERT INTO candidates (name, party, municipality_id, election_type, is_active, photo_url)
        VALUES ($1, $2, $3, $4, true, $5)
        `,
        [cand.name, cand.party, muniId, electionType || null, cand.photo_url]
      );
    }

    console.log(
      `✅ syncCandidatesFromSurveyPayload: ${candidates.length} candidatos sincronizados para municipio=${muniId}, electionType=${electionType}`
    );
  } catch (err) {
    console.error('❌ Error en syncCandidatesFromSurveyPayload:', err.message);
    // No rompemos la creación de la encuesta si falla esto: solo logueamos
  }
}
// Secret para verificar tokens de usuario dentro de este archivo
const USER_JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-2027-guerrero';


// ========================================
// RESULTADOS EN VIVO (landing page)
// ========================================
router.get('/live-results', async (req, res) => {
  try {
    // ── 1. Stats globales (1 query) ──
    const globalStats = await db.query(`
      SELECT
        COUNT(DISTINCT user_id) FILTER (WHERE user_id IS NOT NULL) AS total_participants,
        COUNT(*)                                                    AS total_responses,
        COUNT(DISTINCT survey_id)                                   AS active_surveys
      FROM survey_responses
      WHERE created_at > NOW() - INTERVAL '30 days'
    `);

    // ── 2. Encuestas activas (1 query) ──
    const surveysData = await db.query(`
      SELECT
        s.id,
        s.title,
        s.description,
        COUNT(DISTINCT sr.user_id) FILTER (WHERE sr.user_id IS NOT NULL) AS total_participants,
        COUNT(sr.id)                                                      AS total_responses,
        MAX(sr.created_at)                                                AS last_response_at
      FROM surveys s
      LEFT JOIN survey_responses sr ON sr.survey_id = s.id
      WHERE s.is_active  = true
        AND s.is_public  = true
        AND (s.end_date IS NULL OR s.end_date > NOW())
      GROUP BY s.id, s.title, s.description
      ORDER BY s.created_at DESC
      LIMIT 5
    `);

    const surveyIds = surveysData.rows.map(s => s.id);

    if (surveyIds.length === 0) {
      return res.json({
        success: true,
        timestamp: new Date().toISOString(),
        globalStats: {
          totalParticipants: parseInt(globalStats.rows[0].total_participants) || 0,
          totalResponses: parseInt(globalStats.rows[0].total_responses) || 0,
          activeSurveys: parseInt(globalStats.rows[0].active_surveys) || 0
        },
        surveys: []
      });
    }

    // ── 3. Todas las preguntas de esas encuestas (1 query, no loop) ──
    const questionsData = await db.query(`
      SELECT id, survey_id, question_text, question_type
      FROM survey_questions
      WHERE survey_id = ANY($1)
      ORDER BY survey_id, order_num
    `, [surveyIds]);

    const questionIds = questionsData.rows.map(q => q.id);

    // ── 4. Todas las respuestas agrupadas (1 query, no loop) ──
    const responsesData = await db.query(`
      SELECT
        question_id,
        response_value,
        COUNT(*) AS count
      FROM survey_responses
      WHERE question_id = ANY($1)
      GROUP BY question_id, response_value
      ORDER BY question_id, count DESC
    `, [questionIds]);

    // ── Armado en memoria (sin queries adicionales) ──
    // Mapear respuestas por question_id
    const respMap = {};
    responsesData.rows.forEach(r => {
      if (!respMap[r.question_id]) respMap[r.question_id] = [];
      respMap[r.question_id].push(r);
    });

    // Mapear preguntas por survey_id
    const qMap = {};
    questionsData.rows.forEach(q => {
      if (!qMap[q.survey_id]) qMap[q.survey_id] = [];
      qMap[q.survey_id].push(q);
    });

    const surveys = surveysData.rows.map(survey => {
      const questions = (qMap[survey.id] || []).map(q => {
        const responses = respMap[q.id] || [];
        const totalForQ = responses.reduce((sum, r) => sum + parseInt(r.count), 0);

        return {
          questionText: q.question_text,
          questionType: q.question_type,
          responses: responses.map(r => ({
            value: r.response_value,
            count: parseInt(r.count),
            percentage: totalForQ > 0 ? Math.round((parseInt(r.count) / totalForQ) * 100) : 0
          }))
        };
      });

      return {
        id: survey.id,
        title: survey.title,
        description: survey.description,
        totalParticipants: parseInt(survey.total_participants) || 0,
        totalResponses: parseInt(survey.total_responses) || 0,
        lastResponseAt: survey.last_response_at,
        questions
      };
    });

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
    console.error('❌ /live-results:', error.message);
    res.status(500).json({ success: false, error: 'Error obteniendo resultados en vivo' });
  }
});


// ========================================
// ENCUESTAS ACTIVAS (app ciudadana)
// ========================================
router.get('/active', async (req, res) => {
  try {
    const result = await db.query(`
      SELECT
        id,
        title,
        description,
        election_type   AS "electionType",
        municipality_id AS "municipalityId",
        is_active       AS "isActive",
        is_public       AS "isPublic",
        start_date      AS "startDate",
        end_date        AS "endDate",
        created_at
      FROM surveys
      WHERE is_active  = true
        AND is_public  = true
        AND (start_date IS NULL OR start_date <= NOW())
        AND (end_date   IS NULL OR end_date   >= NOW())
      ORDER BY created_at DESC
    `);

    res.json({ surveys: result.rows, total: result.rows.length });

  } catch (error) {
    console.error('❌ /surveys/active:', error.message);
    res.status(500).json({ error: 'Error obteniendo encuestas activas' });
  }
});


// ========================================
// PREGUNTAS DE UNA ENCUESTA
// ========================================
router.get('/:id/questions', async (req, res) => {
  try {
    const surveyId = parseInt(req.params.id, 10);
    if (isNaN(surveyId)) {
      return res.status(400).json({ error: 'ID de encuesta inválido' });
    }

    // Obtener encuesta
    const surveyResult = await db.query(`
      SELECT id, title, description, election_type, municipality_id,
             is_active, is_public, start_date, end_date
      FROM surveys WHERE id = $1
    `, [surveyId]);

    if (surveyResult.rows.length === 0) {
      return res.status(404).json({ error: 'Encuesta no encontrada' });
    }

    const survey = surveyResult.rows[0];

    // Obtener preguntas
    const questionsResult = await db.query(`
      SELECT
        id,
        question_text AS "questionText",
        question_type AS "questionType",
        options,
        is_required   AS "isRequired",
        order_num     AS "orderNum"
      FROM survey_questions
      WHERE survey_id = $1
      ORDER BY order_num ASC
    `, [surveyId]);

    // Si es single_choice, obtener candidatos para poblar opciones
    // (esto evita que el frontend haga otra llamada separada)
    let candidates = [];
    const hasSingleChoice = questionsResult.rows.some(q => q.questionType === 'single_choice');

    if (hasSingleChoice) {
      if (survey.election_type === 'gubernatura') {
        const cands = await db.query(`
          SELECT id, name, party,
                 COALESCE(NULLIF(photo_url, ''), '/assets/images/candidate-placeholder.png') AS photo_url
          FROM candidates
          WHERE municipality_id IS NULL
          ORDER BY id
        `);
        candidates = cands.rows;
      } else if (survey.municipality_id) {
        const cands = await db.query(`
          SELECT id, name, party,
                 COALESCE(NULLIF(photo_url, ''), '/assets/images/candidate-placeholder.png') AS photo_url
          FROM candidates
          WHERE municipality_id = $1
          ORDER BY name
        `, [survey.municipality_id]);
        candidates = cands.rows;
      }
    }

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
      questions: questionsResult.rows,
      candidates                          // array de candidatos para poblar opciones
    });

  } catch (error) {
    console.error('❌ /surveys/:id/questions:', error.message);
    res.status(500).json({ error: 'Error obteniendo preguntas' });
  }
});


// ========================================
// ENVIAR RESPUESTA
// ========================================
router.post('/:id/response', async (req, res) => {
  let client;
  try {
    client = await db.connect();
    const surveyId = parseInt(req.params.id, 10);
    const { responses, phoneHash, sessionToken } = req.body;

    if (!responses || !Array.isArray(responses) || responses.length === 0) {
      return res.status(400).json({ error: 'Debe enviar al menos una respuesta' });
    }

    // ── Extraer userId del token (opcional) ──
    let userId = null;
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (token) {
      try {
        const jwt = require('jsonwebtoken');
        const decoded = jwt.verify(token, USER_JWT_SECRET);
        userId = decoded.userId;
      } catch (_) {
        // Token inválido → anónimo, no crash
      }
    }

    // ── Verificar encuesta ──
    const surveyCheck = await client.query(`
      SELECT id, is_active, is_public, allow_anonymous, end_date
      FROM surveys WHERE id = $1
    `, [surveyId]);

    if (surveyCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Encuesta no encontrada' });
    }

    const survey = surveyCheck.rows[0];

    if (!survey.is_active) return res.status(403).json({ error: 'Encuesta no está activa' });
    if (!survey.is_public) return res.status(403).json({ error: 'Encuesta no es pública' });
    if (!survey.allow_anonymous && !userId)
      return res.status(401).json({ error: 'Esta encuesta requiere autenticación' });
    if (survey.end_date && new Date(survey.end_date) < new Date())
      return res.status(403).json({ error: 'Encuesta finalizada' });

    // ══════════════════════════════════════════
    // CANDADO DE VOTO ÚNICO — validar phone_hash
    // ══════════════════════════════════════════
    if (phoneHash) {
      const existingVote = await client.query(
        `SELECT id FROM survey_responses 
         WHERE survey_id = $1 AND phone_hash = $2 
         LIMIT 1`,
        [surveyId, phoneHash]
      );

      if (existingVote.rows.length > 0) {
        client.release();
        return res.status(409).json({
          success: false,
          alreadyVoted: true,
          error: 'Ya registraste tu predicción en esta encuesta'
        });
      }
    }

    // ── Insertar respuestas ──
    await client.query('BEGIN');

    let savedCount = 0;
    for (const response of responses) {
      const responseValue = response.answer || response.value || response.response_value;

      if (!response.questionId || !responseValue) {
        console.warn('⚠️  Respuesta incompleta (se omite):', response);
        continue;
      }

      await client.query(`
        INSERT INTO survey_responses (survey_id, question_id, user_id, response_value, confidence, phone_hash, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, NOW())
      `, [surveyId, response.questionId, userId, responseValue.toString(), response.confidence || null, phoneHash || null]);

      savedCount++;
    }

    // ── Puntos si autenticado ──
    let pointsEarned = 0;
    if (userId) {
      await client.query(`
        UPDATE users SET points = points + 50, last_active = NOW() WHERE id = $1
      `, [userId]);
      pointsEarned = 50;
    }

    await client.query('COMMIT');

    res.json({
      success: true,
      message: 'Respuesta enviada exitosamente',
      pointsEarned,
      responsesSaved: savedCount
    });

  } catch (error) {
    if (client) {
      try { await client.query('ROLLBACK'); } catch (_) { /* ignore */ }
    }
    console.error('❌ /surveys/:id/response:', error.message);
    res.status(500).json({
      error: 'Error enviando respuesta',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  } finally {
    if (client) client.release();   // siempre liberar
  }
});


// ========================================
// RESULTADOS ESPECÍFICOS (polling — dashboard / landing)
// Incluye datos de candidatos para que el frontend pueda
// mostrar nombre, partido y foto sin otra llamada.
// ========================================
router.get('/:id/results', async (req, res) => {
  try {
    const surveyId = parseInt(req.params.id, 10);
    if (isNaN(surveyId)) {
      return res.status(400).json({ error: 'ID inválido' });
    }

    // ── Obtener encuesta para saber election_type y municipality_id ──
    const surveyRow = await db.query(
      'SELECT election_type, municipality_id FROM surveys WHERE id = $1',
      [surveyId]
    );

    if (surveyRow.rows.length === 0) {
      return res.status(404).json({ error: 'Encuesta no encontrada' });
    }

    const { election_type, municipality_id } = surveyRow.rows[0];

    // ── Votos agrupados por candidato ──
    const votesResult = await db.query(`
      SELECT
        response_value AS candidate_id,
        COUNT(*)       AS count
      FROM survey_responses
      WHERE survey_id = $1
        AND question_id IN (
          SELECT id FROM survey_questions
          WHERE survey_id = $1 AND question_type IN ('single_choice', 'choice', 'candidate_selection')
        )
      GROUP BY response_value
      ORDER BY count DESC
    `, [surveyId]);

    // ── Confianza promedio ──
    const confResult = await db.query(`
      SELECT AVG(confidence) AS avg_confidence, COUNT(*) AS total
      FROM survey_responses
      WHERE survey_id = $1
        AND confidence IS NOT NULL
        AND question_id IN (
          SELECT id FROM survey_questions
          WHERE survey_id = $1 AND question_type = 'confidence_scale'
        )
    `, [surveyId]);

    // ── Candidatos con foto ──
    let candidates;
    if (election_type === 'gubernatura') {
      candidates = await db.query(`
        SELECT id, name, party,
               COALESCE(NULLIF(photo_url, ''), '/assets/images/candidate-placeholder.png') AS photo_url
        FROM candidates
        WHERE municipality_id IS NULL
        ORDER BY id
      `);
    } else {
      candidates = await db.query(`
        SELECT id, name, party,
               COALESCE(NULLIF(photo_url, ''), '/assets/images/candidate-placeholder.png') AS photo_url
        FROM candidates
        WHERE municipality_id = $1
        ORDER BY name
      `, [municipality_id]);
    }

    // ── Mapear votos a candidatos ──
    const voteMap = {};
    const totalVotes = votesResult.rows.reduce((sum, r) => sum + parseInt(r.count), 0);

    votesResult.rows.forEach(r => {
      // Normalizar ID: si viene como "candidato_18", dejar solo "18"
      const cleanId = String(r.candidate_id).replace('candidato_', '');
      voteMap[cleanId] = parseInt(r.count);
    });

    const results = candidates.rows.map(c => ({
      id: c.id,
      name: c.name,
      party: c.party,
      photo_url: c.photo_url,
      votes: voteMap[String(c.id)] || 0,
      percentage: totalVotes > 0
        ? Math.round(((voteMap[String(c.id)] || 0) / totalVotes) * 100)
        : 0
    })).sort((a, b) => b.votes - a.votes);

    res.json({
      surveyId,
      totalVotes,
      avgConfidence: parseFloat(confResult.rows[0].avg_confidence) || 0,
      candidates: results
    });

  } catch (error) {
    console.error('❌ /surveys/:id/results:', error.message);
    res.status(500).json({ error: 'Error polling results' });
  }
});


// ========================================
// ADMIN — listar encuestas
// ========================================
router.get('/admin', verifyAdminToken, async (req, res) => {
  try {
    const result = await db.query(`
      SELECT
        s.*,
        COUNT(DISTINCT sq.id)      AS questions_count,
        COUNT(DISTINCT sr.user_id) AS unique_respondents,
        COUNT(sr.id)               AS total_responses
      FROM surveys s
      LEFT JOIN survey_questions  sq ON sq.survey_id = s.id
      LEFT JOIN survey_responses  sr ON sr.survey_id = s.id
      GROUP BY s.id
      ORDER BY s.created_at DESC
    `);

    res.json({ surveys: result.rows, total: result.rows.length });

  } catch (error) {
    console.error('❌ /surveys/admin:', error.message);
    res.status(500).json({ error: 'Error obteniendo encuestas' });
  }
});


// ========================================
// ADMIN — crear encuesta
// ========================================
// ========================================
// ADMIN — crear encuesta
// ========================================
router.post('/surveys', verifyAdminToken, async (req, res) => {
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
      questions,
      level
    } = req.body;

    if (!title || title.length < 5) {
      return res.status(400).json({ error: 'Título debe tener al menos 5 caracteres' });
    }
    if (!questions || questions.length === 0) {
      return res.status(400).json({ error: 'Debe incluir al menos una pregunta' });
    }

    await client.query('BEGIN');

    // Normalizar tipo de elección y municipio
    const normalizedElectionType = normalizeElectionType(electionType);
    const muniId = municipalityId && parseInt(municipalityId, 10) > 0
      ? parseInt(municipalityId, 10)
      : null;

    // start_date nunca NULL
    const safeStartDate = startDate || new Date().toISOString();

    const surveyResult = await client.query(`
      INSERT INTO surveys (
        title,
        description,
        election_type,
        municipality_id,
        start_date,
        end_date,
        is_active,
        is_public,
        allow_anonymous,
        active,
        created_by
      )
      VALUES ($1, $2, $3, $4, $5, $6, true, $7, $8, true, $9)
      RETURNING id
    `, [
      title,
      description,
      normalizedElectionType,
      muniId,
      safeStartDate,
      endDate || null,
      isPublic !== false,
      allowAnonymous !== false,
      req.adminId || null
    ]);

    const surveyId = surveyResult.rows[0].id;

    // Insertar preguntas
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];

      if (!q) {
        console.warn('⚠️ /api/admin/surveys: pregunta nula/indefinida en índice', i);
        continue;
      }

      // Compatibilidad: "type"/"text" o "questionType"/"questionText"
      const rawType = q.type || q.questionType || 'open_text';
      const rawText = q.text || q.questionText || '';

      const qType = String(rawType).trim();
      const qText = String(rawText).trim();

      if (!qText) {
        console.warn('⚠️ /api/admin/surveys: pregunta sin texto, se omite:', q);
        continue;
      }

      let options = q.options || null;

      if (qType === 'confidence_scale' && !options) {
        options = { min: 0, max: 100, step: 10, unit: '%' };
      }

      await client.query(`
        INSERT INTO survey_questions (survey_id, question_text, question_type, options)
        VALUES ($1, $2, $3, $4)
      `, [
        surveyId,
        qText,
        qType,
        options ? JSON.stringify(options) : null
      ]);
    }

    // Sincronizar candidatos en la tabla candidates
    await syncCandidatesFromSurveyPayload(client, {
      level,
      electionType: normalizedElectionType,
      municipalityId,
      questions
    });

    await client.query('COMMIT');
    console.log(`✅ Encuesta creada (ADMIN): ${surveyId} — "${title}"`);

    res.json({ success: true, surveyId, message: 'Encuesta creada exitosamente' });

  } catch (error) {
    if (client) await client.query('ROLLBACK');
    console.error('❌ /api/admin/surveys POST:', error);
    res.status(500).json({ error: 'Error creando encuesta' });
  } finally {
    if (client) client.release();
  }
});

// ============================================
// ENDPOINT: Verificar si usuario ya votó
// ============================================
router.post('/:id/check-vote', async (req, res) => {
  const { id } = req.params;
  const { phone } = req.body;

  try {
    // Generar hash del teléfono (igual que en el registro)
    const crypto = require('crypto');
    const phoneHash = crypto
      .createHash('sha256')
      .update(phone)
      .digest('hex');

    // Verificar si existe voto previo con ese hash para esta encuesta
    const existingVote = await db.query(
      `SELECT id FROM survey_responses 
       WHERE survey_id = $1 
       AND phone_hash = $2 
       LIMIT 1`,
      [id, phoneHash]
    );

    if (existingVote.rows.length > 0) {
      return res.status(409).json({
        success: false,
        alreadyVoted: true,
        error: 'Ya registraste tu predicción en esta encuesta'
      });
    }

    // No ha votado - puede proceder
    res.json({
      success: true,
      canVote: true
    });

  } catch (error) {
    console.error('Error verificando voto:', error);
    res.status(500).json({
      success: false,
      error: 'Error al verificar voto'
    });
  }
});


module.exports = router;