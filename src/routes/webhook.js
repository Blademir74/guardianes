const express = require('express');
const router = express.Router();

// Token de verificación - DEBE coincidir EXACTAMENTE con el que pusiste en Meta
const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || 'verificacion_guardianes_2027_seguro';

console.log('🔧 Webhook inicializado con token:', VERIFY_TOKEN.substring(0, 10) + '...');

/**
 * GET /api/webhook
 * Verificación de webhook por parte de Meta
 */
router.get('/', (req, res) => {
  console.log('📥 GET /api/webhook - Solicitud de verificación recibida');
  console.log('Query params:', req.query);
  
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  
  console.log('Modo:', mode);
  console.log('Token recibido:', token);
  console.log('Challenge:', challenge);
  console.log('Token esperado:', VERIFY_TOKEN);

  // Validar que todos los parámetros existen
  if (!mode || !token || !challenge) {
    console.log('❌ Faltan parámetros requeridos');
    return res.status(400).send('Bad Request - Missing parameters');
  }

  // Validar modo y token
  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('✅ WEBHOOK VERIFICADO CORRECTAMENTE');
    console.log('Enviando challenge:', challenge);
    
    // CRÍTICO: Enviar solo el challenge como texto plano
    return res.status(200).send(challenge);
  } else {
    console.log('❌ Token incorrecto o modo inválido');
    console.log('Token match:', token === VERIFY_TOKEN);
    console.log('Mode match:', mode === 'subscribe');
    return res.status(403).send('Forbidden - Invalid token or mode');
  }
});

/**
 * POST /api/webhook
 * Recibir mensajes de usuarios
 */
router.post('/', async (req, res) => {
  console.log('📩 POST /api/webhook - Mensaje recibido');
  console.log('Headers:', req.headers);
  console.log('Body:', JSON.stringify(req.body, null, 2));
  
  try {
    // Responder OK a Meta inmediatamente (CRÍTICO para evitar reintentos)
    res.status(200).send('EVENT_RECEIVED');
    
    // Procesar el mensaje aquí (en background)
    const entry = req.body?.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;
    const messages = value?.messages;
    
    if (messages && messages.length > 0) {
      const message = messages[0];
      console.log('💬 Mensaje del usuario:', {
        from: message.from,
        type: message.type,
        text: message.text?.body
      });
      
      // Aquí irá la lógica para procesar el mensaje y enviar respuesta
      // TODO: Implementar lógica de respuesta automática
    }
    
  } catch (error) {
    console.error('❌ Error procesando webhook:', error);
    // Ya enviamos 200, así que no enviamos error a Meta
  }
});

/**
 * Health check endpoint
 */
router.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'WhatsApp Webhook',
    timestamp: new Date().toISOString(),
    verifyToken: VERIFY_TOKEN ? 'configured' : 'missing'
  });
});

module.exports = router;