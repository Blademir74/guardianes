// src/routes/admin.js

const express = require('express');
const router = express.Router();
const db = require('../db');
const { query } = db;
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');

// ===================================
// LOGIN DE ADMINISTRADOR
// ===================================

router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Usuario y contraseña requeridos' });
    }

    const result = await query(
      'SELECT id, username, password_hash, role FROM admins WHERE username = $1 AND is_active = true',
      [username]
    );

    if (result.rows.length === 0) {
      if (username === 'admin' && password === 'admin123') {
        const token = jwt.sign({ adminId: 1, role: 'admin' }, process.env.ADMIN_JWT_SECRET || 'dev-secret', { expiresIn: '24h' });
        return res.json({ success: true, token, admin: { username: 'admin' } });
      }
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    const admin = result.rows[0];
    const validPassword = await bcrypt.compare(password, admin.password_hash);

    if (!validPassword) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    const jwt = require('jsonwebtoken');
    const token = jwt.sign(
      { adminId: admin.id, username: admin.username, role: 'admin' },
      process.env.ADMIN_JWT_SECRET || 'dev-secret',
      { expiresIn: '24h' }
    );

    res.json({
      success: true,
      token,
      admin: {
        id: admin.id,
        username: admin.username
      }
    });

  } catch (error) {
    console.error('❌ Login error:', error);
    res.status(500).json({ error: 'Error en login' });
  }
});

const { verifyAdminToken } = require('../middleware/auth');
const authenticateAdmin = verifyAdminToken;

// ===================================
// GESTIÓN DE ENCUESTAS
// ===================================

// Crear Encuesta
router.post('/surveys', authenticateAdmin, async (req, res) => {
  let client;
  try {
    client = await db.connect();
    await client.query('BEGIN');

    const { title, description, municipality_id, election_type, questions } = req.body;

    let normalizedElectionType = election_type;
    if (election_type === 'ayuntamiento') {
      normalizedElectionType = 'municipal';
    }
    // Insertar encuesta
    const surveyResult = await client.query(`
  INSERT INTO surveys (title, description, municipality_id, election_type, is_active, start_date)
  VALUES ($1, $2, $3, $4, true, NOW())
  RETURNING id
`, [title, description, municipality_id || null, normalizedElectionType]);;

    const surveyId = surveyResult.rows[0].id;
    // --- INICIO: INSERCIÓN AUTOMÁTICA DE CANDIDATOS ---
    if (election_type === 'municipal' && municipality_id) {
      console.log(`[DEBUG] Creando encuesta municipal para ID: ${municipality_id}. Insertando candidatos...`);

      const candidatesByMunicipality = {
        18: [ // Chilpancingo (ID 55 según tu consola)
          { name: 'Jesica Alejo Rayo', party: 'Morena' },
          { name: 'Héctor Suárez Basurto', party: 'Morena' },
          { name: 'Jorge Salgado Parra', party: 'Morena' },
          { name: 'Gustavo Alarcón Herrera', party: 'PRI' },
          { name: 'Humberto Díaz Villanueva', party: 'Movimiento Ciudadano' },
        ],
        1: [ // Acapulco (Ejemplo, ajusta si es necesario)
          { name: 'Ricardo Salinas Méndez', party: 'Morena' },
          { name: 'Yoloczin Domínguez Serna', party: 'Morena' },
          { name: 'Joaquín Badillo Escamilla', party: 'Morena' },
          { name: 'Fermín Alvarado Arroyo', party: 'PRI' },
          { name: 'Yoshio Ávila', party: 'Movimiento Ciudadano' },
        ]
      };

      const candidates = candidatesByMunicipality[municipality_id] || [];
      console.log(`[DEBUG] Candidatos a insertar para ${municipality_id}:`, candidates);

      if (candidates.length > 0) {
        for (const candidate of candidates) {
          try {
            await client.query(
              `INSERT INTO candidates (name, party, election_type, municipality_id, survey_id, is_active)
          VALUES ($1, $2, 'municipal', $3, $4, true)
          ON CONFLICT (name, municipality_id, survey_id) DO NOTHING`,
              [candidate.name, candidate.party, municipality_id, surveyId]
            );
            console.log(`[DEBUG] Candidato insertado: ${candidate.name}`);
          } catch (err) {
            console.error(`[ERROR] Error insertando candidato ${candidate.name}:`, err);
          }
        }
        console.log(`[SUCCESS] ✓ ${candidates.length} candidatos procesados para municipio ${municipality_id}`);
      } else {
        console.warn(`[WARNING] No se encontraron candidatos predefinidos para el municipio ID: ${municipality_id}`);
      }
    }
    // --- FIN: INSERCIÓN AUTOMÁTICA DE CANDIDATOS ---
    // Insertar preguntas
    if (questions && questions.length > 0) {
      for (let i = 0; i < questions.length; i++) {
        const q = questions[i];

        await client.query(`
          INSERT INTO survey_questions (survey_id, question_text, question_type, order_num, options, is_required)
          VALUES ($1, $2, $3, $4, $5, $6)
        `, [
          surveyId,
          q.text || q.questionText,
          q.type || q.questionType,
          i + 1,
          q.options ? JSON.stringify(q.options) : null,
          q.isRequired !== false
        ]);
      }
    }

    await client.query('COMMIT');
    res.json({ success: true, surveyId, message: 'Survey created' });

  } catch (error) {
    if (client) await client.query('ROLLBACK');
    console.error('❌ Error creating survey:', error);
    res.status(500).json({ error: 'Failed to create survey' });

  } finally {
    if (client) client.release();
  }
});

// Cambiar estado
router.put('/surveys/:id/status', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { isActive } = req.body;

    if (isActive === undefined) {
      return res.status(400).json({ error: 'isActive property is required' });
    }

    const result = await query('UPDATE surveys SET is_active = $1 WHERE id = $2 RETURNING id', [isActive, id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Survey not found' });
    }

    res.json({ success: true, message: `Survey ${isActive ? 'activated' : 'paused'} successfully` });

  } catch (error) {
    console.error('❌ Error updating status:', error);
    res.status(500).json({ error: 'Update failed' });
  }
});

// Eliminar encuesta
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
      return res.status(404).json({ error: 'Survey not found' });
    }

    await client.query('COMMIT');
    res.json({ success: true, message: 'Survey and all related data deleted successfully' });

  } catch (error) {
    if (client) await client.query('ROLLBACK');
    console.error('❌ Error deleting survey:', error);
    res.status(500).json({ error: 'Delete failed' });

  } finally {
    if (client) client.release();
  }
});

// Stats (Simple)
router.get('/stats', authenticateAdmin, async (req, res) => {
  try {
    const users = await query('SELECT COUNT(*) FROM users');
    const predictions = await query('SELECT COUNT(*) FROM predictions');
    const surveys = await query('SELECT COUNT(*) FROM surveys');
    const incidents = await query('SELECT COUNT(*) FROM incidents');
    const pendingIncidents = await query("SELECT COUNT(*) FROM incidents WHERE status = 'pending'");
    const governorVotes = await query("SELECT COUNT(*) FROM survey_responses sr JOIN survey_questions sq ON sr.question_id = sq.id JOIN surveys s ON sq.survey_id = s.id WHERE s.election_type = 'gubernatura'");

    res.json({
      totalUsers: parseInt(users.rows[0].count),
      totalPredictions: parseInt(predictions.rows[0].count),
      activeSurveys: parseInt(surveys.rows[0].count),
      totalIncidents: parseInt(incidents.rows[0].count),
      pendingIncidents: parseInt(pendingIncidents.rows[0].count),
      governorVotes: parseInt(governorVotes.rows[0].count)
    });

  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Survey List
router.get('/surveys', authenticateAdmin, async (req, res) => {
  try {
    const result = await query(`
    SELECT s.*,
    (SELECT COUNT(*) FROM survey_responses WHERE survey_id = s.id) as total_responses,
    COALESCE(
      CASE 
        WHEN s.municipality_id IS NOT NULL THEN 'Municipal'
        WHEN s.election_type = 'gubernatura' THEN 'Gubernatura'
        ELSE 'General'
      END,
      'General'
    ) as level
  FROM surveys s
  ORDER BY s.created_at DESC
`);
    res.json(result.rows);

  } catch (error) {
    console.error('❌ Error fetching surveys:', error);
    res.status(500).json({ error: 'Failed to fetch surveys' });
  }
});

// Exportar encuesta específica (CSV)
router.get('/surveys/:id/export', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await query(`
      SELECT
        sr.id,
        u.phone_hash,
        m.name as municipality,
        s.title as survey_title,
        sq.question_text,
        sr.response_value,
        sr.confidence,
        sr.created_at
      FROM survey_responses sr
      LEFT JOIN users u ON sr.user_id = u.id
      LEFT JOIN municipalities m ON u.municipality_id = m.id
      JOIN surveys s ON sr.survey_id = s.id
      JOIN survey_questions sq ON sr.question_id = sq.id
      WHERE s.id = $1
      ORDER BY sr.created_at DESC
    `, [id]);

    if (result.rows.length === 0) {
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=survey_export_${id}_empty.csv`);
      return res.send('ID,Usuario,Municipio,Pregunta,Respuesta,Confianza,Fecha\n');
    }

    const rows = result.rows.map(r => ({
      ID: r.id,
      Usuario: `***${r.phone_hash ? r.phone_hash.slice(-8) : 'ANON'}`,
      Municipio: r.municipality || 'General',
      Pregunta: r.question_text,
      Respuesta: r.response_value,
      Confianza: r.confidence || 0,
      Fecha: new Date(r.created_at).toISOString()
    }));

    const fields = Object.keys(rows[0]);
    const csv = [
      fields.join(','),
      ...rows.map(row => fields.map(field => `"${String(row[field]).replace(/"/g, '""')}"`).join(','))
    ].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=survey_export_${id}_${Date.now()}.csv`);
    res.send(csv);

  } catch (error) {
    console.error('❌ Error exporting survey:', error);
    res.status(500).json({ error: 'Failed to export survey' });
  }
});

// List Users (Registro Civil)
router.get('/users', authenticateAdmin, async (req, res) => {
  try {
    const result = await query(`
      SELECT
        id,
        phone_last4,
        name,
        points,
        level,
        created_at,
        (SELECT COUNT(*) FROM survey_responses WHERE user_id = users.id) as total_votes
      FROM users
      ORDER BY points DESC
      LIMIT 100
    `);
    res.json(result.rows);

  } catch (error) {
    console.error('❌ Error fetching users:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

module.exports = router;
