const { Pool } = require('pg');

// Pool directo para Vercel (funciona con variables de entorno)
console.log('🔍 DB-HELPER: DATABASE_URL exists:', !!process.env.DATABASE_URL);
console.log('🔍 DB-HELPER: DATABASE_URL length:', process.env.DATABASE_URL ? process.env.DATABASE_URL.length : 0);
console.log('🔍 DB-HELPER: DATABASE_URL preview:', process.env.DATABASE_URL ? process.env.DATABASE_URL.substring(0, 30) + '...' : 'null');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

console.log('✅ DB-HELPER: Pool creado');

// Función helper para queries
async function query(text, params = []) {
  const client = await pool.connect();
  try {
    const result = await client.query(text, params);
    return result;
  } finally {
    client.release();
  }
}

// Funciones específicas para endpoints
const dbHelper = {
  // Municipios
  async getMunicipios() {
    const result = await query(`
      SELECT id, name, state
      FROM municipalities
      ORDER BY name ASC
    `);
    return result.rows.map(m => ({
      id: m.id,
      name: m.name,
      state: m.state
    }));
  },

  // Comparación electoral
  async getComparacion(municipioId) {
    const municipioResult = await query(
      'SELECT name FROM municipalities WHERE id = $1',
      [municipioId]
    );

    if (municipioResult.rows.length === 0) {
      throw new Error('Municipio no encontrado');
    }

    const municipioNombre = municipioResult.rows[0].name;

    const result = await query(`
      SELECT
        tipo_eleccion,
        CASE
          WHEN SUM(CASE WHEN anio = 2024 THEN lista_nominal ELSE 0 END) > 0 THEN
            ROUND(
              (SUM(CASE WHEN anio = 2024 THEN votos_validos ELSE 0 END)::numeric /
               NULLIF(SUM(CASE WHEN anio = 2024 THEN lista_nominal ELSE 0 END), 0) * 100),
              2
            )
          ELSE 0.00
        END AS "2024",
        CASE
          WHEN SUM(CASE WHEN anio = 2021 THEN lista_nominal ELSE 0 END) > 0 THEN
            ROUND(
              (SUM(CASE WHEN anio = 2021 THEN votos_validos ELSE 0 END)::numeric /
               NULLIF(SUM(CASE WHEN anio = 2021 THEN lista_nominal ELSE 0 END), 0) * 100),
              2
            )
          ELSE 0.00
        END AS "2021",
        CASE
          WHEN SUM(CASE WHEN anio = 2018 THEN lista_nominal ELSE 0 END) > 0 THEN
            ROUND(
              (SUM(CASE WHEN anio = 2018 THEN votos_validos ELSE 0 END)::numeric /
               NULLIF(SUM(CASE WHEN anio = 2018 THEN lista_nominal ELSE 0 END), 0) * 100),
              2
            )
          ELSE 0.00
        END AS "2018"
      FROM resultados_electorales
      WHERE tipo_eleccion IN ('Ayuntamiento','Diputación Local','Gubernatura')
        AND trim(upper(split_part(ambito_nombre, ' - ', 2))) LIKE trim(upper($1))
      GROUP BY tipo_eleccion
      ORDER BY tipo_eleccion
    `, [municipioNombre]);

    return result.rows;
  },

  // Participación
  async getParticipacion(municipioId) {
    const municipioResult = await query(
      'SELECT name FROM municipalities WHERE id = $1',
      [municipioId]
    );

    if (municipioResult.rows.length === 0) {
      throw new Error('Municipio no encontrado');
    }

    const municipioNombre = municipioResult.rows[0].name;

    const result = await query(`
      SELECT
        tipo_eleccion,
        anio AS year,
        CASE
          WHEN SUM(votos_validos) > 0 AND SUM(lista_nominal) > 0 THEN
            ROUND(
              (SUM(votos_validos)::numeric / NULLIF(SUM(lista_nominal), 0) * 100),
              2
            )
          ELSE 0.00
        END AS participacion
      FROM resultados_electorales
      WHERE trim(upper(split_part(ambito_nombre, ' - ', 2))) LIKE trim(upper($1))
        AND tipo_eleccion IN ('Ayuntamiento','Diputación Local','Gubernatura')
      GROUP BY tipo_eleccion, anio
      ORDER BY anio DESC, tipo_eleccion
    `, [municipioNombre]);

    return result.rows;
  },

  // Encuestas activas
  async getActiveSurveys() {
    const result = await query(`
      SELECT
        id,
        title,
        description,
        'Gubernatura 2027' as electionType,
        CASE WHEN is_active THEN 'Activa' ELSE 'Inactiva' END as status,
        (SELECT COUNT(*) FROM survey_responses WHERE survey_id = surveys.id) as totalRespondents
      FROM surveys
      WHERE is_active = true
      ORDER BY created_at DESC
    `);

    return {
      surveys: result.rows.map(survey => ({
        id: survey.id,
        title: survey.title || 'Encuesta',
        description: survey.description || '',
        electionType: survey.electiontype || 'Encuesta',
        status: survey.status,
        totalRespondents: parseInt(survey.totalrespondents) || 0
      }))
    };
  }
};

module.exports = dbHelper;