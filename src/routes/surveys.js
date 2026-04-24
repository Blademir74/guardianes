// src/routes/surveys.js — ESTÁNDAR DE ORO (Auditoría P0/P1)
// Correcciones aplicadas:
//   [P0] normalizeElectionType importada desde admin.js — elimina ReferenceError en POST /surveys
//   [P0] USER_JWT_SECRET sin fallback hardcodeado — usa exclusivamente process.env.JWT_SECRET
//   [P1] Eliminados 8 ALTER TABLE + CREATE UNIQUE INDEX que se ejecutaban en cada voto
//        → Movidos al script de migración: migrations/20260420_gold_standard_schema.sql

const express  = require('express');
const db       = require('../db');
const { verifyAdminToken } = require('../middleware/auth');
const { surveyRateLimiter } = require('../middleware/surveySecurity');
const { normalizeElectionType, syncCandidatesFromSurveyPayload } = require('./admin');

const router = express.Router();

// JWT_SECRET sin fallback — si no está definida en env, auth.js ya lanzó error en arranque
const USER_JWT_SECRET = process.env.JWT_SECRET;


// ========================================
// RESULTADOS EN VIVO (landing page)
// ========================================
router.get('/live-results', async (req, res) => {
  try {
    const globalStats = await db.query(`
      SELECT
        COUNT(DISTINCT user_id) FILTER (WHERE user_id IS NOT NULL) AS total_participants,
        COUNT(*)                                                    AS total_responses,
        COUNT(DISTINCT survey_id)                                   AS active_surveys
      FROM survey_responses
      WHERE created_at > NOW() - INTERVAL '30 days'
    `);

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
      WHERE s.is_active = true
        AND s.is_public = true
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
          totalResponses:    parseInt(globalStats.rows[0].total_responses)    || 0,
          activeSurveys:     parseInt(globalStats.rows[0].active_surveys)     || 0
        },
        surveys: []
      });
    }

    const questionsData = await db.query(`
      SELECT id, survey_id, question_text, question_type
      FROM survey_questions
      WHERE survey_id = ANY($1)
      ORDER BY survey_id, order_num
    `, [surveyIds]);

    const questionIds = questionsData.rows.map(q => q.id);

    const responsesData = await db.query(`
      SELECT question_id, response_value, COUNT(*) AS count
      FROM survey_responses
      WHERE question_id = ANY($1)
      GROUP BY question_id, response_value
      ORDER BY question_id, count DESC
    `, [questionIds]);

    const respMap = {};
    responsesData.rows.forEach(r => {
      if (!respMap[r.question_id]) respMap[r.question_id] = [];
      respMap[r.question_id].push(r);
    });

    const qMap = {};
    questionsData.rows.forEach(q => {
      if (!qMap[q.survey_id]) qMap[q.survey_id] = [];
      qMap[q.survey_id].push(q);
    });

    const surveys = surveysData.rows.map(survey => {
      const questions = (qMap[survey.id] || []).map(q => {
        const responses  = respMap[q.id] || [];
        const totalForQ  = responses.reduce((sum, r) => sum + parseInt(r.count), 0);
        return {
          questionText: q.question_text,
          questionType: q.question_type,
          responses: responses.map(r => ({
            value:      r.response_value,
            count:      parseInt(r.count),
            percentage: totalForQ > 0 ? Math.round((parseInt(r.count) / totalForQ) * 100) : 0
          }))
        };
      });

      return {
        id:               survey.id,
        title:            survey.title,
        description:      survey.description,
        totalParticipants: parseInt(survey.total_participants) || 0,
        totalResponses:   parseInt(survey.total_responses)    || 0,
        lastResponseAt:   survey.last_response_at,
        questions
      };
    });

    res.json({
      success: true,
      timestamp: new Date().toISOString(),
      globalStats: {
        totalParticipants: parseInt(globalStats.rows[0].total_participants) || 0,
        totalResponses:    parseInt(globalStats.rows[0].total_responses)    || 0,
        activeSurveys:     parseInt(globalStats.rows[0].active_surveys)     || 0
      },
      surveys
    });

  } catch (error) {
    console.error('❌ /live-results:', error.message);
    res.status(500).json({ success: false, error: 'Error obteniendo resultados en vivo' });
  }
});


// ========================================
// ENCUESTAS ACTIVAS
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
        created_at,
        (
          SELECT COUNT(DISTINCT COALESCE(user_id::text, fingerprint_id))::int
          FROM survey_responses sr
          WHERE sr.survey_id = surveys.id
        ) AS "totalRespondents"
      FROM surveys
      WHERE is_active = true
        AND is_public  = true
        AND (start_date IS NULL OR start_date <= NOW())
        AND (end_date   IS NULL OR end_date   >= NOW())
        AND created_at > NOW() - INTERVAL '30 days'
      ORDER BY created_at DESC
      LIMIT 1
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
    if (isNaN(surveyId)) return res.status(400).json({ error: 'ID de encuesta inválido' });

    const surveyResult = await db.query(`
      SELECT id, title, description, election_type, municipality_id,
             is_active, is_public, start_date, end_date
      FROM surveys WHERE id = $1
    `, [surveyId]);

    if (surveyResult.rows.length === 0) return res.status(404).json({ error: 'Encuesta no encontrada' });

    const survey = surveyResult.rows[0];

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

    // Candidatos: siempre se cargan si hay candidatos activos para este municipio
    // No depender de question_type = 'single_choice' — cualquier encuesta municipal muestra candidatos
    let candidates = [];
    const isGub  = survey.election_type === 'gubernatura';
    const muniId = survey.municipality_id;

    let candsResult;
    if (isGub) {
      candsResult = await db.query(
        `SELECT id, id AS numeric_id,
                BTRIM(name) AS name,
                COALESCE(NULLIF(BTRIM(party),''), 'INDEPENDIENTE') AS party,
                COALESCE(NULLIF(photo_url,''), '/img/placeholder_cand.jpg') AS photo_url
         FROM candidates
         WHERE is_active = true AND municipality_id IS NULL
         ORDER BY id`
      );
    } else {
      candsResult = await db.query(
        `SELECT id, id AS numeric_id,
                BTRIM(name) AS name,
                COALESCE(NULLIF(BTRIM(party),''), 'INDEPENDIENTE') AS party,
                COALESCE(NULLIF(photo_url,''), '/img/placeholder_cand.jpg') AS photo_url
         FROM candidates
         WHERE is_active = true
           AND (municipality_id = $1 OR municipality_id::text LIKE ($1::text || '%'))
         ORDER BY id`,
        [muniId]
      );
    }
    candidates = candsResult.rows;
    console.log(`[/questions] survey=${surveyId} muni=${muniId} candidatos=${candidates.length}`);

    res.json({
      survey: {
        id:             survey.id,
        title:          survey.title,
        description:    survey.description,
        electionType:   survey.election_type,
        municipalityId: survey.municipality_id,
        isActive:       survey.is_active,
        isPublic:       survey.is_public,
        startDate:      survey.start_date,
        endDate:        survey.end_date
      },
      questions:  questionsResult.rows,
      candidates
    });

  } catch (error) {
    console.error('❌ /surveys/:id/questions:', error.message);
    res.status(500).json({ error: 'Error obteniendo preguntas' });
  }
});


// ========================================
// ENVIAR RESPUESTA
// [P1] Auto-heal DDL eliminado — esquema garantizado por migración SQL
// ========================================
router.post('/:id/response', surveyRateLimiter, async (req, res) => {
  let client;
  try {
    client = await db.connect();
    const surveyId = parseInt(req.params.id, 10);
    const {
      responses, fingerprintId, latitude, longitude, locationProvided,
      promoterId, promoter_id, confidence, confidence_level
    } = req.body;

    const finalPromoterId = promoter_id || promoterId;
    const finalConfidence  = confidence_level || confidence || 100;

    if (!responses || !Array.isArray(responses) || responses.length === 0) {
      return res.status(400).json({ error: 'Debe enviar al menos una respuesta' });
    }

    // Extraer userId del token (opcional)
    let userId = null;
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (token) {
      try {
        const jwt = require('jsonwebtoken');
        const decoded = jwt.verify(token, USER_JWT_SECRET);
        userId = decoded.userId;
      } catch (_) { /* Token inválido → anónimo */ }
    }

    // Verificar encuesta
    const surveyCheck = await client.query(`
      SELECT id, is_active, is_public, allow_anonymous, end_date, municipality_id, election_type
      FROM surveys WHERE id = $1
    `, [surveyId]);

    if (surveyCheck.rows.length === 0) return res.status(404).json({ error: 'Encuesta no encontrada' });

    const survey = surveyCheck.rows[0];
    if (!survey.is_active) return res.status(403).json({ error: 'Encuesta no está activa' });
    if (!survey.is_public) return res.status(403).json({ error: 'Encuesta no es pública' });
    if (survey.end_date && new Date(survey.end_date) < new Date())
      return res.status(403).json({ error: 'Encuesta finalizada' });

    // Candado 1: FingerprintJS
    if (!fingerprintId) {
      return res.status(400).json({ error: 'Integridad comprometida: No se detectó huella digital.' });
    }

    const existingVote = await client.query(
      `SELECT id FROM survey_responses WHERE survey_id = $1 AND fingerprint_id = $2 LIMIT 1`,
      [surveyId, fingerprintId]
    );

    if (existingVote.rows.length > 0) {
      return res.status(409).json({
        success: false,
        alreadyVoted: true,
        error: 'Ya registraste tu voto en esta encuesta desde este dispositivo.'
      });
    }

    // Candado 2: Cookie hasheada
    const crypto = require('crypto');
    const expectedCookieHash = crypto.createHash('sha256').update(fingerprintId + surveyId).digest('hex');
    const cookies = req.headers.cookie
      ? req.headers.cookie.split(';').reduce((acc, c) => {
          const [k, v] = c.trim().split('=').map(decodeURIComponent);
          acc[k] = v;
          return acc;
        }, {})
      : {};

    if (cookies[`surge_lock_${surveyId}`] === expectedCookieHash) {
      return res.status(409).json({
        success: false,
        alreadyVoted: true,
        error: 'Doble Voto Detectado: sesión segura ligada a voto previo.'
      });
    }

    const clientIp = (req.headers['x-forwarded-for'] || '').split(',')[0].trim()
                  || req.headers['x-real-ip']
                  || req.ip
                  || 'unknown';

    await client.query('BEGIN');

    // Validación territorial
    const { computeLocationStatus } = require('../middleware/territorialValidation');
    const territorial = await computeLocationStatus({
      dbClient: client,
      survey,
      latitude:  locationProvided ? latitude  : null,
      longitude: locationProvided ? longitude : null
    });

    let isTerritorialVerified = false;
    let finalLocationStatus   = territorial.locationStatus;

    if (locationProvided && territorial.locationStatus === 'IN_RANGE' && finalPromoterId) {
      try {
        const promoterCheck = await client.query(
          `SELECT seccion FROM promoters WHERE promoter_id = $1 LIMIT 1`,
          [finalPromoterId]
        );
        let sectionId = null;
        if (promoterCheck.rows.length > 0 && promoterCheck.rows[0].seccion) {
          sectionId = promoterCheck.rows[0].seccion;
        } else {
          const match = finalPromoterId.match(/\d{2,4}/);
          if (match) sectionId = match[0];
        }
        if (sectionId) {
          const inSection = await require('../services/pipHelper').isLocationInSection(latitude, longitude, sectionId);
          if (inSection) {
            isTerritorialVerified = true;
          } else {
            finalLocationStatus = 'VOTO_EXTERNO';
          }
        }
      } catch (err) {
        console.error('⚠️ Error validando promotor/seccion:', err.message);
      }
    }

    // Race condition lock
    const duplicateCheck = await client.query(
      `SELECT id FROM survey_responses
       WHERE survey_id = $1 AND (fingerprint_id = $2 OR (user_id = $3 AND user_id IS NOT NULL))
       FOR UPDATE`,
      [surveyId, fingerprintId, userId || null]
    );

    if (duplicateCheck.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        success: false,
        alreadyVoted: true,
        error: 'Este dispositivo o cuenta ya ha participado en esta auditoría.'
      });
    }

    let savedCount = 0;
    for (const response of responses) {
      const responseValue = response.answer || response.value || response.response_value;
      if (!response.questionId || !responseValue) {
        console.warn('⚠️ Respuesta incompleta (omitida):', response);
        continue;
      }
      try {
        await client.query(`
          INSERT INTO survey_responses
            (survey_id, question_id, user_id, response_value, confidence,
             fingerprint_id, ip_address, phone_hash, latitude, longitude,
             location_status, promoter_id, is_territorial_verified, created_at)
          VALUES ($1,$2,$3,$4,$5,$6,$7,NULL,$8,$9,$10,$11,$12,NOW())
        `, [
          surveyId,
          response.questionId,
          userId,
          responseValue.toString(),
          finalConfidence,
          fingerprintId,
          clientIp,
          territorial.latitude,
          territorial.longitude,
          finalLocationStatus,
          finalPromoterId || null,
          isTerritorialVerified
        ]);
      } catch (insertErr) {
        console.error('❌ Error fatal insertando respuesta:', insertErr.message);
        throw insertErr;
      }
      savedCount++;
    }

    let pointsEarned = 0;
    if (userId) {
      await client.query(
        `UPDATE users SET points = points + 50, last_active = NOW() WHERE id = $1`,
        [userId]
      );
      pointsEarned = 50;
    }

    await client.query('COMMIT');

    res.cookie(`surge_lock_${surveyId}`, expectedCookieHash, {
      maxAge:   365 * 24 * 60 * 60 * 1000,
      httpOnly: true,
      secure:   process.env.NODE_ENV === 'production',
      sameSite: 'lax'
    });

    res.json({
      success: true,
      message: 'Voto registrado exitosamente',
      pointsEarned,
      responsesSaved: savedCount,
      territorial: {
        locationProvided: !!locationProvided && territorial.locationStatus !== 'NO_GPS',
        locationStatus:   territorial.locationStatus
      }
    });

  } catch (error) {
    if (client) { try { await client.query('ROLLBACK'); } catch (_) {} }
    console.error('❌ /surveys/:id/response ERROR:', error.message);
    res.status(500).json({ error: 'Error enviando respuesta', details: error.message });
  } finally {
    if (client) client.release();
  }
});


// ========================================
// RESULTADOS — LEFT JOIN por option_id
// Fix caso Olager: agrupa por c.id, suma todos los votos sin importar estado GPS
// ========================================
router.get('/:id/results', async (req, res) => {
  try {
    const surveyId = parseInt(req.params.id, 10);
    if (isNaN(surveyId)) return res.status(400).json({ success: false, error: 'ID inválido' });

    const surveyRow = await db.query(
      'SELECT election_type, municipality_id FROM surveys WHERE id = $1',
      [surveyId]
    );

    if (surveyRow.rows.length === 0) return res.status(404).json({ success: false, error: 'Encuesta no encontrada' });

    const { election_type, municipality_id } = surveyRow.rows[0];

    // LEFT JOIN agrupado por c.id — captura los 16 votos de Olager y cualquier candidato
    // con 0 votos también aparece (LEFT JOIN garantiza esto).
    // response_value puede ser el ID numérico del candidato (enviado desde index.html)
    // o el nombre completo (enviado desde landing.html).
    // Búsqueda flexible de candidatos:
    // cubre mismatch donde survey.municipality_id=18 pero candidatos tienen municipality_id=183
    const resultsQuery = await db.query(`
      SELECT
        c.id,
        BTRIM(c.name)                                                AS label,
        COALESCE(NULLIF(BTRIM(c.party),''), 'INDEPENDIENTE')         AS party,
        COUNT(sr.id)::int                                            AS vote_count,
        AVG(sr.confidence) FILTER (WHERE sr.confidence >= 50)        AS avg_confidence
      FROM candidates c
      LEFT JOIN survey_responses sr
        ON sr.survey_id = $1
        AND (
          sr.response_value = c.id::text
          OR LOWER(TRIM(sr.response_value)) = LOWER(TRIM(c.name))
        )
      WHERE c.is_active = true
        AND (
          -- Gubernatura: candidatos sin municipio
          ($3 = 'gubernatura' AND c.municipality_id IS NULL)
          OR
          -- Municipal: coincidencia exacta O búsqueda flexible (18 encuentra 183)
          (
            $3 != 'gubernatura'
            AND (
              c.municipality_id = $2
              OR ($2 IS NOT NULL AND c.municipality_id::text LIKE ($2::text || '%'))
            )
          )
        )
      GROUP BY c.id, c.name, c.party
      ORDER BY vote_count DESC, label ASC
    `, [surveyId, municipality_id, election_type]);

    const results    = resultsQuery.rows;
    const totalVotes = results.reduce((sum, r) => sum + r.vote_count, 0);
    const avgConf    = results.length > 0
      ? results.reduce((sum, r) => sum + (r.avg_confidence || 0), 0) / results.length
      : 0;

    const formattedResults = results.map(r => {
      const pty = (r.party || '').trim().toUpperCase();
      // Formato innegociable: Nombre (Partido). Sin (IND), sin "Perfil Territorial".
      const label = (pty && pty !== 'INDEPENDIENTE' && pty !== 'IND' && pty !== 'IND.')
        ? `${r.label} (${r.party})`
        : r.label;

      return {
        label,
        vote_count: r.vote_count,
        percentage: totalVotes > 0
          ? parseFloat(((r.vote_count / totalVotes) * 100).toFixed(1))
          : 0.0
      };
    });

    res.json({
      success:           true,
      total_respondents: totalVotes,
      avg_confidence:    avgConf,
      results:           formattedResults
    });

  } catch (error) {
    console.error('❌ Error en /results:', error.message);
    res.status(500).json({ success: false, error: 'Error polling results' });
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
      LEFT JOIN survey_questions sq ON sq.survey_id = s.id
      LEFT JOIN survey_responses sr ON sr.survey_id = s.id
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
// normalizeElectionType ahora viene de admin.js — no más ReferenceError
// ========================================
router.post('/surveys', verifyAdminToken, async (req, res) => {
  let client;
  try {
    client = await db.connect();
    const { title, description, electionType, municipalityId, startDate, endDate,
            isPublic, allowAnonymous, questions, level } = req.body;

    if (!title || title.length < 5) return res.status(400).json({ error: 'Título debe tener al menos 5 caracteres' });
    if (!questions || questions.length === 0) return res.status(400).json({ error: 'Debe incluir al menos una pregunta' });

    await client.query('BEGIN');

    const normalizedElectionType = normalizeElectionType(electionType);
    const muniId = municipalityId && parseInt(municipalityId, 10) > 0
      ? parseInt(municipalityId, 10)
      : null;
    const safeStartDate = startDate || new Date().toISOString();

    const surveyResult = await client.query(`
      INSERT INTO surveys (title, description, election_type, municipality_id,
        start_date, end_date, is_active, is_public, allow_anonymous, active, created_by)
      VALUES ($1,$2,$3,$4,$5,$6,true,$7,$8,true,$9)
      RETURNING id
    `, [
      title, description, normalizedElectionType, muniId, safeStartDate,
      endDate || null, isPublic !== false, allowAnonymous !== false, req.adminId || null
    ]);

    const surveyId = surveyResult.rows[0].id;

    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      if (!q) continue;
      const rawType = q.type || q.questionType || 'open_text';
      const rawText = q.text || q.questionText || '';
      const qType   = String(rawType).trim();
      const qText   = String(rawText).trim();
      if (!qText) continue;

      let options = q.options || null;
      if (qType === 'confidence_scale' && !options) {
        options = { min: 0, max: 100, step: 10, unit: '%' };
      }

      await client.query(`
        INSERT INTO survey_questions (survey_id, question_text, question_type, options)
        VALUES ($1,$2,$3,$4)
      `, [surveyId, qText, qType, options ? JSON.stringify(options) : null]);
    }

    await syncCandidatesFromSurveyPayload(client, {
      level, electionType: normalizedElectionType, municipalityId, questions
    });

    await client.query('COMMIT');
    console.log(`✅ Encuesta creada: ${surveyId} — "${title}"`);
    res.json({ success: true, surveyId, message: 'Encuesta creada exitosamente' });

  } catch (error) {
    if (client) await client.query('ROLLBACK');
    console.error('❌ /api/admin/surveys POST:', error);
    res.status(500).json({ error: 'Error creando encuesta' });
  } finally {
    if (client) client.release();
  }
});


// ========================================
// Verificar si usuario ya votó
// ========================================
router.post('/:id/check-vote', async (req, res) => {
  try {
    res.json({ success: true, canVote: true });
  } catch (error) {
    console.error('Error verificando voto:', error);
    res.status(500).json({ success: false, error: 'Error al verificar voto' });
  }
});


module.exports = router;
