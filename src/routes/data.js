// src/routes/data.js

const express = require('express');
const router = express.Router();

/**
 * GET /api/data/participacion
 * Participación agregada por año y tipo de elección (no por municipio)
 * Usa query params: ?anio=2024&tipo_eleccion=Ayuntamiento (ambos opcionales)
 */
router.get('/participacion', async (req, res) => {
  try {
    const { anio, tipo_eleccion } = req.query;

    let query = `
      SELECT
        anio,
        tipo_eleccion,
        SUM(lista_nominal) AS lista_nominal_total,
        SUM(total_votos) AS votos_totales_emitidos,
        ROUND(
          (CAST(SUM(total_votos) AS NUMERIC) / NULLIF(CAST(SUM(lista_nominal) AS NUMERIC), 0)) * 100,
          2
        ) AS porcentaje_participacion
      FROM resultados_electorales
      WHERE 1=1
    `;

    const values = [];
    let paramIndex = 1;

    if (anio) {
      query += ` AND anio = $${paramIndex++}`;
      values.push(anio);
    }

    if (tipo_eleccion) {
      query += ` AND tipo_eleccion = $${paramIndex++}`;
      values.push(tipo_eleccion);
    }

    query += ' GROUP BY anio, tipo_eleccion ORDER BY anio DESC, tipo_eleccion;';

    const result = await db.query(query, values);
    res.json(result.rows);
  } catch (err) {
    console.error('Error al obtener las estadísticas de participación:', err);
    res.status(500).json({ error: 'Failed to fetch participation data' });
  }
});

/**
 * GET /api/data/municipios
 * Lista de municipios desde tabla municipalities (con IDs reales)
 */
router.get('/municipios', async (req, res) => {
  try {
    const result = await global.dbQuery(`
      SELECT id, name, state
      FROM municipalities
      ORDER BY name ASC
    `);

    res.json(result.rows.map(m => ({
      id: m.id,
      name: m.name,
      state: m.state
    })));
  } catch (error) {
    console.error('Error al obtener municipios:', error.message);
    res.status(500).json({
      error: 'Failed to fetch municipalities',
      details: error.message,
      code: error.code
    });
  }
});

/**
 * GET /api/data/comparacion/:municipioId
 * Comparación 2018 vs 2021 vs 2024 usando ID de municipalities
 */
router.get('/comparacion/:municipioId', async (req, res) => {
  try {
    const municipioId = parseInt(req.params.municipioId, 10);

    if (isNaN(municipioId) || municipioId <= 0) {
      return res.status(400).json({ error: 'ID de municipio inválido' });
    }

    // Obtener nombre del municipio
    const municipioResult = await global.dbQuery(
      'SELECT name FROM municipalities WHERE id = $1',
      [municipioId]
    );

    if (municipioResult.rows.length === 0) {
      return res.status(404).json({ error: 'Municipio no encontrado' });
    }

    const municipioNombre = municipioResult.rows[0].name;

    // Query de comparación
    const result = await global.dbQuery(`
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

    res.json(result.rows);

  } catch (error) {
    console.error('❌ Error en /comparacion:', error);
    res.status(500).json({ error: 'Failed to fetch comparison data' });
  }
});

/**
 * GET /api/data/participacion/:municipioId
 * Participación histórica usando ID
 */
router.get('/participacion/:municipioId', async (req, res) => {
  try {
    const municipioId = parseInt(req.params.municipioId, 10);

    if (isNaN(municipioId) || municipioId <= 0) {
      return res.status(400).json({ error: 'ID de municipio inválido' });
    }

    // Obtener nombre del municipio
    const municipioResult = await global.dbQuery(
      'SELECT name FROM municipalities WHERE id = $1',
      [municipioId]
    );

    if (municipioResult.rows.length === 0) {
      return res.status(404).json({ error: 'Municipio no encontrado' });
    }

    const municipioNombre = municipioResult.rows[0].name;

    const result = await global.dbQuery(`
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

    res.json(result.rows);
  } catch (error) {
    console.error('Error en /participacion por municipio:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/data/candidatos/:municipioId
 * Candidatos por municipio (con validación de ID)
 */
router.get('/candidatos/:municipioId', async (req, res) => {
  try {
    const municipioId = parseInt(req.params.municipioId, 10);

    if (isNaN(municipioId) || municipioId <= 0) {
      return res.status(400).json({ error: 'ID de municipio inválido' });
    }

    // Verificar que el municipio existe
    const municipioCheck = await db.query(
      'SELECT id, name FROM municipalities WHERE id = $1',
      [municipioId]
    );

    if (municipioCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Municipio no encontrado' });
    }

    // Buscar candidatos reales
    const candidatesQuery = await db.query(`
      SELECT 
        c.id,
        c.name,
        c.party,
        e.name as election_name,
        e.election_type
      FROM candidates c
      JOIN elections e ON e.id = c.election_id
      WHERE c.municipality_id = $1 AND e.is_active = true
      ORDER BY c.party, c.name
    `, [municipioId]);

    // Siempre devolver array (vacío o con datos)
    res.json(candidatesQuery.rows.map(c => ({
      id: c.id,
      name: c.name,
      party: c.party,
      electionName: c.election_name,
      electionType: c.election_type
    })));

  } catch (error) {
    console.error('Error al obtener candidatos:', error);
    res.status(500).json({ error: 'Failed to fetch candidates' });
  }
});

/**
 * GET /api/data/secciones/:municipioId
 * Placeholder para secciones; por ahora vacío
 */
router.get('/secciones/:municipioId', async (req, res) => {
  try {
    res.json([]);
  } catch (error) {
    console.error('Failed to fetch sections:', error);
    res.status(500).json({ error: 'Failed to fetch sections' });
  }
});

/**
 * GET /api/data/historico/:municipioId/:year
 * Detalle histórico por municipio (ID) y año
 */
router.get('/historico/:municipioId/:year', async (req, res) => {
  try {
    const municipioId = parseInt(req.params.municipioId, 10);
    const year = parseInt(req.params.year, 10);

    if (isNaN(municipioId) || municipioId <= 0) {
      return res.status(400).json({ error: 'ID de municipio inválido' });
    }

    if (isNaN(year)) {
      return res.status(400).json({ error: 'Año inválido' });
    }

    // Obtener nombre del municipio
    const municipioResult = await db.query(
      'SELECT name FROM municipalities WHERE id = $1',
      [municipioId]
    );

    if (municipioResult.rows.length === 0) {
      return res.status(404).json({ error: 'Municipio no encontrado' });
    }

    const municipioNombre = municipioResult.rows[0].name;

    const query = `
      SELECT
        tipo_eleccion,
        ambito_nombre,
        votos_pan, votos_pri, votos_prd, votos_pvem, votos_pt, votos_mc, votos_na, votos_morena,
        votos_validos,
        total_votos,
        lista_nominal,
        ROUND(100.0 * votos_validos / NULLIF(lista_nominal, 0), 2) AS participacion
      FROM resultados_electorales
      WHERE trim(upper(split_part(ambito_nombre, ' - ', 2))) LIKE trim(upper($1)) AND anio = $2
      ORDER BY tipo_eleccion;
    `;

    const result = await db.query(query, [municipioNombre, year]);

    const historical = result.rows.map(r => ({
      electionType: r.tipo_eleccion,
      municipio: municipioNombre,
      pan: r.votos_pan,
      pri: r.votos_pri,
      prd: r.votos_prd,
      pvem: r.votos_pvem,
      pt: r.votos_pt,
      mc: r.votos_mc,
      na: r.votos_na,
      morena: r.votos_morena,
      validVotes: r.votos_validos,
      totalVotes: r.total_votos,
      listaNominal: r.lista_nominal,
      participacion: r.participacion
    }));

    res.json(historical);
  } catch (error) {
    console.error('Failed to fetch historical results:', error);
    res.status(500).json({ error: 'Failed to fetch historical results' });
  }
});

/**
 * GET /api/data/tendencias/:municipioId
 * Serie temporal por partido (PAN, PRI, MORENA, etc.) para un municipio
 */
router.get('/tendencias/:municipioId', async (req, res) => {
  try {
    const municipioId = parseInt(req.params.municipioId, 10);

    if (isNaN(municipioId) || municipioId <= 0) {
      return res.status(400).json({ error: 'ID de municipio inválido' });
    }

    // Obtener nombre del municipio
    const municipioResult = await db.query(
      'SELECT name FROM municipalities WHERE id = $1',
      [municipioId]
    );

    if (municipioResult.rows.length === 0) {
      return res.status(404).json({ error: 'Municipio no encontrado' });
    }

    const municipioNombre = municipioResult.rows[0].name;

    const query = `
      SELECT anio, votos_pan, votos_pri, votos_prd, votos_pvem, votos_pt, votos_mc, votos_na, votos_morena, votos_validos
      FROM resultados_electorales
      WHERE trim(upper(split_part(ambito_nombre, ' - ', 2))) LIKE trim(upper($1))
      ORDER BY anio;
    `;

    const results = await db.query(query, [municipioNombre]);
    const data = results.rows;

    if (!data || data.length === 0) {
      return res.json({ municipio: municipioNombre, years: [], parties: {} });
    }

    const years = [...new Set(data.map(d => d.anio))];

    const parties = ['PAN', 'PRI', 'PRD', 'PVEM', 'PT', 'MC', 'NA', 'MORENA'];
    const partyData = {};

    parties.forEach(party => {
      partyData[party] = {};
      data.forEach(row => {
        const partyKey = 'votos_' + party.toLowerCase();
        const votes = row[partyKey];
        const percentage = row.votos_validos > 0 ? (votes / row.votos_validos) * 100 : 0;
        partyData[party][row.anio] = parseFloat(percentage.toFixed(2));
      });
    });

    res.json({ municipio: municipioNombre, years, parties: partyData });
  } catch (error) {
    console.error('Failed to fetch trends:', error);
    res.status(500).json({ error: 'Failed to fetch trends' });
  }
});

module.exports = router;