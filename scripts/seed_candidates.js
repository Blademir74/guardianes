// scripts/seed_candidates.js
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:password@localhost:5432/guardianes_db'
});

const PARTIDOS = ['MORENA', 'PAN', 'PRI', 'PRD', 'MC', 'PVEM', 'PT'];

const NOMBRES = [
  'María González', 'Carlos López', 'Ana Martínez', 'José Rodríguez',
  'Laura Hernández', 'Miguel Pérez', 'Carmen García', 'Francisco Torres',
  'Rosa Ramírez', 'Antonio Flores', 'Elena Cruz', 'Juan Morales',
  'Sofía Jiménez', 'Pedro Ruiz', 'Isabel Díaz'
];

async function seedCandidates() {
  const client = await pool.connect();
  
  try {
    console.log('🌱 Iniciando seed de candidatos...\n');
    
    await client.query('BEGIN');

    // 1. Crear elección activa si no existe
    let electionResult = await client.query(`
      SELECT id FROM elections WHERE is_active = true LIMIT 1
    `);

    let electionId;
    if (electionResult.rows.length === 0) {
      const newElection = await client.query(`
        INSERT INTO elections (name, election_type, date, is_active)
        VALUES ('Elección Municipal 2027', 'Ayuntamiento', '2027-06-06', true)
        RETURNING id
      `);
      electionId = newElection.rows[0].id;
      console.log(`✓ Elección creada con ID: ${electionId}`);
    } else {
      electionId = electionResult.rows[0].id;
      console.log(`✓ Usando elección existente ID: ${electionId}`);
    }

    // 2. Obtener todos los municipios
    const municipiosResult = await client.query(`
      SELECT id, name FROM municipalities ORDER BY name
    `);

    console.log(`📋 Encontrados ${municipiosResult.rows.length} municipios\n`);

    let totalInserted = 0;

    // 3. Para cada municipio, crear 5-7 candidatos
    for (const municipio of municipiosResult.rows) {
      const numCandidatos = 5 + Math.floor(Math.random() * 3); // 5-7 candidatos
      
      // Mezclar nombres y partidos aleatoriamente
      const nombresShuffled = [...NOMBRES].sort(() => Math.random() - 0.5);
      const partidosShuffled = [...PARTIDOS].sort(() => Math.random() - 0.5);

      console.log(`📍 ${municipio.name}: creando ${numCandidatos} candidatos...`);

      for (let i = 0; i < numCandidatos; i++) {
        const nombre = nombresShuffled[i % nombresShuffled.length];
        const partido = partidosShuffled[i % partidosShuffled.length];

        // Verificar si ya existe
        const existsResult = await client.query(`
          SELECT id FROM candidates 
          WHERE election_id = $1 AND municipality_id = $2 AND name = $3 AND party = $4
        `, [electionId, municipio.id, nombre, partido]);

        if (existsResult.rows.length === 0) {
          await client.query(`
            INSERT INTO candidates (election_id, municipality_id, name, party)
            VALUES ($1, $2, $3, $4)
          `, [electionId, municipio.id, nombre, partido]);
          totalInserted++;
        }
      }
    }

    await client.query('COMMIT');

    console.log(`\n✅ Seed completado: ${totalInserted} candidatos insertados`);

    // 4. Mostrar resumen
    const summaryResult = await client.query(`
      SELECT 
        m.name as municipio,
        COUNT(c.id) as total_candidatos,
        STRING_AGG(c.party, ', ' ORDER BY c.party) as partidos
      FROM municipalities m
      LEFT JOIN candidates c ON c.municipality_id = m.id AND c.election_id = $1
      GROUP BY m.id, m.name
      ORDER BY m.name
      LIMIT 10
    `, [electionId]);

    console.log('\n📊 Primeros 10 municipios:');
    console.table(summaryResult.rows);

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
  seedCandidates()
    .then(() => {
      console.log('\n🎉 Seed de candidatos finalizado');
      process.exit(0);
    })
    .catch(error => {
      console.error('💥 Error fatal:', error);
      process.exit(1);
    });
}

module.exports = { seedCandidates };