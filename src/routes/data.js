// src/routes/data.js — ESTÁNDAR DE ORO v3
// [FIX-MUN]   Búsqueda flexible de municipality_id (cubre mismatch 18 vs 183)
// [FIX-PARTY] COALESCE garantiza que party nunca llega NULL al frontend
// [FIX-CROSS] Endpoint /by-survey/:surveyId evita contaminación entre encuestas

const express = require('express');
const router  = express.Router();
const { query } = require('../db');

const candidateSelect = `
  id,
  id AS numeric_id,
  BTRIM(name) AS name,
  COALESCE(NULLIF(BTRIM(party),''), 'INDEPENDIENTE') AS party,
  COALESCE(
    NULLIF(photo_url,''),
    CONCAT('https://ui-avatars.com/api/?name=', REPLACE(BTRIM(name),' ','+'), '&size=200&background=1a1a2e&color=d4af37')
  ) AS photo_url,
  COALESCE(
    NULLIF(photo_url,''),
    CONCAT('https://ui-avatars.com/api/?name=', REPLACE(BTRIM(name),' ','+'), '&size=200&background=1a1a2e&color=d4af37')
  ) AS img,
  election_type,
  municipality_id
`;

// ── Municipios ────────────────────────────────────────────────────────────
router.get('/municipalities', async (req, res) => {
  try {
    const result = await query('SELECT id, name FROM municipalities ORDER BY name');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Error obteniendo municipios' });
  }
});

// ── Candidatos por municipio o gubernatura ────────────────────────────────
// Búsqueda flexible: intenta ID exacto, si no hay resultados usa LIKE 'ID%'
// Esto cubre el mismatch donde survey.municipality_id=18 pero candidatos tienen 183
router.get('/candidates/:municipioId', async (req, res) => {
  try {
    const { municipioId } = req.params;

    if (municipioId === 'gubernatura') {
      const r = await query(`SELECT ${candidateSelect} FROM candidates WHERE municipality_id IS NULL AND is_active = true ORDER BY id`);
      console.log(`✅ Candidatos gubernatura: ${r.rows.length}`);
      return res.json(r.rows);
    }

    const muniId = parseInt(municipioId, 10);
    if (isNaN(muniId)) return res.status(400).json({ error: 'ID inválido' });

    let r = await query(`SELECT ${candidateSelect} FROM candidates WHERE municipality_id = $1 AND is_active = true ORDER BY name`, [muniId]);

    if (r.rows.length === 0) {
      console.warn(`⚠️ Sin candidatos para municipality_id=${muniId}, buscando LIKE '${muniId}%'`);
      r = await query(`SELECT ${candidateSelect} FROM candidates WHERE municipality_id::text LIKE $1 AND is_active = true ORDER BY name`, [`${muniId}%`]);
    }

    console.log(`✅ /data/candidates/${municipioId}: ${r.rows.length} candidatos`);
    res.json(r.rows);

  } catch (err) {
    console.error('❌ /candidates:', err.message);
    res.status(500).json({ error: 'Error obteniendo candidatos', details: err.message });
  }
});

// ── Candidatos por encuesta (anti-contaminación) ──────────────────────────
// index.html y landing.html deben usar este endpoint para garantizar que
// solo se muestran los candidatos de LA encuesta activa, sin importar otros municipios
router.get('/candidates/by-survey/:surveyId', async (req, res) => {
  try {
    const surveyId = parseInt(req.params.surveyId, 10);
    if (isNaN(surveyId)) return res.status(400).json({ error: 'surveyId inválido' });

    const sv = await query('SELECT municipality_id, election_type FROM surveys WHERE id = $1', [surveyId]);
    if (sv.rows.length === 0) return res.status(404).json({ error: 'Encuesta no encontrada' });

    const { municipality_id, election_type } = sv.rows[0];
    const isGub = election_type === 'gubernatura';

    let r;
    if (isGub) {
      r = await query(`SELECT ${candidateSelect} FROM candidates WHERE municipality_id IS NULL AND is_active = true ORDER BY id`);
    } else {
      r = await query(`SELECT ${candidateSelect} FROM candidates WHERE municipality_id = $1 AND is_active = true ORDER BY name`, [municipality_id]);
      if (r.rows.length === 0) {
        r = await query(`SELECT ${candidateSelect} FROM candidates WHERE municipality_id::text LIKE $1 AND is_active = true ORDER BY name`, [`${municipality_id}%`]);
      }
    }

    console.log(`✅ /data/candidates/by-survey/${surveyId}: ${r.rows.length} candidatos`);
    res.json(r.rows);

  } catch (err) {
    console.error('❌ /candidates/by-survey:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Comparación histórica ──────────────────────────────────────────────────
router.get('/comparison/:municipioId', async (req, res) => {
  try {
    const muniId = parseInt(req.params.municipioId, 10);
    if (isNaN(muniId)) return res.status(400).json({ error: 'ID inválido' });
    const r = await query(`SELECT election_type AS tipo_eleccion, election_year, party, votes, percentage FROM historical_results WHERE municipality_id = $1 ORDER BY election_year DESC, votes DESC`, [muniId]);
    res.json(r.rows);
  } catch (err) {
    if (err.code === '42P01') return res.json([]);
    res.status(500).json({ error: err.message });
  }
});

// ── Participación ──────────────────────────────────────────────────────────
router.get('/participation/:municipioId', async (req, res) => {
  try {
    const muniId = parseInt(req.params.municipioId, 10);
    if (isNaN(muniId)) return res.status(400).json({ error: 'ID inválido' });
    const r = await query(`SELECT election_year AS year, election_type AS tipo_eleccion, SUM(votes) AS total_votes, ROUND(AVG(percentage)::numeric,2) AS participacion FROM historical_results WHERE municipality_id = $1 GROUP BY election_year, election_type ORDER BY election_year DESC`, [muniId]);
    res.json(r.rows);
  } catch (err) {
    if (err.code === '42P01') return res.json([]);
    res.status(500).json({ error: err.message });
  }
});

// ── Stats públicos ─────────────────────────────────────────────────────────
router.get('/stats', async (req, res) => {
  try {
    const [u, p, s] = await Promise.all([
      query('SELECT COUNT(*) FROM users'),
      query('SELECT COUNT(*) FROM predictions'),
      query("SELECT COUNT(*) FROM surveys WHERE is_active = true")
    ]);
    res.json({ users: parseInt(u.rows[0].count), predictions: parseInt(p.rows[0].count), surveys: parseInt(s.rows[0].count) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
