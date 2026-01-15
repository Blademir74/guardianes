// scripts/debugHistoricalData.js
require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: 'postgresql://postgres:NuevaClave123@localhost:5432/guardianes_db',
});

async function debugHistoricalData() {
  const municipioName = 'Acapulco'; // <-- CAMBIA ESTO por un municipio que te dé el problema
  const year = '2018';           // <-- CAMBIA ESTO por el año que te da el problema

  console.log(`Depurando datos históricos para: ${municipioName}, Año: ${year}`);
  console.log('Buscando todas las coincidencias en la columna ambito_nombre...\n');

  try {
    const query = `
      SELECT 
        tipo_eleccion,
        ambito_nombre,
        votos_validos,  -- CORREGIDO
        total_votos     -- CORREGIDO
      FROM resultados_electorales 
      WHERE ambito_nombre ILIKE $1 AND anio = $2
      ORDER BY tipo_eleccion, ambito_nombre;
    `;
    
    const result = await pool.query(query, [`%${municipioName}%`, year]);

    if (result.rows.length === 0) {
      console.log(`❌ No se encontró NINGÚN resultado para ${municipioName} en ${year}.`);
    } else {
      console.log(`✅ Se encontraron ${result.rows.length} resultados:`);
      console.table(result.rows);
    }

  } catch (err) {
    console.error('Error al depurar datos históricos:', err);
  } finally {
    await pool.end();
  }
}

debugHistoricalData();