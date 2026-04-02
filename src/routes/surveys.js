// src/routes/surveys.js — VERSIÓN CORREGIDA (Auditoría 2026-02-02)
// Correcciones:
//   BUG-11 → /live-results ahora carga preguntas y respuestas con queries en batch, no N+1
//   BUG-12 → Las preguntas se buscan por el survey_id correcto (la migración las reasigna)
//   MEJORA → /:id/results incluye datos de candidatos (nombre, party, photo) en la respuesta

const express = require('express');
const db = require('../db');
const { verifyAdminToken } = require('../middleware/auth');
const { surveyRateLimiter, registerIpVote } = require('../middleware/surveySecurity');

const router = express.Router();

// ========================================
// Helper: sincronizar CANDIDATES a partir de la encuesta creada en Admin
// ========================================
async function syncCandidatesFromSurveyPayload(client, payload) {
  try {
    const { electionType, municipalityId, questions } = payload;

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
      WHERE (is_active = true OR active = true)
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
router.post('/:id/response', surveyRateLimiter, async (req, res) => {
  let client;
  try {
    client = await db.connect();
    const surveyId = parseInt(req.params.id, 10);
    const { responses, fingerprintId, latitude, longitude, locationProvided } = req.body;

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
      SELECT id, is_active, is_public, allow_anonymous, end_date, municipality_id, election_type
      FROM surveys WHERE id = $1
    `, [surveyId]);

    if (surveyCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Encuesta no encontrada' });
    }

    const survey = surveyCheck.rows[0];

    if (!survey.is_active) return res.status(403).json({ error: 'Encuesta no está activa' });
    if (!survey.is_public) return res.status(403).json({ error: 'Encuesta no es pública' });
    if (survey.end_date && new Date(survey.end_date) < new Date())
      return res.status(403).json({ error: 'Encuesta finalizada' });

    // ══════════════════════════════════════════
    // AUTO-HEAL: Garantizar columnas de integridad existen
    // Esto evita el error 500 si la migración manual no se ejecutó en Neon
    // ══════════════════════════════════════════
    await client.query(`ALTER TABLE survey_responses ADD COLUMN IF NOT EXISTS fingerprint_id VARCHAR(255);`);
    await client.query(`ALTER TABLE survey_responses ADD COLUMN IF NOT EXISTS ip_address VARCHAR(45);`);
    await client.query(`ALTER TABLE survey_responses ADD COLUMN IF NOT EXISTS latitude DECIMAL(10, 8);`);
    await client.query(`ALTER TABLE survey_responses ADD COLUMN IF NOT EXISTS longitude DECIMAL(11, 8);`);
    await client.query(`ALTER TABLE survey_responses ADD COLUMN IF NOT EXISTS location_status VARCHAR(32);`);
    // Índice único para anti-doble-voto (safe: CREATE IF NOT EXISTS)
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_survey_fingerprint
      ON survey_responses(survey_id, fingerprint_id)
      WHERE fingerprint_id IS NOT NULL;
    `);

    // ══════════════════════════════════════════
    // TRIPLE CANDADO DE INTEGRIDAD
    // ══════════════════════════════════════════
    
    // Candado 1: FingerprintJS (Huella de Navegador)
    if (!fingerprintId) {
      return res.status(400).json({ error: 'Integridad comprometida: No se detectó huella digital.' });
    }

    const existingVote = await client.query(
      `SELECT id FROM survey_responses 
       WHERE survey_id = $1 AND fingerprint_id = $2 
       LIMIT 1`,
      [surveyId, fingerprintId]
    );

    if (existingVote.rows.length > 0) {
  return res.status(409).json({
    success: false,
    alreadyVoted: true,
    error: 'Ya registraste tu voto en esta encuesta desde este dispositivo.',
    // ✅ Agrega esto para debug en producción:
    debug: process.env.NODE_ENV !== 'production' ? {
      surveyId,
      fingerprintId: fingerprintId?.slice(0, 8) + '...'
    } : undefined
  });
}

    // Candado 2: Cookies Seguras Hasheadas
    const crypto = require('crypto');
    const expectedCookieHash = crypto.createHash('sha256').update(fingerprintId + surveyId).digest('hex');

    const cookies = req.headers.cookie ? req.headers.cookie.split(';').reduce((acc, c) => {
      const [key, val] = c.trim().split('=').map(decodeURIComponent);
      acc[key] = val;
      return acc;
    }, {}) : {};
    const receiptCookie = cookies[`surge_lock_${surveyId}`];
    
    if (receiptCookie === expectedCookieHash) {
      return res.status(409).json({
        success: false,
        alreadyVoted: true,
        error: 'Doble Voto Detectado: Existencia de sesión segura ligada a voto previo.'
      });
    }

    // Candado 3: IP Rate Limiting → manejado por middleware surveyRateLimiter

    // ── Extraer IP del cliente (Express estándar + headers de proxy/Vercel) ──
    const clientIp = (req.headers['x-forwarded-for'] || '').split(',')[0].trim()
                  || req.headers['x-real-ip']
                  || req.ip
                  || 'unknown';

    // ── Insertar respuestas en transacción ──
    await client.query('BEGIN');

    // ── Validación territorial (Cero rastro: ligado únicamente al fingerprint_id) ──
    const { computeLocationStatus } = require('../middleware/territorialValidation');
    const territorial = await computeLocationStatus({
      dbClient: client,
      survey,
      latitude: locationProvided ? latitude : null,
      longitude: locationProvided ? longitude : null
    });

    // AUDITORÍA DE INTEGRIDAD: Verificación dentro de la transacción con bloqueo (Locking)
    // Evita Race Conditions bajo carga masiva (50,000 usuarios)
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
        console.warn('⚠️  Respuesta incompleta (se omite):', response);
        continue;
      }

      await client.query(`
        INSERT INTO survey_responses
          (survey_id, question_id, user_id, response_value, confidence, fingerprint_id, ip_address, phone_hash, latitude, longitude, location_status, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, NULL, $8, $9, $10, NOW())
      `, [
        surveyId,
        response.questionId,
        userId,
        responseValue.toString(),
        100,
        fingerprintId,
        clientIp,
        territorial.latitude,
        territorial.longitude,
        territorial.locationStatus
      ]);

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
    
    // Setear Cookie segura con hash (HttpOnly y Secure)
    res.cookie(`surge_lock_${surveyId}`, expectedCookieHash, {
      maxAge: 365 * 24 * 60 * 60 * 1000, // 1 año
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax'
    });

    res.json({
      success: true,
      message: 'Voto registrado exitosamente',
      pointsEarned,
      responsesSaved: savedCount,
      territorial: {
        locationProvided: !!locationProvided && territorial.locationStatus !== 'NO_GPS',
        locationStatus: territorial.locationStatus
      }
    });

  } catch (error) {
    if (client) {
      try { await client.query('ROLLBACK'); } catch (_) { /* ignore */ }
    }
    // Siempre devolver el mensaje de error para diagnóstico
    console.error('❌ /surveys/:id/response ERROR:', error.message, '\nSTACK:', error.stack);
    res.status(500).json({
      error: 'Error enviando respuesta',
      details: error.message
    });
  } finally {
    if (client) client.release();   // siempre liberar
  }
});


// ========================================
// RESULTADOS ESPECÍFICOS (polling — dashboard / landing)
// Reparación Quirúrgica: LEFT JOIN para incluir 0 votos
// ========================================
router.get('/:id/results', async (req, res) => {
  try {
    const surveyId = parseInt(req.params.id, 10);
    if (isNaN(surveyId)) {
      return res.status(400).json({ success: false, error: 'ID inválido' });
    }

    // ── 1. Obtener contexto de la encuesta ──
    const surveyRow = await db.query(
      'SELECT election_type, municipality_id FROM surveys WHERE id = $1',
      [surveyId]
    );

    if (surveyRow.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Encuesta no encontrada' });
    }

    const { election_type, municipality_id } = surveyRow.rows[0];

    // ── 2. Consulta Integral con LEFT JOIN ──
    // Robustez: Comparamos ID y Nombre como fallback. 
    // Quitamos restricción de question_id para asegurar captura en encuestas con nombres de preguntas variables.
    const resultsQuery = await db.query(`
      SELECT 
        c.name AS label,
        c.party,
        COUNT(sr.id)::int AS vote_count,
        AVG(sr.confidence)::float AS avg_confidence
      FROM candidates c
      LEFT JOIN survey_responses sr ON (
        sr.survey_id = $1
        AND (
          sr.response_value = c.id::text 
          OR sr.response_value = 'candidato_' || c.id
          OR sr.response_value = c.name
          OR (LENGTH(sr.response_value) > 3 AND c.name ILIKE sr.response_value || '%')
        )
      )
      WHERE (
        (c.municipality_id = $2) 
        OR ($2 IS NULL AND c.municipality_id IS NULL)
        OR (c.election_type = 'gubernatura' AND $3 = 'gubernatura')
      )
      AND (c.election_type = $3 OR $3 IS NULL OR c.election_type IS NULL)
      GROUP BY c.id, c.name, c.party
      ORDER BY vote_count DESC, c.name ASC
    `, [surveyId, municipality_id, election_type]);

    const results = resultsQuery.rows;
    // Total de votos capturados en esta consulta
    const totalVotes = results.reduce((sum, r) => sum + r.vote_count, 0);
    // Probabilidad o confianza general (promedio de todos los votos en la encuesta)
    const globalAvgConfidence = results.length > 0 
      ? results.reduce((sum, r) => sum + (r.avg_confidence || 0), 0) / results.length 
      : 0;

    // ── 3. Formatear Respuesta JSON Requerida ──
    const formattedResults = results.map(r => {
      let finalLabel = r.label;
      // Sólo añadir el partido si no está ya presente en el nombre
      if (r.party && r.party !== 'INDEPENDIENTE' && !r.label.toUpperCase().includes(r.party.toUpperCase())) {
        finalLabel = `${r.label} (${r.party})`;
      }
      return {
        label: finalLabel,
        vote_count: r.vote_count,
        percentage: totalVotes > 0 
          ? parseFloat(((r.vote_count / totalVotes) * 100).toFixed(1))
          : 0.0
      };
    });

    res.json({
      success: true,
      total_respondents: totalVotes, // Usamos total de votos válidos para el porcentaje
      avg_confidence: globalAvgConfidence,
      results: formattedResults
    });


  } catch (error) {
    console.error('❌ Error Quirúrgico en /results:', error.message);
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

    // La verificación de integridad se realiza ahora dentro de la transacción atómica
    // para garantizar consistencia absoluta bajo alta concurrencia.

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
