// scripts/initialize_all.js
const { seedMunicipalities } = require('./seed_municipalities');
const { seedCandidates } = require('./seed_candidates');
const { seedPredictions } = require('./seed_predictions');

async function initializeAll() {
  console.log('🚀 INICIANDO SETUP COMPLETO DE GUARDIANES GUERRERO\n');
  console.log('═'.repeat(60));
  
  try {
    // Paso 1: Municipios
    console.log('\n📍 PASO 1: Poblando municipios...');
    await seedMunicipalities();
    console.log('✅ Municipios completados\n');
    
    // Esperar 1 segundo entre pasos
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Paso 2: Candidatos
    console.log('═'.repeat(60));
    console.log('\n👥 PASO 2: Creando candidatos...');
    await seedCandidates();
    console.log('✅ Candidatos completados\n');
    
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Paso 3: Predicciones
    console.log('═'.repeat(60));
    console.log('\n🗳️ PASO 3: Generando predicciones...');
    await seedPredictions();
    console.log('✅ Predicciones completadas\n');
    
    console.log('═'.repeat(60));
    console.log('\n🎉 SETUP COMPLETO EXITOSO\n');
    console.log('Próximos pasos:');
    console.log('  1. npm start (iniciar servidor)');
    console.log('  2. Abrir index.html en navegador');
    console.log('  3. Probar flujo completo de autenticación y predicción\n');
    
  } catch (error) {
    console.error('\n❌ ERROR EN INICIALIZACIÓN:', error);
    process.exit(1);
  }
}

// Ejecutar
if (require.main === module) {
  initializeAll()
    .then(() => process.exit(0))
    .catch(error => {
      console.error('💥 Error fatal:', error);
      process.exit(1);
    });
}

module.exports = { initializeAll };