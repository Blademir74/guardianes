// scripts/seed_predictions.js
const { Pool } = require('pg');
const crypto = require('crypto');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:password@localhost:5432/guardianes_db'
});

function hashPhone(phone) {
  const fullPhone = `+52${phone}`;
  return crypto.createHash('sha256').update(fullPhone).digest('hex');
}

function generateRandomPhone() {
  return '55' + Math.floor(10000000 + Math.random() * 90000000).toString();
}

async function seedPredictions() {
  const client = await pool.connect();
  
  try {
    console.log('🌱 Iniciando seed de predicciones y usuarios simulados...\n');
    
    await client.query('BEGIN');

    // 1. Obtener elección activa
    const electionResult = await client.query(`
      SELECT id FROM elections WHERE is_active = true LIMIT 1
    `);

    if (electionResult.rows.length === 0) {
      throw new Error('No hay elecciones activas. Ejecuta seed_candidates.js primero.');
    }

    const electionId = electionResult.rows[0].id;
    console.log(`✓ Usando elección ID: ${electionId}\n`);

    // 2. Obtener todos los municipios con candidatos
    const municipiosResult = await client.query(`
      SELECT DISTINCT m.id, m.name, COUNT(c.id) as num_candidatos
      FROM municipalities m
      JOIN candidates c ON c.municipality_id = m.id AND c.election_id = $1
      GROUP BY m.id, m.name
      HAVING COUNT(c.id) > 0
      ORDER BY m.name
    `, [electionId]);

    console.log(`📋 ${municipiosResult.rows.length} municipios con candidatos\n`);

    let totalUsers = 0;
    let totalPredictions = 0;

    // 3. Para cada municipio, crear usuarios y predicciones
    for (const municipio of municipiosResult.rows) {
      console.log(`📍 ${municipio.name} (${municipio.num_candidatos} candidatos)...`);

      // Obtener candidatos del municipio
      const candidatosResult = await client.query(`
        SELECT id, name, party 
        FROM candidates 
        WHERE election_id = $1 AND municipality_id = $2
      `, [electionId, municipio.id]);

      const candidatos = candidatosResult.rows;

      // Crear entre 15-25 predicciones por municipio
      const numPredictions = 15 + Math.floor(Math.random() * 11);

      for (let i = 0; i < numPredictions; i++) {
        // Generar usuario único
        const phone = generateRandomPhone();
        const phoneHash = hashPhone(phone);

        // Crear usuario si no existe
        let userResult = await client.query(`
          SELECT id FROM users WHERE phone_hash = $1
        `, [phoneHash]);

        let userId;
        if (userResult.rows.length === 0) {
          const newUser = await client.query(`
            INSERT INTO users (phone_hash, points, predictions_count, accuracy_pct, created_at, last_active)
            VALUES ($1, 100, 1, 0, NOW() - INTERVAL '${Math.floor(Math.random() * 30)} days', NOW())
            RETURNING id
          `, [phoneHash]);
          userId = newUser.rows[0].id;
          totalUsers++;
        } else {
          userId = userResult.rows[0].id;
          await client.query(`
            UPDATE users 
            SET points = points + 100, predictions_count = predictions_count + 1
            WHERE id = $1
          `, [userId]);
        }

        // Crear predicción (con distribución realista)
        // Favorece ligeramente a algunos partidos para crear tendencias
        let candidatoIdx;
        const random = Math.random();
        if (random < 0.35) {
          // 35% va al candidato más popular
          candidatoIdx = 0;
        } else if (random < 0.60) {
          // 25% va al segundo
          candidatoIdx = Math.min(1, candidatos.length - 1);
        } else {
          // 40% se distribuye entre el resto
          candidatoIdx = Math.floor(Math.random() * candidatos.length);
        }

        const candidato = candidatos[candidatoIdx];
        const confidence = [50, 75, 75, 75, 100][Math.floor(Math.random() * 5)]; // Mayoría 75%

        await client.query(`
          INSERT INTO predictions (user_id, election_id, municipality_id, candidate_id, confidence, created_at)
          VALUES ($1, $2, $3, $4, $5, NOW() - INTERVAL '${Math.floor(Math.random() * 7)} days')
        `, [userId, electionId, municipio.id, candidato.id, confidence]);

        totalPredictions++;
      }

      console.log(`  ✓ ${numPredictions} predicciones creadas`);
    }

    await client.query('COMMIT');

    console.log(`\n✅ Seed completado:`);
    console.log(`   - Usuarios simulados: ${totalUsers}`);
    console.log(`   - Predicciones totales: ${totalPredictions}`);

    // 4. Mostrar estadísticas por municipio
    const statsResult = await client.query(`
      SELECT 
        m.name as municipio,
        c.name as candidato,
        c.party,
        COUNT(p.id) as predicciones,
        ROUND(AVG(p.confidence), 1) as confianza_promedio
      FROM predictions p
      JOIN municipalities m ON m.id = p.municipality_id
      JOIN candidates c ON c.id = p.candidate_id
      WHERE p.election_id = $1
      GROUP BY m.id, m.name, c.id, c.name, c.party
      ORDER BY m.name, predicciones DESC
      LIMIT 20
    `, [electionId]);

    console.log('\n📊 Top 20 predicciones por candidato:');
    console.table(statsResult.rows);

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
  seedPredictions()
    .then(() => {
      console.log('\n🎉 Seed de predicciones finalizado');
      process.exit(0);
    })
    .catch(error => {
      console.error('💥 Error fatal:', error);
      process.exit(1);
    });
}

module.exports = { seedPredictions };