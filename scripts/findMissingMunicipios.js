// scripts/findMissingMunicipiosV2.js
require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: 'postgresql://postgres:NuevaClave123@localhost:5432/guardianes_db',
});

async function findMissingMunicipios() {
  console.log('Analizando todos los nombres de municipio para encontrar el problema...');
  try {
    // 1. Obtenemos TODOS los nombres únicos sin filtrar
    const query = `
      SELECT DISTINCT TRIM(SPLIT_PART(ambito_nombre, ' - ', 2)) as nombre_extraido
      FROM resultados_electorales
      WHERE TRIM(SPLIT_PART(ambito_nombre, ' - ', 2)) IS NOT NULL AND TRIM(SPLIT_PART(ambito_nombre, ' - ', 2)) != ''
      ORDER BY nombre_extraido;
    `;
    const result = await pool.query(query);
    
    const problematicos = [];
    const validos = [];

    // 2. Filtramos en JavaScript, que es más seguro
    result.rows.forEach(row => {
      const nombre = row.nombre_extraido;
      // Si el nombre contiene ALGO que no sea letra, espacio, acento, guion o punto, lo marcamos como problemático.
      if (/[^a-zA-Z\sáéíóúñÁÉÍÓÚÑ\.\-]/.test(nombre)) {
        problematicos.push(nombre);
      } else {
        validos.push(nombre);
      }
    });
    
    console.log(`\n--- ANÁLISIS COMPLETO ---`);
    console.log(`Se encontraron ${result.rows.length} nombres únicos en total.`);
    console.log(`${validos.length} nombres parecen válidos.`);
    console.log(`${problematicos.length} nombres contienen caracteres especiales y podrían haber sido filtrados.`);
    
    if (problematicos.length > 0) {
      console.log('\n--- LISTA DE NOMBRES PROBLEMÁTICOS (FILTRADOS) ---');
      console.table(problematicos);
    }
    
    if (validos.length > 0) {
        console.log('\n--- MUESTRA DE NOMBRES VÁLIDOS ---');
        console.table(validos.slice(0, 10)); // Muestra solo los primeros 10
    }

  } catch (err) {
    console.error('Error al buscar municipios faltantes:', err);
  } finally {
    await pool.end();
  }
}

findMissingMunicipios();