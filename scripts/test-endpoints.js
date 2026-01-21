// test-endpoints.js
// Script para probar TODOS los endpoints críticos
// EJECUTAR: node test-endpoints.js

const API_URL = 'http://localhost:3000/api';

async function testEndpoints() {
    console.log('🧪 INICIANDO PRUEBAS DE ENDPOINTS\n');
    console.log('═'.repeat(80));

    const tests = [
        {
            name: 'Health Check',
            method: 'GET',
            url: `${API_URL}/health`,
            expected: 'status: ok'
        },
        {
            name: 'Listar Municipios',
            method: 'GET',
            url: `${API_URL}/data/municipios`,
            expected: 'Array con municipios'
        },
        {
            name: 'Listar Candidatos',
            method: 'GET',
            url: `${API_URL}/candidates`,
            expected: 'Array con candidatos'
        },
        {
            name: 'Listar Encuestas Activas',
            method: 'GET',
            url: `${API_URL}/surveys/active`,
            expected: 'surveys: []'
        },
        {
            name: 'Datos Históricos (Municipio 1)',
            method: 'GET',
            url: `${API_URL}/data/comparacion/1`,
            expected: 'Datos históricos'
        }
    ];

    for (const test of tests) {
        try {
            console.log(`\n📍 ${test.name}`);
            console.log(`   URL: ${test.url}`);

            const response = await fetch(test.url);
            const data = await response.json();

            if (response.ok) {
                console.log(`   ✅ ÉXITO (${response.status})`);
                console.log(`   📊 Datos:`, JSON.stringify(data).substring(0, 150) + '...');
            } else {
                console.log(`   ❌ ERROR (${response.status})`);
                console.log(`   📛 Mensaje:`, data.error || data.message);
            }
        } catch (error) {
            console.log(`   ❌ FALLO DE CONEXIÓN`);
            console.log(`   📛 Error:`, error.message);
        }
    }

    console.log('\n' + '═'.repeat(80));
    console.log('🏁 PRUEBAS COMPLETADAS\n');
}

testEndpoints().catch(console.error);