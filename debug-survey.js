// debug-survey.js
require('dotenv').config({ path: '.env.local' });
const { Pool } = require('pg');

async function debug(surveyId) {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  try {
    const client = await pool.connect();
    console.log(`🔍 DIAGNÓSTICO PARA ENCUESTA ID: ${surveyId}`);

    // 1. Info de la Encuesta
    const s = await client.query('SELECT * FROM surveys WHERE id = $1', [surveyId]);
    console.log('📋 Encuesta:', s.rows[0]);

    // 2. Preguntas de la Encuesta
    const q = await client.query('SELECT id, question_text, question_type FROM survey_questions WHERE survey_id = $1', [surveyId]);
    console.log('❓ Preguntas:', q.rows);

    // 3. Conteo de Respuestas Total
    const rCount = await client.query('SELECT COUNT(*) FROM survey_responses WHERE survey_id = $1', [surveyId]);
    console.log('📊 Total filas en survey_responses:', rCount.rows[0].count);

    // 4. Distribución de response_value para preguntas de tipo choice/single_choice
    const rDist = await client.query(`
      SELECT response_value, COUNT(*) 
      FROM survey_responses 
      WHERE survey_id = $1 
      GROUP BY response_value
    `, [surveyId]);
    console.log('🗳️  Distribución de valores:', rDist.rows);

    // 5. Verificar Candidatos del Municipio
    if (s.rows[0] && s.rows[0].municipality_id) {
        const cands = await client.query('SELECT id, name FROM candidates WHERE municipality_id = $1', [s.rows[0].municipality_id]);
        console.log('👤 Candidatos en el municipio:', cands.rows);
    }

    client.release();
  } catch (err) {
    console.error('❌ ERROR:', err.message);
  } finally {
    await pool.end();
  }
}

const id = process.argv[2] || 1; // Por defecto encuesta 1
debug(id);
