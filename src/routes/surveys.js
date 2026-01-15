// src/routes/surveys.js - VERSIÓN DE DIAGNÓSTICO
const express = require('express');
const router = express.Router();

// Endpoint de diagnóstico para /active
router.get('/active', async (req, res) => {
  console.log('🔍 DIAGNÓSTICO: Entrando a /api/surveys/active');
  
  // Intentamos una consulta simple a la base de datos
  try {
    const result = await global.dbQuery('SELECT 1 as test');
    console.log('✅ DIAGNÓSTICO: Conexión a BD OK');
    
    // Devolvemos una respuesta mockeada para aislar el problema
    res.json({
      success: true,
      surveys: [
        {
          id: 999,
          title: 'ENCUESTA DE PRUEBA - DIAGNÓSTICO',
          description: 'Si ves esto, la ruta funciona. El problema estaba en la lógica anterior.',
          electionType: 'gubernatura',
          questionsCount: 1,
          totalRespondents: 0
        }
      ]
    });
    console.log('✅ DIAGNÓSTICO: Respuesta enviada correctamente');

  } catch (error) {
    console.error('❌ DIAGNÓSTICO: Error en la conexión a BD o en global.dbQuery:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Error de diagnóstico en la base de datos',
      details: error.message 
    });
  }
});

// Endpoint de diagnóstico para /:id/response
router.post('/:id/response', async (req, res) => {
    console.log('🔍 DIAGNÓSTICO: Entrando a /api/surveys/:id/response');
    console.log('🔍 DIAGNÓSTICO: Body recibido:', req.body);
    
    res.json({
      success: true,
      message: 'Respuesta de diagnóstico recibida. El POST funciona.',
      receivedData: req.body
    });
});

module.exports = router;