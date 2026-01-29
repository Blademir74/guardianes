#!/usr/bin/env node

/**
 * Script para ejecutar la importación completa de datos
 * Uso: node scripts/run-data-import.js
 */

const DataImporter = require('../src/services/data-importer');

async function main() {
    console.log('🚀 Iniciando importación completa de datos para Guardianes Guerrero 2026...\n');

    const importer = new DataImporter();

    try {
        await importer.importAllData();
        console.log('\n✅ ¡Importación completada exitosamente!');
        console.log('🎉 El sistema Guardianes Guerrero 2026 está listo para recibir ciudadanos.');
    } catch (error) {
        console.error('\n❌ Error durante la importación:', error.message);
        process.exit(1);
    } finally {
        await importer.close();
    }
}

main();