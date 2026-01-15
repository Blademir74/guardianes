// test-connection.js
require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function testConnection() {
  try {
    console.log('🔄 Probando conexión a Neon.tech...');

    const client = await pool.connect();
    console.log('✅ Conexión exitosa a Neon!');

    // Verificar tablas
    const result = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);

    console.log(`📊 Tablas encontradas: ${result.rows.length}`);
    result.rows.forEach(row => console.log(`  - ${row.table_name}`));

    // Verificar admin
    const adminCheck = await client.query('SELECT COUNT(*) as admins FROM admins');
    console.log(`👤 Administradores: ${adminCheck.rows[0].admins}`);

    // Verificar elecciones
    const electionCheck = await client.query('SELECT COUNT(*) as elections FROM elections');
    console.log(`🗳️ Elecciones: ${electionCheck.rows[0].elections}`);

    client.release();
    console.log('\n🎉 ¡Base de datos de Neon está lista para producción!');

  } catch (error) {
    console.error('❌ Error de conexión:', error.message);
    console.error('\n💡 Posibles soluciones:');
    console.error('1. Verificar DATABASE_URL en .env');
    console.error('2. Asegurar que Neon permite conexiones externas');
    console.error('3. Verificar credenciales en Neon Console');
    process.exit(1);
  } finally {
    await pool.end();
  }
}

testConnection();