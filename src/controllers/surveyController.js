// src/controllers/surveyController.js
const { query } = require('../db');

/**
 * Obtener todas las encuestas activas
 */
exports.getSurveys = async (req, res) => {
  try {
    const surveys = await query(
      `SELECT 
        s.id, 
        s.title, 
        s.description, 
        s.created_at,
        s.is_active,
        s.is_public,
        COUNT(sq.id) as questions_count
       FROM surveys s
       LEFT JOIN survey_questions sq ON s.id = sq.survey_id
       WHERE s.is_active = true AND s.is_public = true
       GROUP BY s.id, s.title, s.description, s.created_at, s.is_active, s.is_public
       ORDER BY s.created_at DESC`
    );
    res.json(surveys.rows);
  } catch (error) {
    console.error('❌ Error al obtener encuestas:', error);
    res.status(500).json({ error: 'Error al obtener las encuestas' });
  }
};

/**
 * Obtener resultados de una encuesta específica
 */
exports.getSurveyResults = async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!id || isNaN(parseInt(id))) {
      return res.status(400).json({ error: 'ID de encuesta inválido' });
    }

    const results = await query(
      `SELECT 
          sq.question_text,
          sr.response_value,
          COUNT(sr.id) as votes,
          AVG(sr.confidence) as avg_confidence
        FROM survey_questions sq
        LEFT JOIN survey_responses sr ON sq.id = sr.question_id
        WHERE sq.survey_id = $1
        GROUP BY sq.id, sq.question_text, sr.response_value
        ORDER BY sq.order_num, votes DESC`,
      [id]
    );
    
    res.json(results.rows);
  } catch (error) {
    console.error('❌ Error al obtener resultados:', error);
    res.status(500).json({ error: 'Error al obtener los resultados' });
  }
};