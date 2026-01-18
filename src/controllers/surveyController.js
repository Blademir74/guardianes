// src/controllers/surveyController.js
const { query } = require('../db');

// Obtener todas las encuestas activas
exports.getSurveys = async (req, res) => {
  try {
    const surveys = await query(
      `SELECT s.id, s.title, s.description, s.created_at,
              json_agg(
                json_build_object(
                  'id', o.id,
                  'text', o.texto_opcion
                ) ORDER BY o.orden
              ) AS options
       FROM surveys s
       LEFT JOIN options_encuesta o ON s.id = o.encuesta_id
       WHERE s.active = true
       GROUP BY s.id, s.title, s.description, s.created_at
       ORDER BY s.created_at DESC;`
    );
    res.json(surveys.rows);
  } catch (error) {
    console.error('Error al obtener encuestas:', error);
    res.status(500).json({ error: 'Error al obtener las encuestas' });
  }
};

// Obtener resultados de una encuesta específica
exports.getSurveyResults = async (req, res) => {
  const { id } = req.params;
  try {
    const results = await query(
      `SELECT 
          o.texto_opcion,
          COUNT(p.id) as votes
        FROM options_encuesta o
        LEFT JOIN predictions p ON o.id = p.opcion_elegida_id
        WHERE o.encuesta_id = $1
        GROUP BY o.id, o.texto_opcion
        ORDER BY o.orden;`,
      [id]
    );
    res.json(results.rows);
  } catch (error) {
    console.error('Error al obtener resultados:', error);
    res.status(500).json({ error: 'Error al obtener los resultados' });
  }
};