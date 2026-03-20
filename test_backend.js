const http = require('http');

const surveyId = 1; // Ajustar si es necesario
const url = `http://localhost:3000/api/surveys/${surveyId}/results`;

console.log(`🔍 Probando API de resultados: ${url}`);

http.get(url, (res) => {
    let data = '';
    res.on('data', (chunk) => { data += chunk; });
    res.on('end', () => {
        try {
            const json = JSON.parse(data);
            console.log('✅ Respuesta recibida:');
            console.log(JSON.stringify(json, null, 2));
            
            if (json.success && Array.isArray(json.results)) {
                console.log('✨ FORMATO CORRECTO ✨');
            } else {
                console.error('❌ FORMATO INCORRECTO');
            }
        } catch (e) {
            console.error('❌ Error parseando JSON:', e.message);
            console.log('Respuesta bruta:', data);
        }
    });
}).on('error', (err) => {
    console.error('❌ Error de conexión:', err.message);
});
