// scripts/seed_municipalities.js
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:password@localhost:5432/guardianes_db'
});

async function seedMunicipalities() {
  const client = await pool.connect();
  
  try {
    console.log('🌱 Iniciando seed de municipios...');
    
    await client.query('BEGIN');

    // 1. Extraer municipios únicos de resultados_electorales
    const extractQuery = `
      WITH municipios_raw AS (
        SELECT DISTINCT
          TRIM(SPLIT_PART(ambito_nombre, ' - ', 2)) AS nombre
        FROM resultados_electorales
        WHERE TRIM(SPLIT_PART(ambito_nombre, ' - ', 2)) !~ '^[0-9]+$'
          AND TRIM(SPLIT_PART(ambito_nombre, ' - ', 2)) != ''
      )
      SELECT nombre
      FROM municipios_raw
      ORDER BY nombre;
    `;

    const result = await client.query(extractQuery);
    console.log(`📋 Encontrados ${result.rows.length} municipios únicos`);

    // 2. Insertar en municipalities (solo si no existen)
    let insertedCount = 0;
    let skippedCount = 0;

    for (const row of result.rows) {
      const checkQuery = 'SELECT id FROM municipalities WHERE name = $1';
      const checkResult = await client.query(checkQuery, [row.nombre]);

      if (checkResult.rows.length === 0) {
        await client.query(
          `INSERT INTO municipalities (name, state) VALUES ($1, $2)`,
          [row.nombre, 'Guerrero']
        );
        insertedCount++;
        console.log(`  ✓ Insertado: ${row.nombre}`);
      } else {
        skippedCount++;
      }
    }

    await client.query('COMMIT');

    console.log('\n✅ Seed completado:');
    console.log(`   - Insertados: ${insertedCount}`);
    console.log(`   - Ya existían: ${skippedCount}`);

    // 3. Mostrar tabla final
    const finalResult = await client.query(`
      SELECT id, name FROM municipalities ORDER BY name LIMIT 10
    `);
    
    console.log('\n📊 Primeros 10 municipios:');
    console.table(finalResult.rows);

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error en seed:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

// Ejecutar
if (require.main === module) {
  seedMunicipalities()
    .then(() => {
      console.log('\n🎉 Seed finalizado exitosamente');
      process.exit(0);
    })
    .catch(error => {
      console.error('💥 Error fatal:', error);
      process.exit(1);
    });
}

module.exports = { seedMunicipalities };