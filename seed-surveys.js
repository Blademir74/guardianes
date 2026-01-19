// seed-surveys.js
require('dotenv').config();
const { query } = require('./src/db');

const candidates = [
  'Félix Salgado Macedonio',
  'Esthela Damian Peralta',
  'Beatriz Mojica Morga',
  'Abelina López Rodríguez',
  'Karen Castrejón (PVEM)',
  'Manuel Añorve Baños (PRI)',
  'Pedro Segura (Independiente)',
  'Ninguno / Voto Nulo'
];

async function seed() {
  console.log('🌱 Seeding database with initial survey...');

  try {
    // 1. Crear la encuesta de Gubernatura 2027
    const surveyResult = await query(
      `INSERT INTO surveys (title, description, active) VALUES ($1, $2, $3) RETURNING id`,
      ['Predicción Gubernatura Guerrero 2027', '¿Quién crees que ganará las elecciones?']
    );
    const surveyId = surveyResult.rows[0].id;
    console.log(`✅ Encuesta creada con ID: ${surveyId}`);

    // 2. Añadir las opciones (candidatos)
    for (let i = 0; i < candidates.length; i++) {
      await query(
        `INSERT INTO options_encuesta (encuesta_id, texto_opcion, orden) VALUES ($1, $2, $3)`,
        [surveyId, candidates[i], i + 1]
      );
    }
    console.log('✅ Candidatos añadidos a la encuesta.');

    console.log('🎉 ¡Base de datos poblada exitosamente!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error durante el seeding:', error);
    process.exit(1);
  }
}

seed();