// src/routes/admin.js — VERSIÓN DEFINITIVA CORREGIDA
const express = require('express');
const router = express.Router();
const db = require('../db');
const { query } = db;
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');

const ADMIN_JWT_SECRET = process.env.ADMIN_JWT_SECRET || 'admin-secret-2027-guerrero';

// Helper: normalizar tipo de elección
function normalizeElectionType(raw) {
  if (!raw) return 'municipal';
  const lower = raw.toLowerCase().trim();
  if (lower === 'gubernatura') return 'gubernatura';
  if (['municipal', 'ayuntamiento'].includes(lower)) return 'municipal';
  return lower;
}

// Helper: sincronizar candidatos
async function syncCandidatesFromSurveyPayload(client, payload) {
  try {
    const { electionType, municipalityId, level, questions } = payload;
    let muniId = null;
    const normalizedType = normalizeElectionType(electionType);

    const isGubernatura = (level && level.toLowerCase() === 'estado') || normalizedType === 'gubernatura';

    if (!isGubernatura) {
      const parsed = parseInt(municipalityId, 10);
      muniId = Number.isNaN(parsed) ? null : parsed;
    }

    const candidates = [];
    (questions || []).forEach(q => {
      const qType = (q.type || q.questionType || '').toLowerCase();
      if (qType === 'single_choice' && Array.isArray(q.options)) {
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
      console.log('ℹ️ Sin candidatos para sincronizar');
      return;
    }

    console.log(`🔁 Sincronizando ${candidates.length} candidatos para municipio=${muniId}`);

    await client.query(
      `DELETE FROM candidates WHERE ((municipality_id = $1) OR ($1 IS NULL AND municipality_id IS NULL)) AND (election_type = $2 OR $2 IS NULL)`,
      [muniId, normalizedType || null]
    );

    for (const cand of candidates) {
      await client.query(
        `INSERT INTO candidates (name, party, municipality_id, election_type, is_active, photo_url) VALUES ($1, $2, $3, $4, true, $5)`,
        [cand.name, cand.party, muniId, normalizedType || null, cand.photo_url]
      );
    }
    console.log(`✅ ${candidates.length} candidatos sincronizados`);
  } catch (err) {
    console.error('❌ Error sync candidatos:', err.message);
  }
}

// Middleware de auth
const { verifyAdminToken } = require('../middleware/auth');
const authenticateAdmin = verifyAdminToken;

// ========================================
// LOGIN
// ========================================
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Usuario y contraseña requeridos' });
    }

    const result = await query('SELECT id, username, password_hash, role FROM admins WHERE username = $1 AND is_active = true', [username]);
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    const admin = result.rows[0];
    const validPassword = await bcrypt.compare(password, admin.password_hash);
    if (!validPassword) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    const token = jwt.sign(
      { adminId: admin.id, username: admin.username, role: 'admin' },
      ADMIN_JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.cookie('admin_jwt_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production' || process.env.NODE_ENV !== 'development',
      sameSite: 'strict',
      maxAge: 24 * 60 * 60 * 1000 // 24 horas
    });

    res.json({ success: true, token, admin: { id: admin.id, username: admin.username } });
  } catch (error) {
    console.error('❌ Login error:', error.message);
    res.status(500).json({ error: 'Error en login' });
  }
});

// ========================================
// CREAR ENCUESTA (POST)
// ========================================
router.post('/surveys', authenticateAdmin, async (req, res) => {
  let client;
  try {
    client = await db.connect();
    const { title, description, electionType, municipalityId, startDate, endDate, isPublic, allowAnonymous, questions, level } = req.body;

    // Validación básica quirúrgica
    if (!title || title.length < 3) {
      return res.status(400).json({ error: 'Título demasiado corto' });
    }

    await client.query('BEGIN');

    const normalizedElectionType = normalizeElectionType(electionType);
    const muniId = municipalityId && parseInt(municipalityId, 10) > 0 ? parseInt(municipalityId, 10) : null;
    const safeStartDate = startDate || new Date().toISOString();

    // 1. Insertar en surveys (Soporte dual is_active/active y total_respondents)
    const surveyResult = await client.query(
      `INSERT INTO surveys 
       (title, description, election_type, municipality_id, start_date, end_date, is_active, active, is_public, allow_anonymous, created_by, total_respondents) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $7, $8, $9, $10, 0) RETURNING id`,
      [title, description, normalizedElectionType, muniId, safeStartDate, endDate || null, true, isPublic !== false, allowAnonymous !== false, req.adminId || null]
    );

    const surveyId = surveyResult.rows[0].id;

    // 2. Insertar preguntas y opciones
    if (questions && Array.isArray(questions)) {
      for (let i = 0; i < questions.length; i++) {
        const q = questions[i];
        if (!q) continue;

        // Normalización Quirúrgica de tipos
        let qType = String(q.type || q.questionType || 'text').toLowerCase().trim();
        if (qType === 'singlechoice') qType = 'single_choice';
        if (qType === 'multiplechoice') qType = 'multiple_choice';
        if (qType === 'confidencescale') qType = 'confidence_scale';

        const qText = String(q.text || q.questionText || '').trim();
        if (!qText) continue;

        // Insertar Pregunta
        const questionResult = await client.query(
          `INSERT INTO survey_questions (survey_id, question_text, question_type, is_required, order_num) 
           VALUES ($1, $2, $3, $4, $5) RETURNING id`,
          [surveyId, qText, qType, q.isRequired !== false, i + 1]
        );
        const questionId = questionResult.rows[0].id;

        // 3. Relación de Opciones (survey_options)
        if (Array.isArray(q.options) && q.options.length > 0) {
          for (let j = 0; j < q.options.length; j++) {
            const opt = q.options[j];
            const optLabel = (opt.label || opt.value || '').trim();
            if (!optLabel) continue;

            await client.query(
              `INSERT INTO survey_options (survey_id, option_label, option_value, photo_url, order_num) 
               VALUES ($1, $2, $3, $4, $5)`,
              [surveyId, optLabel, opt.value || optLabel, opt.photo || null, j + 1]
            );
          }
        }
      }
    }

    // 4. Protocolo Obligatorio: Slider de Confianza si no existe
    const hasConfidence = (questions || []).some(q => {
      const t = String(q.type || q.questionType || '').toLowerCase();
      return t === 'confidence_scale' || t === 'confidencescale';
    });

    if (!hasConfidence) {
      await client.query(
        `INSERT INTO survey_questions (survey_id, question_text, question_type, is_required, order_num) 
         VALUES ($1, 'Nivel de Confianza en la Predicción', 'confidence_scale', true, 99)`,
        [surveyId]
      );
    }

    // Sincronizar candidatos (Legacy Support)
    await syncCandidatesFromSurveyPayload(client, { level, electionType: normalizedElectionType, municipalityId: muniId, questions });

    await client.query('COMMIT');
    res.json({ success: true, surveyId, message: 'Sistema Auditado Activo: Encuesta Desplegada' });

  } catch (error) {
    if (client) await client.query('ROLLBACK');
    console.error('❌ Error Crítico en Terminal de Encuestas:', error);
    res.status(500).json({ 
      error: 'Error en protocolo de despliegue', 
      details: error.message,
      code: error.code || 'DB_EXEC_FAILURE'
    });
  } finally {
    if (client) client.release();
  }
});

// ========================================
// LISTAR ENCUESTAS (GET)
// ========================================
router.get('/surveys', authenticateAdmin, async (req, res) => {
  try {
    const result = await db.query(`
      SELECT
        s.id,
        s.title,
        s.description,
        s.election_type,
        s.is_active,
        s.municipality_id,
        s.created_at,
        COALESCE(s.total_respondents, (
          SELECT COUNT(DISTINCT user_id)::int
          FROM survey_responses sr
          WHERE sr.survey_id = s.id
        )) AS totalresponses,
        (SELECT AVG(confidence)::float FROM survey_responses WHERE survey_id = s.id) as avg_confidence
      FROM surveys s
      ORDER BY s.created_at DESC
    `);
    res.json(result.rows);
  } catch (err) {
    console.error('❌ Error GET /admin/surveys:', err.message);
    res.status(500).json({ error: 'Error recuperando auditoría de encuestas', details: err.message });
  }
});

// ========================================
// CAMBIAR ESTADO
// ========================================
router.put('/surveys/:id/status', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { isActive } = req.body;
    if (isActive === undefined) return res.status(400).json({ error: 'isActive requerido' });

    const result = await query('UPDATE surveys SET is_active = $1 WHERE id = $2 RETURNING id', [isActive, id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Encuesta no encontrada' });

    res.json({ success: true, message: `Encuesta ${isActive ? 'activada' : 'pausada'}` });
  } catch (error) {
    console.error('❌ Error actualizando estado:', error.message);
    res.status(500).json({ error: 'Error actualizando estado' });
  }
});

// ========================================
// ELIMINAR ENCUESTA
// ========================================
router.delete('/surveys/:id', authenticateAdmin, async (req, res) => {
  let client;
  try {
    const { id } = req.params;
    client = await db.connect();
    await client.query('BEGIN');

    await client.query('DELETE FROM survey_responses WHERE survey_id = $1', [id]);
    await client.query('DELETE FROM survey_questions WHERE survey_id = $1', [id]);
    const deleteResult = await client.query('DELETE FROM surveys WHERE id = $1 RETURNING id', [id]);

    if (deleteResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Encuesta no encontrada' });
    }

    await client.query('COMMIT');
    res.json({ success: true, message: 'Encuesta eliminada' });
  } catch (error) {
    if (client) await client.query('ROLLBACK');
    console.error('❌ Error eliminando:', error.message);
    res.status(500).json({ error: 'Error eliminando encuesta' });
  } finally {
    if (client) client.release();
  }
});

// ========================================
// STATS
// ========================================
router.get('/stats', authenticateAdmin, async (req, res) => {
  try {
    const [users, predictions, surveys, activeSurveys, totalResponses, incidents, pendingInc] = await Promise.all([
      query('SELECT COUNT(*) FROM users'),
      query('SELECT COUNT(*) FROM predictions'),
      query('SELECT COUNT(*) FROM surveys'),
      query("SELECT COUNT(*) FROM surveys WHERE is_active = true"),
      query('SELECT COUNT(*) FROM survey_responses'),
      query('SELECT COUNT(*) FROM incidents'),
      query("SELECT COUNT(*) FROM incidents WHERE status = 'pending'")
    ]);

    res.json({
      totalUsers: parseInt(users.rows[0].count),
      totalPredictions: parseInt(predictions.rows[0].count),
      totalSurveys: parseInt(surveys.rows[0].count),
      activeSurveys: parseInt(activeSurveys.rows[0].count),
      totalResponses: parseInt(totalResponses.rows[0].count),
      totalIncidents: parseInt(incidents.rows[0].count),
      pendingIncidents: parseInt(pendingInc.rows[0].count)
    });
  } catch (error) {
    console.error('❌ Error stats:', error.message);
    res.status(500).json({ error: 'Error obteniendo estadísticas' });
  }
});

// ========================================
// LISTAR USUARIOS
// ========================================
router.get('/users', authenticateAdmin, async (req, res) => {
  try {
    const result = await query(`
      SELECT id, phone_last4, name, points, level, created_at,
             (SELECT COUNT(*) FROM survey_responses WHERE user_id = users.id) AS total_votes
      FROM users ORDER BY points DESC LIMIT 100
    `);
    res.json(result.rows);
  } catch (error) {
    console.error('❌ Error usuarios:', error.message);
    res.status(500).json({ error: 'Error obteniendo usuarios' });
  }
});

// ========================================
// EXPORTAR CSV
// ========================================

router.get('/surveys/:id/export', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    
    console.log(`📊 Exportando encuesta ${id} en formato optimizado...`);

    // 1. Obtener info de la encuesta
    const surveyCheck = await query(`
      SELECT s.title, s.election_type, m.name as municipality_name
      FROM surveys s
      LEFT JOIN municipalities m ON s.municipality_id = m.id
      WHERE s.id = $1
    `, [id]);

    if (surveyCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Encuesta no encontrada' });
    }

    const { title, election_type, municipality_name } = surveyCheck.rows[0];
    const surveyTitle = title.replace(/[^a-zA-Z0-9]/g, '_');

    // 2. Obtener mapa de candidatos
    const candidatesRes = await query('SELECT id, name, party FROM candidates');
    const candidateMap = {};
    candidatesRes.rows.forEach(c => {
      candidateMap[String(c.id)] = { name: c.name, party: c.party };
      candidateMap[`candidato_${c.id}`] = { name: c.name, party: c.party };
    });

    // 3. Mapa de regiones Guerrero
    const guerreroRegions = {
      '721': 'Norte', '727': 'Norte', '732': 'Tierra Caliente', '733': 'Norte',
      '736': 'Norte', '741': 'Costa Chica', '742': 'Costa Grande', '744': 'Acapulco',
      '745': 'Costa Chica', '747': 'Centro', '753': 'Costa Grande', '754': 'Centro',
      '755': 'Costa Grande', '756': 'Montaña', '757': 'Montaña', '758': 'Costa Grande',
      '762': 'Norte', '767': 'Tierra Caliente', '781': 'Costa Grande'
    };

    // 4. Obtener TODAS las respuestas con IDs de sesión para diferenciar anónimos
    const result = await query(`
      SELECT 
        sr.user_id,
        sr.fingerprint_id,
        sr.ip_address,
        sr.created_at,
        sr.latitude,
        sr.longitude,
        sr.location_status,
        sq.question_text,
        sq.question_type,
        sr.response_value,
        sr.confidence,
        COALESCE(u.phone_last4, '0000') AS phone_last4,
        u.area_code,
        u.name AS user_name
      FROM survey_responses sr
      JOIN survey_questions sq ON sq.id = sr.question_id
      LEFT JOIN users u ON u.id = sr.user_id
      WHERE sr.survey_id = $1
      ORDER BY sr.created_at DESC, sr.user_id
    `, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'No hay respuestas para esta encuesta' });
    }

    // 5. TRANSFORMACIÓN: Agrupar por sesión/usuario (CLAVE ÚNICA PARA NO SOBRESCRIBIR)
    const userResponses = {};
    const questionSet = new Set();

    result.rows.forEach(row => {
      // Clave única basada en userId o (fingerprint + ip + fecha truncada) para agrupar respuestas de un mismo envío
      const sessionKey = row.user_id 
        ? `user_${row.user_id}` 
        : `anon_${row.fingerprint_id || 'no-fp'}_${row.ip_address || 'no-ip'}_${new Date(row.created_at).getTime()}`;
      
      if (!userResponses[sessionKey]) {
        userResponses[sessionKey] = {
          telefono: row.user_id ? `****${row.phone_last4}` : 'ANÓNIMO',
          nombre: row.user_name || 'ANÓNIMO',
          region: guerreroRegions[row.area_code] || 'Desconocida',
          area_code: row.area_code || 'N/A',
          fecha: row.created_at,
          latitude: row.latitude ?? null,
          longitude: row.longitude ?? null,
          location_status: row.location_status ?? null,
          respuestas: {}
        };
      }

      // Limpiar pregunta para usar como columna
      let questionKey = row.question_text
        .replace(/[¿?]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .substring(0, 60);

      questionSet.add(questionKey);

      // Limpiar respuesta
      let cleanAnswer = row.response_value || '';

      // Si es confidence_scale, usar el valor directo
      if (row.question_type === 'confidence_scale') {
        cleanAnswer = row.confidence || cleanAnswer || '0';
      } else {
        // Resolver nombre de candidato si aplica
        if (candidateMap[cleanAnswer]) {
          const cand = candidateMap[cleanAnswer];
          cleanAnswer = `${cand.name} (${cand.party})`;
        } else {
          // Limpiar formato residual
          cleanAnswer = cleanAnswer
            .replace(/candidato_\d+/g, '')
            .replace(/\(\d+\)/g, '')
            .replace(/\s+/g, ' ')
            .trim();
        }
      }

      userResponses[sessionKey].respuestas[questionKey] = cleanAnswer;
    });

    // 6. Generar CSV HORIZONTAL
    const allQuestions = Array.from(questionSet);

    // Headers
    const headers = [
      'Teléfono',
      'Nombre',
      'Región',
      'LADA',
      'Fecha',
      'Latitude',
      'Longitude',
      'LocationStatus',
      ...allQuestions
    ];

    // Rows
    const csvRows = [headers.join(',')];

    Object.values(userResponses).forEach(user => {
      const row = [
        user.telefono,
        `"${user.nombre.replace(/"/g, '""')}"`,
        user.region,
        user.area_code,
        new Date(user.fecha).toLocaleString('es-MX', { 
          timeZone: 'America/Mexico_City',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit'
        }),
        user.latitude ?? '',
        user.longitude ?? '',
        user.location_status ?? ''
      ];

      // Agregar respuestas en orden
      allQuestions.forEach(q => {
        const answer = user.respuestas[q] || 'Sin respuesta';
        // Escapar comillas y envolver si tiene comas
        const escaped = String(answer).replace(/"/g, '""');
        row.push(escaped.includes(',') ? `"${escaped}"` : escaped);
      });

      csvRows.push(row.join(','));
    });

    // 7. Generar contenido final
    const csvContent = '\uFEFF' + csvRows.join('\n');

    // 8. Enviar respuesta
    const fileName = `encuesta_${id}_${surveyTitle}_${Date.now()}.csv`;
    
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Cache-Control', 'no-cache');
    res.send(csvContent);

    console.log(`✅ Exportación completada: ${Object.keys(userResponses).length} participantes, ${allQuestions.length} preguntas`);

  } catch (error) {
    console.error('❌ Error exportando CSV:', error);
    res.status(500).json({ 
      error: 'Error exportando datos',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});
module.exports = router;