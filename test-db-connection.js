// test-db-connection.js
// EJECUTAR: node test-db-connection.js

require('dotenv').config({ path: '.env.local' });
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function testConnection() {
  console.log('🔌 Probando conexión a Neon...\n');
  
  try {
    // 1. Test básico de conexión
    const result = await pool.query('SELECT NOW() as timestamp, version()');
    console.log('✅ CONEXIÓN EXITOSA');
    console.log('⏰ Timestamp:', result.rows[0].timestamp);
    console.log('📦 PostgreSQL:', result.rows[0].version.split(' ')[1]);
    console.log('');

    // 2. Verificar tablas existentes
    const tables = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name
    `);
    
    console.log('📊 TABLAS ENCONTRADAS:');
    if (tables.rows.length === 0) {
      console.log('   ⚠️  NO HAY TABLAS - Base de datos vacía');
    } else {
      tables.rows.forEach((row, i) => {
        console.log(`   ${i + 1}. ${row.table_name}`);
      });
    }
    console.log('');

    // 3. Verificar datos en tablas clave
    const criticalTables = ['users', 'municipalities', 'candidates', 'elections', 'predictions', 'surveys'];
    
    console.log('📈 CONTEO DE REGISTROS:');
    for (const table of criticalTables) {
      try {
        const count = await pool.query(`SELECT COUNT(*) FROM ${table}`);
        console.log(`   ${table.padEnd(20)} → ${count.rows[0].count.padStart(6)} registros`);
      } catch (err) {
        console.log(`   ${table.padEnd(20)} → ❌ No existe`);
      }
    }
    console.log('');

    // 4. Verificar candidatos reales
    try {
      const candidatos = await pool.query(`
        SELECT name, party, election_type 
        FROM candidates 
        WHERE election_type = 'Gubernatura'
        ORDER BY name
      `);
      
      console.log('🗳️  CANDIDATOS REGISTRADOS:');
      if (candidatos.rows.length === 0) {
        console.log('   ⚠️  NO HAY CANDIDATOS');
      } else {
        candidatos.rows.forEach((c, i) => {
          console.log(`   ${i + 1}. ${c.name} (${c.party})`);
        });
      }
      console.log('');
    } catch (err) {
      console.log('   ❌ Tabla candidates no existe\n');
    }

    // 5. Verificar municipios
    try {
      const municipios = await pool.query(`
        SELECT name, region, total_voters 
        FROM municipalities 
        ORDER BY total_voters DESC 
        LIMIT 5
      `);
      
      console.log('🏛️  TOP 5 MUNICIPIOS:');
      if (municipios.rows.length === 0) {
        console.log('   ⚠️  NO HAY MUNICIPIOS');
      } else {
        municipios.rows.forEach((m, i) => {
          console.log(`   ${i + 1}. ${m.name} (${m.region}) - ${m.total_voters?.toLocaleString() || 'N/A'} votantes`);
        });
      }
      console.log('');
    } catch (err) {
      console.log('   ❌ Tabla municipalities no existe\n');
    }

    // 6. Verificar datos históricos
    try {
      const historicos = await pool.query(`
        SELECT election_year, COUNT(*) as registros
        FROM historical_results
        GROUP BY election_year
        ORDER BY election_year DESC
      `);
      
      console.log('📊 DATOS HISTÓRICOS:');
      if (historicos.rows.length === 0) {
        console.log('   ⚠️  NO HAY DATOS HISTÓRICOS');
      } else {
        historicos.rows.forEach((h) => {
          console.log(`   ${h.election_year} → ${h.registros} registros`);
        });
      }
      console.log('');
    } catch (err) {
      console.log('   ❌ Tabla historical_results no existe\n');
    }

    // 7. DIAGNÓSTICO FINAL
    console.log('═'.repeat(60));
    console.log('📋 DIAGNÓSTICO FINAL:');
    console.log('═'.repeat(60));
    
    if (tables.rows.length === 0) {
      console.log('🔴 ESTADO: Base de datos VACÍA');
      console.log('📝 ACCIÓN: Ejecutar migración completa');
      console.log('   → node scripts/migrate-db-complete.js');
    } else if (tables.rows.length < 10) {
      console.log('🟡 ESTADO: Base de datos INCOMPLETA');
      console.log('📝 ACCIÓN: Completar tablas faltantes');
    } else {
      console.log('🟢 ESTADO: Base de datos COMPLETA');
      console.log('📝 ACCIÓN: Verificar datos y sincronizar API');
    }
    console.log('═'.repeat(60));

  } catch (error) {
    console.error('❌ ERROR DE CONEXIÓN:');
    console.error('   Mensaje:', error.message);
    console.error('   Código:', error.code);
    console.error('');
    console.error('🔧 POSIBLES SOLUCIONES:');
    console.error('   1. Verifica DATABASE_URL en .env.local');
    console.error('   2. Verifica que Neon esté activo');
    console.error('   3. Verifica SSL settings');
  } finally {
    await pool.end();
  }
}

testConnection();