const router = require('express').Router();
const db = require('../db');
const twilio = require('twilio');

// POST /api/whatsapp/webhook
router.post('/webhook', async (req, res) => {
  try {
    const { From, Body } = req.body;
    const message = Body ? Body.trim().toUpperCase() : '';
    
    let responseText;
    
    if (message === 'HOLA' || message === 'MENU') {
      responseText = `*Guardianes Guerrero - Menú Principal*\n\n` +
        `1. Ver predicción de mi municipio\n` +
        `2. Reportar incidente\n` +
        `3. Ver leaderboard\n\n` +
        `Por favor, responde con el número de la opción que deseas.`;
    } else if (message === '1') {
      // Obtener predicciones del municipio del usuario
      // Por ahora, respuesta placeholder
      responseText = `Para ver las predicciones de tu municipio, por favor ingresa a nuestra aplicación web o envíanos tu número de municipio.`;
    } else if (message === '2') {
      responseText = `Para reportar un incidente, por favor envíanos:\n` +
        `- Tipo de incidente (robo, violencia, fraude, etc.)\n` +
        `- Descripción breve\n` +
        `- Ubicación (si es posible)`;
    } else if (message === '3') {
      responseText = `Puedes ver el leaderboard completo en nuestra aplicación web o visitinguardanesguerrero.mx/leaderboard`;
    } else {
      responseText = 'Escribe HOLA para ver el menú de opciones.';
    }
    
    // Enviar respuesta via Twilio
    const client = twilio(
      process.env.TWILIO_ACCOUNT_SID, 
      process.env.TWILIO_AUTH_TOKEN
    );
    
    await client.messages.create({
      body: responseText,
      from: 'whatsapp:' + process.env.TWILIO_PHONE,
      to: From
    });
    
    res.sendStatus(200);
  } catch (error) {
    console.error('Error en webhook de WhatsApp:', error);
    res.sendStatus(500);
  }
});

module.exports = router;