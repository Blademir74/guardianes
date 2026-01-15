// scripts/check2018Data.js
require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: 'postgresql://postgres:NuevaClave123@localhost:5432/guardianes_db',
});

async function check2018Data() {
  console.log('Verificando si existen datos del año 2018 en la base de datos...');
  try {
    const query = `
      SELECT 
        tipo_eleccion,
        COUNT(*) as total_filas
      FROM resultados_electorales 
      WHERE anio = 2018
      GROUP BY tipo_eleccion;
    `;
    
    const result = await pool.query(query);

    if (result.rows.length === 0) {
      console.log('\n❌ RESULTADO: No se encontraron datos para el año 2018 en la base de datos.');
      console.log('El problema es que los datos nunca se cargaron correctamente.');
    } else {
      console.log('\n✅ RESULTADO: Se encontraron datos para el año 2018.');
      console.table(result.rows);
      console.log('\nEl problema no es la carga de datos, sino cómo se están solicitando o mostrando en el dashboard.');
    }

  } catch (err) {
    console.error('Error al verificar los datos de 2018:', err);
  } finally {
    await pool.end();
    console.log('\nConexión cerrada.');
  }
}

check2018Data();