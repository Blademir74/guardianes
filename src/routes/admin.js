// src/routes/admin.js — VERSIÓN DEFINITIVA CORREGIDA
const express = require('express');
const router  = express.Router();
const db      = require('../db');
const { query } = db;
const jwt     = require('jsonwebtoken');
const bcrypt  = require('bcrypt');

const ADMIN_JWT_SECRET = process.env.ADMIN_JWT_SECRET || 'dev-admin-secret-2027';

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

    if (!title || title.length < 5) {
      return res.status(400).json({ error: 'Título debe tener al menos 5 caracteres' });
    }
    if (!questions || questions.length === 0) {
      return res.status(400).json({ error: 'Debe incluir al menos una pregunta' });
    }

    await client.query('BEGIN');

    const normalizedElectionType = normalizeElectionType(electionType);
    const muniId = municipalityId && parseInt(municipalityId, 10) > 0 ? parseInt(municipalityId, 10) : null;
    const safeStartDate = startDate || new Date().toISOString();

    const surveyResult = await client.query(
      `INSERT INTO surveys (title, description, election_type, municipality_id, start_date, end_date, is_active, is_public, allow_anonymous, active, created_by) 
       VALUES ($1, $2, $3, $4, $5, $6, true, $7, $8, true, $9) RETURNING id`,
      [title, description, normalizedElectionType, muniId, safeStartDate, endDate || null, isPublic !== false, allowAnonymous !== false, req.adminId || null]
    );

    const surveyId = surveyResult.rows[0].id;

    // Insertar preguntas
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      if (!q) continue;

      const qType = String(q.type || q.questionType || 'open_text').trim();
      const qText = String(q.text || q.questionText || '').trim();

      if (!qText) {
        console.warn('⚠️ Pregunta sin texto, omitida');
        continue;
      }

      let options = q.options || null;
      if (qType === 'confidence_scale' && !options) {
        options = { min: 0, max: 100, step: 10, unit: '%' };
      }

      await client.query(
        `INSERT INTO survey_questions (survey_id, question_text, question_type, options, is_required, order_num) 
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [surveyId, qText, qType, options ? JSON.stringify(options) : null, q.isRequired !== false, i + 1]
      );
    }

    // Sincronizar candidatos
    await syncCandidatesFromSurveyPayload(client, { level, electionType: normalizedElectionType, municipalityId: muniId, questions });

    await client.query('COMMIT');
    console.log(`✅ Encuesta creada: ${surveyId} — "${title}"`);
    res.json({ success: true, surveyId, message: 'Encuesta creada exitosamente' });

  } catch (error) {
    if (client) await client.query('ROLLBACK');
    console.error('❌ Error creando encuesta:', error);
    res.status(500).json({ error: 'Error creando encuesta', details: error.message });
  } finally {
    if (client) client.release();
  }
});

// ========================================
// LISTAR ENCUESTAS (GET)
// ========================================
router.get('/surveys', authenticateAdmin, async (req, res) => {
  try {
    const result = await query(`
      SELECT s.*, 
             (SELECT COUNT(*) FROM survey_responses WHERE survey_id = s.id) AS total_responses,
             CASE WHEN s.municipality_id IS NOT NULL THEN 'Municipal' 
                  WHEN s.election_type = 'gubernatura' THEN 'Gubernatura' 
                  ELSE 'General' END AS level
      FROM surveys s
      ORDER BY s.created_at DESC
    `);
    res.json(result.rows);
  } catch (error) {
    console.error('❌ Error listando encuestas:', error.message);
    res.status(500).json({ error: 'Error al listar encuestas' });
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
    const [users, predictions, surveys, incidents, pendingInc] = await Promise.all([
      query('SELECT COUNT(*) FROM users'),
      query('SELECT COUNT(*) FROM predictions'),
      query('SELECT COUNT(*) FROM surveys'),
      query('SELECT COUNT(*) FROM incidents'),
      query("SELECT COUNT(*) FROM incidents WHERE status = 'pending'")
    ]);

    res.json({
      totalUsers: parseInt(users.rows[0].count),
      totalPredictions: parseInt(predictions.rows[0].count),
      activeSurveys: parseInt(surveys.rows[0].count),
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

module.exports = router;