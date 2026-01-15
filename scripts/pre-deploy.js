#!/usr/bin/env node

/**
 * Script de preparación para deployment en Vercel
 * Ejecuta verificaciones y limpieza antes del deploy
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🚀 [DEPLOY] Iniciando preparación para Vercel...\n');

// Verificar que existe .env
if (!fs.existsSync('.env')) {
  console.error('❌ Error: Archivo .env no encontrado');
  console.log('💡 Copia .env.example a .env y configura las variables');
  process.exit(1);
}

console.log('✅ Archivo .env encontrado');

// Verificar variables críticas de entorno
require('dotenv').config();

const requiredVars = [
  'DATABASE_URL',
  'JWT_SECRET',
  'ADMIN_JWT_SECRET'
];

let missingVars = [];
requiredVars.forEach(varName => {
  if (!process.env[varName]) {
    missingVars.push(varName);
  }
});

if (missingVars.length > 0) {
  console.error('❌ Variables de entorno faltantes:', missingVars.join(', '));
  process.exit(1);
}

console.log('✅ Variables de entorno configuradas');

// Verificar conexión a base de datos
console.log('🔄 Probando conexión a base de datos...');

const { Pool } = require('pg');
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 5000,
});

(async () => {
  try {
    const client = await pool.connect();
    console.log('✅ Conexión a BD exitosa');

    // Verificar que las tablas existen
    const tablesResult = await client.query(`
      SELECT COUNT(*) as count FROM information_schema.tables
      WHERE table_schema = 'public'
    `);

    if (tablesResult.rows[0].count < 10) {
      console.warn('⚠️ Pocos tablas encontradas. Verifica que el schema esté importado');
    } else {
      console.log(`✅ ${tablesResult.rows[0].count} tablas encontradas`);
    }

    client.release();

  } catch (error) {
    console.error('❌ Error de conexión a BD:', error.message);
    console.log('💡 Verifica DATABASE_URL y que Neon permita conexiones externas');
    process.exit(1);
  } finally {
    await pool.end();
  }

  // Ejecutar tests
  console.log('🧪 Ejecutando tests...');
  try {
    execSync('npm test', { stdio: 'inherit' });
    console.log('✅ Tests unitarios pasaron');
  } catch (error) {
    console.error('❌ Tests fallaron');
    process.exit(1);
  }

  // Verificar archivos críticos
  const criticalFiles = [
    'src/server.js',
    'vercel.json',
    'package.json'
  ];

  criticalFiles.forEach(file => {
    if (!fs.existsSync(file)) {
      console.error(`❌ Archivo crítico faltante: ${file}`);
      process.exit(1);
    }
  });

  console.log('✅ Archivos críticos verificados');

  console.log('\n🎉 ¡Preparación completada! Listo para deploy en Vercel');
  console.log('\n📋 Próximos pasos:');
  console.log('1. vercel login');
  console.log('2. vercel --prod');
  console.log('3. Configurar variables de entorno en Vercel Dashboard');

})();