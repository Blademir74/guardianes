// verificar-sistema.js
// Script para verificar que todo el sistema funcione correctamente

const BASE_URL = process.argv[2] || 'https://pulsoguerrero.vercel.app';

console.log('🔍 VERIFICANDO SISTEMA GUARDIANES GUERRERO');
console.log('Base URL:', BASE_URL);
console.log('═'.repeat(80));

const tests = {
  backend: [],
  data: []
};

async function testEndpoint(name, url, options = {}) {
  try {
    const response = await fetch(`${BASE_URL}${url}`, options);
    const success = response.ok;
    
    tests.backend.push({ name, success, status: response.status });
    
    console.log(success ? '✅' : '❌', name, `(${response.status})`);
    
    if (success && options.showData) {
      const data = await response.json();
      console.log('   📊 Data:', JSON.stringify(data, null, 2).substring(0, 200));
    }
    
    return success;
  } catch (error) {
    tests.backend.push({ name, success: false, error: error.message });
    console.log('❌', name, '-', error.message);
    return false;
  }
}

async function runTests() {
  console.log('\n📡 VERIFICANDO BACKEND...');
  
  await testEndpoint('Health Check', '/api/health', { showData: true });
  await testEndpoint('Municipios', '/api/data/municipalities');
  await testEndpoint('Stats Públicos', '/api/data/stats', { showData: true });
  await testEndpoint('Encuestas Activas', '/api/surveys/active');
  await testEndpoint('Candidatos', '/api/candidates');
  
  console.log('\n📊 VERIFICANDO DATOS...');
  
  // Verificar municipios
  try {
    const response = await fetch(`${BASE_URL}/api/data/municipalities`);
    const data = await response.json();
    tests.data.push({
      name: 'Municipios',
      success: true,
      count: data.length
    });
    console.log('✅ Municipios:', data.length, 'encontrados');
  } catch (error) {
    tests.data.push({ name: 'Municipios', success: false });
    console.log('❌ Error al cargar municipios');
  }

  // Verificar candidatos
  try {
    const response = await fetch(`${BASE_URL}/api/candidates`);
    const data = await response.json();
    tests.data.push({
      name: 'Candidatos',
      success: true,
      count: data.length
    });
    console.log('✅ Candidatos:', data.length, 'encontrados');
  } catch (error) {
    tests.data.push({ name: 'Candidatos', success: false });
    console.log('❌ Error al cargar candidatos');
  }

  // Verificar encuestas
  try {
    const response = await fetch(`${BASE_URL}/api/surveys/active`);
    const data = await response.json();
    tests.data.push({
      name: 'Encuestas Activas',
      success: true,
      count: data.length
    });
    console.log('✅ Encuestas Activas:', data.length);
  } catch (error) {
    tests.data.push({ name: 'Encuestas Activas', success: false });
    console.log('❌ Error al cargar encuestas');
  }

  console.log('\n' + '═'.repeat(80));
  console.log('📋 RESUMEN DE VERIFICACIÓN');
  
  const backendSuccess = tests.backend.filter(t => t.success).length;
  const backendTotal = tests.backend.length;
  const dataSuccess = tests.data.filter(t => t.success).length;
  const dataTotal = tests.data.length;
  
  console.log(`Backend:  ✅ ${backendSuccess} / ❌ ${backendTotal - backendSuccess}`);
  console.log(`Datos:    ✅ ${dataSuccess} / ❌ ${dataTotal - dataSuccess}`);
  console.log(`TOTAL:    ✅ ${backendSuccess + dataSuccess} / ❌ ${(backendTotal + dataTotal) - (backendSuccess + dataSuccess)}`);
  
  const allSuccess = (backendSuccess === backendTotal) && (dataSuccess === dataTotal);
  
  if (allSuccess) {
    console.log('\n🎉 SISTEMA 100% OPERATIVO - Listo para deployment');
  } else {
    console.log('\n⚠️  SISTEMA CON ERRORES - Revisar logs arriba');
  }
}

runTests().catch(console.error);