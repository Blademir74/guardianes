// scripts/reset-production.js
require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function resetProductionData() {
  console.log('🗑️ Iniciando reseteo de datos para producción...\n');

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1. Limpiar respuestas de encuestas de prueba
    console.log('1. Eliminando respuestas de prueba...');
    const deletedResponses = await client.query(`
      DELETE FROM survey_responses
      WHERE created_at < CURRENT_DATE - INTERVAL '30 days'
      OR user_id IS NULL
    `);
    console.log(`   ✅ Eliminadas ${deletedResponses.rowCount} respuestas antiguas`);

    // 2. Limpiar encuestas de prueba
    console.log('2. Eliminando encuestas de prueba...');
    const deletedSurveys = await client.query(`
      DELETE FROM survey_questions
      WHERE survey_id IN (
        SELECT id FROM surveys
        WHERE title ILIKE '%test%' OR title ILIKE '%prueba%' OR title ILIKE '%demo%'
      )
    `);
    const deletedSurveysMain = await client.query(`
      DELETE FROM surveys
      WHERE title ILIKE '%test%' OR title ILIKE '%prueba%' OR title ILIKE '%demo%'
    `);
    console.log(`   ✅ Eliminadas ${deletedSurveys.rowCount} preguntas y ${deletedSurveysMain.rowCount} encuestas de prueba`);

    // 3. Resetear contadores de predicciones
    console.log('3. Reseteando contadores de usuarios...');
    await client.query(`
      UPDATE users SET
        predictions_count = COALESCE((
          SELECT COUNT(*) FROM predictions WHERE user_id = users.id
        ), 0),
        accuracy_pct = COALESCE((
          SELECT AVG(CASE WHEN p.actual_result = p.prediction THEN 100 ELSE 0 END)
          FROM predictions p WHERE p.user_id = users.id
        ), 0)
    `);
    console.log('   ✅ Contadores actualizados');

    // 4. Limpiar datos temporales
    console.log('4. Limpiando datos temporales...');
    await client.query(`
      DELETE FROM user_sessions WHERE created_at < CURRENT_DATE - INTERVAL '7 days'
    `);
    console.log('   ✅ Sesiones antiguas eliminadas');

    await client.query('COMMIT');
    console.log('\n🎉 Reseteo completado exitosamente!');
    console.log('📊 Resumen:');
    console.log(`   - Respuestas eliminadas: ${deletedResponses.rowCount}`);
    console.log(`   - Encuestas eliminadas: ${deletedSurveysMain.rowCount}`);
    console.log('   - Contadores reseteados: ✅');
    console.log('   - Datos temporales limpiados: ✅');

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error durante el reseteo:', error.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

// Ejecutar solo si se llama directamente
if (require.main === module) {
  resetProductionData().catch(console.error);
}

module.exports = { resetProductionData };