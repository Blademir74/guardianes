#!/usr/bin/env node

/**
 * Script para configurar variables de entorno en Vercel correctamente
 */

const { execSync } = require('child_process');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function ask(question) {
  return new Promise((resolve) => {
    rl.question(question, resolve);
  });
}

async function setupVercelEnv() {
  console.log('🚀 Configuración de Variables de Entorno en Vercel\n');

  // Pedir las credenciales
  const databaseUrl = await ask('Ingresa tu DATABASE_URL de Neon: ');
  const jwtSecret = await ask('Ingresa tu JWT_SECRET (o presiona enter para generar uno): ');
  const adminJwtSecret = await ask('Ingresa tu ADMIN_JWT_SECRET (o presiona enter para generar uno): ');

  rl.close();

  // Generar secrets si no se proporcionaron
  const finalJwtSecret = jwtSecret || require('crypto').randomBytes(32).toString('hex');
  const finalAdminJwtSecret = adminJwtSecret || require('crypto').randomBytes(32).toString('hex');

  console.log('\n📝 Configurando variables...\n');

  try {
    // Configurar variables de entorno
    execSync(`vercel env add DATABASE_URL`, { stdio: 'inherit' });
    console.log('Cuando te pregunte por el valor, pega:', databaseUrl);
    console.log('Presiona Enter para confirmar\n');

    execSync(`vercel env add JWT_SECRET`, { stdio: 'inherit' });
    console.log('Cuando te pregunte por el valor, pega:', finalJwtSecret);
    console.log('Presiona Enter para confirmar\n');

    execSync(`vercel env add ADMIN_JWT_SECRET`, { stdio: 'inherit' });
    console.log('Cuando te pregunte por el valor, pega:', finalAdminJwtSecret);
    console.log('Presiona Enter para confirmar\n');

    execSync(`vercel env add NODE_ENV`, { stdio: 'inherit' });
    console.log('Cuando te pregunte por el valor, escribe: production');
    console.log('Presiona Enter para confirmar\n');

    console.log('✅ Variables configuradas correctamente!');
    console.log('\n🎯 Próximo paso: Ejecuta `npm run vercel-deploy` para redeploy');

  } catch (error) {
    console.error('❌ Error configurando variables:', error.message);
  }
}

if (require.main === module) {
  setupVercelEnv();
}

module.exports = { setupVercelEnv };