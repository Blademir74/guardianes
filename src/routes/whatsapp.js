// src/routes/whatsapp.js
const express = require('express');
const router = express.Router();
const { query } = require('../db');

// Configuración desde .env
const VERIFY_TOKEN = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
const ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;
const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;

// GET: Verificación inicial de Meta (una sola vez)
router.get('/', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('✅ WEBHOOK VERIFICADO POR META');
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

// POST: Recibir mensajes de usuarios
router.post('/', async (req, res) => {
  try {
    const body = req.body;
    
    if (body.object === 'whatsapp_business_account') {
      for (const entry of body.entry || []) {
        for (const change of entry.changes || []) {
          if (change.field === 'messages' && change.value.messages) {
            const message = change.value.messages[0];
            const from = message.from; // Número de quien escribe
            const msgBody = message.text?.body || '';
            
            console.log(`📩 Mensaje de ${from}: ${msgBody}`);

            // Respuesta automática inteligente
            let reply = '';
            const lowerMsg = msgBody.toLowerCase();
            
            if (lowerMsg.includes('hola') || lowerMsg.includes('inicio')) {
              reply = `¡Hola! 👋 Soy *Guardianes Guerrero 2027*.\n\n¿Quieres predecir quién ganará la gubernatura o tu municipio? 🗳️\n\n👉 Entra aquí: ${process.env.FRONTEND_URL}\n\nEs gratis, anónimo y toma 20 segundos. ¡Tu opinión construye el futuro de Guerrero!`;
            } else if (lowerMsg.includes('chilpancingo') || lowerMsg.includes('acapulco') || lowerMsg.includes('iguala')) {
              reply = `¡Excelente! Ya tenemos predicciones activas para tu zona. Entra ahora para ver el ranking en tiempo real y dejar tu voto: ${process.env.FRONTEND_URL}`;
            } else {
              reply = `🤖 Opciones disponibles:\n• Escribe *HOLA* para empezar\n• Visita: ${process.env.FRONTEND_URL}\n\n¿De qué municipio eres? Te aviso cómo van las predicciones allá.`;
            }

            // Enviar respuesta
            await sendWhatsAppMessage(from, reply);
            
            // Guardar en BD (tracking)
            await query(
              'INSERT INTO whatsapp_interactions (phone_number, message_received, message_sent, created_at) VALUES ($1, $2, $3, NOW())',
              [from, msgBody, reply]
            );
          }
        }
      }
      res.sendStatus(200);
    } else {
      res.sendStatus(404);
    }
  } catch (error) {
    console.error('❌ Error webhook:', error);
    res.sendStatus(500);
  }
});

// Función para enviar mensajes
async function sendWhatsAppMessage(to, text) {
  try {
    const url = `https://graph.facebook.com/v18.0/${PHONE_NUMBER_ID}/messages`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: to,
        type: 'text',
        text: { body: text, preview_url: true }
      })
    });

    if (!response.ok) {
      const err = await response.json();
      console.error('Error enviando:', err);
    } else {
      console.log(`✅ Respuesta enviada a ${to}`);
    }
  } catch (err) {
    console.error('❌ Fallo envío:', err);
  }
}

module.exports = router;