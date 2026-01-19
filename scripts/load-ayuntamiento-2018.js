// scripts/load-ayuntamiento-2018.js V3 - INTELIGENTE
// Auto-detecta el delimitador del CSV y procesa los datos.
// EJECUTAR: node scripts/load-ayuntamiento-2018.js

require('dotenv').config({ path: '.env.local' });
const { Pool } = require('pg');
const fs = require('fs');
const readline = require('readline');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

function normalizeName(name) {
  if (!name) return '';
  return name.toString().toUpperCase().trim().replace(/\s+/g, ' ');
}

// Función para detectar el delimitador más probable en una línea
function detectDelimiter(line) {
  const delimiters = ['|', '\t', ',', ';'];
  let maxCount = 0;
  let bestDelimiter = delimiters[0];

  delimiters.forEach(del => {
    const count = (line.match(new RegExp('\\' + del, 'g')) || []).length;
    if (count > maxCount) {
      maxCount = count;
      bestDelimiter = del;
    }
  });

  return bestDelimiter;
}

async function loadAyuntamiento2018() {
  console.log('📄 Cargando ayuntamiento2018.csv (Auto-detectando delimitador)\n');

  try {
    const municipiosResult = await pool.query('SELECT id, name FROM municipalities');
    const municipiosMap = new Map();
    municipiosResult.rows.forEach(m => {
      municipiosMap.set(normalizeName(m.name), m.id);
    });
    console.log(`✅ ${municipiosMap.size} municipios cargados desde la BD.\n`);

    const filePath = 'Historico votaciones/ayuntamiento2018.csv';
    
    if (!fs.existsSync(filePath)) {
      console.error('❌ Archivo no encontrado en:', filePath);
      return;
    }

    const fileStream = fs.createReadStream(filePath, { encoding: 'utf8' });
    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });

    let lineNum = 0;
    let headers = [];
    let delimiter = '';
    let aggregated = new Map();
    let skippedLines = 0;

    rl.on('line', (line) => {
      lineNum++;

      if (lineNum === 1) {
        delimiter = detectDelimiter(line);
        console.log(`✅ Delimitador detectado: '${delimiter}'`);
        
        headers = line.split(delimiter).map(h => 
          h.trim().replace(/"/g, '').toUpperCase().replace(/\s+/g, '_')
        );
        console.log(`✅ Columnas detectadas: ${headers.join(', ')}\n`);
        return;
      }

      const values = line.split(delimiter);
      if (values.length !== headers.length) {
        console.warn(`⚠️ Línea ${lineNum}: Número de columnas incorrecto. Omitiendo.`);
        skippedLines++;
        return;
      }

      const row = {};
      headers.forEach((h, i) => {
        row[h] = values[i] ? values[i].trim() : '';
      });

      const municipioRaw = row.MUNICIPIO;
      if (!municipioRaw) {
        console.warn(`⚠️ Línea ${lineNum}: Sin nombre de municipio. Omitiendo.`);
        skippedLines++;
        return;
      }

      const normalized = normalizeName(municipioRaw);
      let munId = municipiosMap.get(normalized);
      
      if (!munId) {
        console.error(`❌ Línea ${lineNum}: Municipio '${municipioRaw}' (normalizado: '${normalized}') NO ENCONTRADO en la BD.`);
        skippedLines++;
        return;
      }

      const partidos = ['PAN', 'PRI', 'PRD', 'PVEM', 'PT', 'MC', 'MORENA', 'NA'];
      partidos.forEach(partido => {
        const votosStr = row[partido] || '0';
        const votos = parseInt(votosStr, 10);

        if (isNaN(votos)) {
            console.warn(`⚠️ Línea ${lineNum}: Valor de votos no válido ('${votosStr}') para ${partido} en ${municipioRaw}. Usando 0.`);
            return;
        }
        
        if (votos > 0) {
          const key = `${munId}-${partido}`;
          if (!aggregated.has(key)) {
            aggregated.set(key, {
              munId,
              partido,
              votos: 0,
              total: parseInt(row.TOTAL_VOTOS || '0', 10),
              nominal: parseInt(row.LISTA_NOMINAL || '0', 10)
            });
          }
          aggregated.get(key).votos += votos;
        }
      });
    });

    rl.on('close', async () => {
      console.log(`\n📊 ${lineNum} líneas procesadas. ${skippedLines} líneas omitidas.`);
      console.log(`📦 ${aggregated.size} registros únicos listos para insertar.\n`);
      
      if (aggregated.size === 0) {
        console.log('🔚 No hay datos para insertar. Revisa los mensajes de error anteriores.');
        await pool.end();
        return;
      }
      
      let inserted = 0;
      for (const data of aggregated.values()) {
        try {
          const pct = data.total > 0 ? ((data.votos / data.total) * 100).toFixed(2) : '0.00';
          const turnout = data.nominal > 0 ? ((data.total / data.nominal) * 100).toFixed(2) : '0.00';

          await pool.query(
            `INSERT INTO historical_results 
            (municipality_id, election_year, election_type, party, votes, percentage, turnout_percentage)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            ON CONFLICT DO NOTHING`,
            [data.munId, 2018, 'Presidencias Municipales', data.partido, data.votos, pct, turnout]
          );
          inserted++;
        } catch (err) {
          console.error(`❌ Error al insertar ${data.partido} para municipio ID ${data.munId}:`, err.message);
        }
      }

      console.log(`✅ ${inserted} registros insertados correctamente.\n`);

      const check = await pool.query(`
        SELECT COUNT(*) as total, SUM(votes) as votos
        FROM historical_results
        WHERE election_year = 2018 AND election_type = 'Presidencias Municipales'
      `);

      console.log('📊 VERIFICACIÓN FINAL:');
      console.log(`   2018 Ayuntamientos: ${check.rows[0].total} registros, ${parseInt(check.rows[0].votos || 0).toLocaleString()} votos`);

      await pool.end();
    });

  } catch (error) {
    console.error('❌ ERROR FATAL:', error);
    await pool.end();
  }
}

loadAyuntamiento2018().catch(console.error);