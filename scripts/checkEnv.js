// scripts/checkEnv.js
require('dotenv').config();

console.log('--- DIAGNÓSTICO DE VARIABLES DE ENTORNO ---');
console.log('Valor de JWT_SECRET:', process.env.JWT_SECRET);
console.log('Valor de DATABASE_URL:', process.env.DATABASE_URL);
console.log('-------------------------------------------');

if (!process.env.JWT_SECRET) {
  console.log('❌ ERROR: La variable JWT_SECRET no se está cargando.');
} else {
  console.log('✅ ÉXITO: La variable JWT_SECRET se cargó correctamente.');
}

if (!process.env.DATABASE_URL) {
  console.log('❌ ERROR: La variable DATABASE_URL no se está cargando.');
} else {
  console.log('✅ ÉXITO: La variable DATABASE_URL se cargó correctamente.');
}