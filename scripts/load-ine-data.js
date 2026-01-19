// scripts/load-ine-final.js
// VERSIÓN FINAL CORREGIDA - Separador COMA (,)
// EJECUTAR: node scripts/load-ine-final.js

require('dotenv').config({ path: '.env.local' });
const { Pool } = require('pg');
const fs = require('fs');
const readline = require('readline');

if (!process.env.DATABASE_URL) {
  console.error('❌ DATABASE_URL no definida');
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const FILES_MAP = [
  { file: 'gobernatura2021.csv', type: 'Gubernatura', year: 2021 },
  { file: 'ayuntamiento2018.csv', type: 'Presidencias Municipales', year: 2018 },
  { file: 'ayuntamiento2021.csv', type: 'Presidencias Municipales', year: 2021 },
  { file: 'ayuntamiento2024.csv', type: 'Presidencias Municipales', year: 2024 },
  { file: 'diputacionlocal2018.csv', type: 'Diputaciones Locales', year: 2018 },
  { file: 'diputacionlocal2021.csv', type: 'Diputaciones Locales', year: 2021 },
  { file: 'diputacionlocal2024.csv', type: 'Diputaciones Locales', year: 2024 }
];

function normalizeName(name) {
  if (!name) return '';
  return name
    .toString()
    .toUpperCase()
    .trim()
    .replace(/\s+/g, ' ')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

async function loadHistoricalData() {
  console.log('🗳️  CARGADOR FINAL - DATOS HISTÓRICOS INE\n');
  console.log('═'.repeat(80));

  try {
    // Cargar municipios
    const municipiosResult = await pool.query('SELECT id, name FROM municipalities');
    const municipiosMap = new Map();

    municipiosResult.rows.forEach(m => {
      municipiosMap.set(normalizeName(m.name), m.id);
    });

    console.log(`📍 ${municipiosMap.size} municipios en BD\n`);

    let totalInserted = 0;
    let totalCreated = 0;

    for (const { file, type, year } of FILES_MAP) {
      const filePath = `Historico votaciones/${file}`;
      
      if (!fs.existsSync(filePath)) {
        console.log(`⚠️  No encontrado: ${file}\n`);
        continue;
      }

      console.log(`📄 ${file}`);
      const { inserted, created } = await processFile(filePath, type, year, municipiosMap);
      totalInserted += inserted;
      totalCreated += created;
    }

    console.log('\n' + '═'.repeat(80));
    console.log(`✅ ${totalInserted} registros insertados`);
    console.log(`🆕 ${totalCreated} municipios creados`);
    console.log('═'.repeat(80));

    // Resumen
    const summary = await pool.query(`
      SELECT 
        election_year as año,
        election_type as tipo,
        COUNT(DISTINCT municipality_id) as municipios,
        SUM(votes) as votos
      FROM historical_results
      GROUP BY election_year, election_type
      ORDER BY election_year DESC, election_type
    `);

    if (summary.rows.length > 0) {
      console.log('\n📊 RESUMEN:');
      summary.rows.forEach(r => {
        console.log(`${r.año} | ${r.tipo.padEnd(30)} | ${String(r.municipios).padStart(3)} mun. | ${r.votos.toLocaleString().padStart(10)} votos`);
      });
    }

  } catch (error) {
    console.error('❌ ERROR:', error.message);
  } finally {
    await pool.end();
  }
}

async function processFile(filePath, electionType, year, municipiosMap) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: fs.createReadStream(filePath, { encoding: 'utf8' }),
      crlfDelay: Infinity
    });

    let lineNum = 0;
    let headers = [];
    let inserted = 0;
    let created = 0;
    const aggregated = new Map();

    rl.on('line', async (line) => {
      lineNum++;

      if (lineNum === 1) {
        // Headers con COMAS
        headers = line.split(',').map(h => 
          h.trim().replace(/"/g, '').toUpperCase().replace(/\s+/g, '_')
        );
        return;
      }

      // Datos con COMAS
      const values = line.split(',');
      const row = {};
      headers.forEach((h, i) => {
        row[h] = values[i] ? values[i].trim() : '';
      });

      const municipioRaw = row.MUNICIPIO || '';
      if (!municipioRaw) return;

      const normalized = normalizeName(municipioRaw);
      
      // Buscar o crear municipio
      let munId = municipiosMap.get(normalized);
      
      if (!munId) {
        try {
          const result = await pool.query(
            'INSERT INTO municipalities (name) VALUES ($1) ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING id',
            [municipioRaw.toUpperCase()]
          );
          munId = result.rows[0].id;
          municipiosMap.set(normalized, munId);
          created++;
        } catch (err) {
          return;
        }
      }

      // Agregar votos por partido
      ['PAN', 'PRI', 'PRD', 'PVEM', 'PT', 'MC', 'MORENA'].forEach(partido => {
        const votos = parseInt(row[partido] || 0);
        if (votos === 0) return;

        const key = `${munId}-${partido}`;
        
        if (!aggregated.has(key)) {
          aggregated.set(key, {
            munId,
            partido,
            votos: 0,
            total: parseInt(row.TOTAL_VOTOS || 0),
            nominal: parseInt(row.LISTA_NOMINAL || 0)
          });
        }
        
        aggregated.get(key).votos += votos;
      });
    });

    rl.on('close', async () => {
      // Insertar datos agregados
      for (const data of aggregated.values()) {
        try {
          const pct = data.total > 0 ? ((data.votos / data.total) * 100).toFixed(2) : 0;
          const turnout = data.nominal > 0 ? ((data.total / data.nominal) * 100).toFixed(2) : 0;

          await pool.query(
            `INSERT INTO historical_results 
            (municipality_id, election_year, election_type, party, votes, percentage, turnout_percentage)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            ON CONFLICT DO NOTHING`,
            [data.munId, year, electionType, data.partido, data.votos, pct, turnout]
          );

          inserted++;
        } catch (err) {
          // Ignorar duplicados
        }
      }

      console.log(`   ✅ ${inserted} registros | 🆕 ${created} municipios`);
      resolve({ inserted, created });
    });
  });
}

loadHistoricalData().catch(console.error);