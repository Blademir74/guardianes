#!/usr/bin/env node

/**
 * Script de verificación post-deployment
 * Verifica que la aplicación funcione correctamente en Vercel
 */

const https = require('https');

if (!process.env.VERCEL_URL) {
  console.error('❌ VERCEL_URL no definida. Configura la variable de entorno.');
  process.exit(1);
}

const BASE_URL = process.env.VERCEL_URL || 'https://pulsoguerrero.vercel.app';

console.log(`🔍 [POST-DEPLOY] Verificando aplicación en: ${BASE_URL}\n`);

function makeRequest(endpoint, description) {
  return new Promise((resolve) => {
    const url = `${BASE_URL}${endpoint}`;

    console.log(`📡 Probando ${description}: ${url}`);

    const req = https.get(url, { timeout: 10000 }, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          const jsonData = JSON.parse(data);
          console.log(`✅ ${description}: ${res.statusCode} - ${jsonData.status || 'OK'}`);
          resolve({ status: res.statusCode, data: jsonData });
        } catch (e) {
          console.log(`✅ ${description}: ${res.statusCode} - Response OK`);
          resolve({ status: res.statusCode, data });
        }
      });
    });

    req.on('error', (err) => {
      console.error(`❌ ${description}: Error - ${err.message}`);
      resolve({ status: 0, error: err.message });
    });

    req.on('timeout', () => {
      console.error(`⏰ ${description}: Timeout`);
      req.destroy();
      resolve({ status: 0, error: 'Timeout' });
    });
  });
}

async function runChecks() {
  const checks = [
    { endpoint: '/api/health', description: 'Health Check' },
    { endpoint: '/api/data/municipios', description: 'Lista Municipios' },
    { endpoint: '/api/surveys/active', description: 'Encuestas Activas' },
    { endpoint: '/api/data/participacion/1', description: 'Participación Municipio 1' },
    { endpoint: '/api/data/comparacion/1', description: 'Comparación Municipio 1' },
  ];

  let passed = 0;
  let failed = 0;

  for (const check of checks) {
    const result = await makeRequest(check.endpoint, check.description);

    if (result.status >= 200 && result.status < 400) {
      passed++;
    } else {
      failed++;
      console.log(`   Detalles: ${result.error || 'Status: ' + result.status}`);
    }

    // Pequeña pausa entre requests
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  console.log(`\n📊 Resultados:`);
  console.log(`✅ Exitosos: ${passed}`);
  console.log(`❌ Fallidos: ${failed}`);

  if (failed === 0) {
    console.log('\n🎉 ¡Todas las verificaciones pasaron! La aplicación está lista.');
    console.log('\n📈 Próximos pasos recomendados:');
    console.log('1. Configurar monitoreo (Vercel Analytics)');
    console.log('2. Configurar Sentry para error tracking');
    console.log('3. Ejecutar tests de carga');
    console.log('4. Monitorear logs iniciales');
  } else {
    console.log(`\n⚠️ ${failed} verificación(es) fallaron. Revisa los logs y configuración.`);
  }

  process.exit(failed > 0 ? 1 : 0);
}

runChecks();