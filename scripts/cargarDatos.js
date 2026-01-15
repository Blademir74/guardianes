// scripts/cargarDatos.js
const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const { Pool } = require('pg');

require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:NuevaClave123@localhost:5432/guardianes_db',
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false,
});

const BASE_PATH = path.join(__dirname, '..');

// Función para cargar los datos del electorado
async function cargarElectorado() {
  console.log('Iniciando carga de electorado desde INE_limpio.csv...');
  const filePath = path.join(BASE_PATH, 'INE_limpio.csv');
  
  const client = await pool.connect();
  try {
    await client.query('TRUNCATE TABLE electorado_seccional RESTART IDENTITY;'); // Limpia la tabla antes de cargar
    await client.query('BEGIN');
    
    fs.createReadStream(filePath)
      .pipe(csv())
      // DENTRO de la función cargarElectorado, reemplaza el bloque .on('data', ...)

      // DENTRO de la función cargarElectorado, reemplaza el bloque .on('data', ...)
.on('data', async (row) => {
  // --- VALIDACIÓN DE DATOS ---
  // Usamos el nombre de columna real: 'SECCION'
  if (!row['SECCION'] || row['SECCION'].trim() === '') {
    console.warn(`⚠️ Advertencia: Se encontró una fila sin sección. Fila omitida.`);
    return;
  }

  try {
    const query = `
      INSERT INTO electorado_seccional(
        distrito_federal, clave_municipio, nombre_municipio, seccion, lista_nominal_total, 
        hombres_ln, mujeres_ln, hombres_18, mujeres_18, hombres_19, mujeres_19, 
        hombres_20_24, mujeres_20_24, hombres_25_29, mujeres_25_29, hombres_30_34, mujeres_30_34,
        hombres_35_39, mujeres_35_39, hombres_40_44, mujeres_40_44, hombres_45_49, mujeres_45_49,
        hombres_50_54, mujeres_50_54, hombres_55_59, mujeres_55_59, hombres_60_64, mujeres_60_64,
        hombres_65_mas, mujeres_65_mas
      ) VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31)
    `;
    const values = [
      parseInt(row['DISTRITO FEDERAL']) || 0,
      parseInt(row['CLAVE MUNICIPIO']) || 0,
      row['NOMBRE MUNICIPIO'],
      row['SECCION'].trim(),
      parseInt(row['LISTA NOMINAL']) || 0,
      parseInt(row['LISTA HOMBRES']) || 0,
      parseInt(row['LISTA MUJERES']) || 0,
      parseInt(row['LISTA_18_HOMBRES']) || 0, parseInt(row['LISTA_18_MUJERES']) || 0,
      parseInt(row['LISTA_19_HOMBRES']) || 0, parseInt(row['LISTA_19_MUJERES']) || 0,
      parseInt(row['LISTA_20_24_HOMBRES']) || 0, parseInt(row['LISTA_20_24_MUJERES']) || 0,
      parseInt(row['LISTA_25_29_HOMBRES']) || 0, parseInt(row['LISTA_25_29_MUJERES']) || 0,
      parseInt(row['LISTA_30_34_HOMBRES']) || 0, parseInt(row['LISTA_30_34_MUJERES']) || 0,
      parseInt(row['LISTA_35_39_HOMBRES']) || 0, parseInt(row['LISTA_35_39_MUJERES']) || 0,
      parseInt(row['LISTA_40_44_HOMBRES']) || 0, parseInt(row['LISTA_40_44_MUJERES']) || 0,
      parseInt(row['LISTA_45_49_HOMBRES']) || 0, parseInt(row['LISTA_45_49_MUJERES']) || 0,
      parseInt(row['LISTA_50_54_HOMBRES']) || 0, parseInt(row['LISTA_50_54_MUJERES']) || 0,
      parseInt(row['LISTA_55_59_HOMBRES']) || 0, parseInt(row['LISTA_55_59_MUJERES']) || 0,
      parseInt(row['LISTA_60_64_HOMBRES']) || 0, parseInt(row['LISTA_60_64_MUJERES']) || 0,
      parseInt(row['LISTA_65_Y_MAS_HOMBRES']) || 0, parseInt(row['LISTA_65_Y_MAS_MUJERES']) || 0,
    ];
    await client.query(query, values);
  } catch (err) {
    console.error(`Error al insertar la fila con sección ${row['SECCION']}:`, err.message);
  }
})
      .on('end', async () => {
        await client.query('COMMIT');
        console.log('¡Carga de electorado completada!');
        client.release();
        await cargarResultadosElectorales();
      })
      .on('error', async (err) => {
        await client.query('ROLLBACK');
        console.error('Error fatal en la carga de electorado:', err);
        client.release();
      });

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error en la transacción de electorado:', err);
    client.release();
  }
}

// Función para cargar los resultados históricos
async function cargarResultadosElectorales() {
  console.log('Iniciando carga de resultados electorales...');
  const historicoPath = path.join(BASE_PATH, 'Historico votaciones');
  const archivos = fs.readdirSync(historicoPath);

  const client = await pool.connect();
  try {
    await client.query('TRUNCATE TABLE resultados_electorales RESTART IDENTITY;'); // Limpia la tabla
    await client.query('BEGIN');

    for (const archivo of archivos) {
      if (!archivo.endsWith('.csv')) continue;
      
      console.log(`Procesando archivo: ${archivo}`);
      const filePath = path.join(historicoPath, archivo);
      
      const anio = parseInt(archivo.match(/\d{4}/)[0]);
      let tipoEleccion = 'Desconocido';
      if (archivo.includes('ayuntamiento')) tipoEleccion = 'Ayuntamiento';
      if (archivo.includes('diputacionlocal')) tipoEleccion = 'Diputación Local';
      if (archivo.includes('gobernatura')) tipoEleccion = 'Gubernatura';

      await new Promise((resolve, reject) => {
        fs.createReadStream(filePath)
          .pipe(csv())
          // DENTRO de la función cargarResultadosElectorales, reemplaza el bloque .on('data', ...)
.on('data', async (row) => {
  // Unimos las tres columnas en una sola para el campo 'ambito_nombre'
  const ambitoNombre = `${row['CLAVE MUNICIPIO']} - ${row['MUNICIPIO']} - ${row['SECCION']}`;

  const query = `
    INSERT INTO resultados_electorales(
      anio, tipo_eleccion, distrito_local, ambito_nombre, votos_pan, votos_pri, votos_prd, 
      votos_pvem, votos_pt, votos_mc, votos_morena, votos_validos, votos_nulos, 
      total_votos, lista_nominal
    ) VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
  `;
  const values = [
    anio,
    tipoEleccion,
    parseInt(row['DISTRITO LOCAL']) || null,
    ambitoNombre, // Usamos la variable que creamos
    parseInt(row['PAN']) || 0,
    parseInt(row['PRI']) || 0,
    parseInt(row['PRD']) || 0,
    parseInt(row['PVEM']) || 0,
    parseInt(row['PT']) || 0,
    parseInt(row['MC']) || 0,
    parseInt(row['MORENA']) || 0,
    parseInt(row['VOTOS VALIDOS']) || 0,
    parseInt(row['VOTOS NULOS']) || 0,
    parseInt(row['TOTAL VOTOS']) || 0,
    parseInt(row['LISTA NOMINAL']) || 0,
  ];
  await client.query(query, values);
})
          .on('end', () => {
            console.log(`-> Archivo ${archivo} procesado.`);
            resolve();
          })
          .on('error', (err) => {
            console.error(`Error procesando ${archivo}:`, err);
            reject(err);
          });
      });
    }

    await client.query('COMMIT');
    console.log('¡Carga de resultados electorales completada!');
    
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error en la transacción de resultados:', err);
  } finally {
    client.release();
    await pool.end();
    console.log('Conexión a la base de datos cerrada. Proceso finalizado.');
  }
}

// Iniciar el proceso
cargarElectorado();