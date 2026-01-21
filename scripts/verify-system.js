// verify-system.js
// Script de verificación completa del sistema
// EJECUTAR: node verify-system.js

const API_URL = 'http://localhost:3000/api';

async function verifySystem() {
    console.log('🔍 VERIFICACIÓN COMPLETA DEL SISTEMA\n');
    console.log('═'.repeat(80));

    const results = {
        backend: { passed: 0, failed: 0 },
        data: { passed: 0, failed: 0 },
        frontend: { passed: 0, failed: 0 }
    };

    // ==================== BACKEND ====================
    console.log('\n📡 VERIFICANDO BACKEND...\n');

    const backendTests = [
        { name: 'Health Check', url: `${API_URL}/health` },
        { name: 'Candidatos', url: `${API_URL}/candidates` },
        { name: 'Encuestas Activas', url: `${API_URL}/surveys/active` },
        { name: 'Municipios', url: `${API_URL}/data/municipios` },
        { name: 'Stats', url: `${API_URL}/data/stats` }
    ];

    for (const test of backendTests) {
        try {
            const res = await fetch(test.url);
            if (res.ok) {
                console.log(`✅ ${test.name}`);
                results.backend.passed++;
            } else {
                console.log(`❌ ${test.name} - Error ${res.status}`);
                results.backend.failed++;
            }
        } catch (error) {
            console.log(`❌ ${test.name} - ${error.message}`);
            results.backend.failed++;
        }
    }

    // ==================== DATOS ====================
    console.log('\n📊 VERIFICANDO DATOS...\n');

    try {
        // Verificar candidatos
        const candidatesRes = await fetch(`${API_URL}/candidates`);
        const candidates = await candidatesRes.json();
        
        if (candidates.length >= 6) {
            console.log(`✅ Candidatos: ${candidates.length} encontrados`);
            results.data.passed++;
        } else {
            console.log(`⚠️  Candidatos: Solo ${candidates.length} (esperado: 7)`);
            results.data.failed++;
        }

        // Verificar encuestas
        const surveysRes = await fetch(`${API_URL}/surveys/active`);
        const surveysData = await surveysRes.json();
        const surveys = surveysData.surveys || [];
        
        if (surveys.length > 0) {
            console.log(`✅ Encuestas Activas: ${surveys.length}`);
            
            // Verificar preguntas de la primera encuesta
            if (surveys[0].id) {
                const questionsRes = await fetch(`${API_URL}/surveys/${surveys[0].id}/questions`);
                const questionsData = await questionsRes.json();
                const questions = questionsData.questions || [];
                
                if (questions.length >= 2) {
                    console.log(`✅ Preguntas de Encuesta: ${questions.length}`);
                    results.data.passed++;
                } else {
                    console.log(`⚠️  Preguntas: Solo ${questions.length} (esperado: 2+)`);
                    results.data.failed++;
                }
            }
        } else {
            console.log(`❌ No hay encuestas activas`);
            results.data.failed++;
        }

        // Verificar municipios
        const municipiosRes = await fetch(`${API_URL}/data/municipios`);
        if (municipiosRes.ok) {
            const municipios = await municipiosRes.json();
            if (municipios.length >= 80) {
                console.log(`✅ Municipios: ${municipios.length}`);
                results.data.passed++;
            } else {
                console.log(`⚠️  Municipios: Solo ${municipios.length} (esperado: 81-85)`);
                results.data.failed++;
            }
        }

    } catch (error) {
        console.log(`❌ Error verificando datos: ${error.message}`);
        results.data.failed++;
    }

    // ==================== RESUMEN ====================
    console.log('\n' + '═'.repeat(80));
    console.log('📋 RESUMEN DE VERIFICACIÓN\n');
    
    console.log(`Backend:  ✅ ${results.backend.passed} / ❌ ${results.backend.failed}`);
    console.log(`Datos:    ✅ ${results.data.passed} / ❌ ${results.data.failed}`);
    
    const totalPassed = results.backend.passed + results.data.passed;
    const totalFailed = results.backend.failed + results.data.failed;
    
    console.log(`\nTOTAL:    ✅ ${totalPassed} / ❌ ${totalFailed}`);
    
    if (totalFailed === 0) {
        console.log('\n🎉 SISTEMA 100% OPERATIVO - Listo para deployment');
    } else {
        console.log('\n⚠️  HAY PROBLEMAS QUE RESOLVER');
    }
    
    console.log('═'.repeat(80));
}

verifySystem().catch(console.error);