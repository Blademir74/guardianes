// test-system.js - Script de validación completa del sistema
const https = require('https');
const http = require('http');

class SystemValidator {
    constructor(baseURL = 'http://localhost:3000') {
        this.baseURL = baseURL;
        this.tests = [];
        this.results = {};
    }
    
    // Función helper para hacer peticiones HTTP desde Node.js
    async fetch(endpoint, options = {}) {
        return new Promise((resolve, reject) => {
            const url = new URL(endpoint, this.baseURL);
            const protocol = url.protocol === 'https:' ? https : http;
            
            const reqOptions = {
                method: options.method || 'GET',
                headers: options.headers || {}
            };
            
            const req = protocol.request(url, reqOptions, (res) => {
                let data = '';
                
                res.on('data', (chunk) => {
                    data += chunk;
                });
                
                res.on('end', () => {
                    resolve({
                        ok: res.statusCode >= 200 && res.statusCode < 300,
                        status: res.statusCode,
                        json: async () => JSON.parse(data),
                        text: async () => data
                    });
                });
            });
            
            req.on('error', reject);
            
            if (options.body) {
                req.write(options.body);
            }
            
            req.end();
        });
    }
    
    async runAllTests() {
        console.log('🔍 INICIANDO VALIDACIÓN COMPLETA DEL SISTEMA GUARDIANES');
        console.log('================================================\n');
        
        // Test 1: Base de datos
        await this.testDatabase();
        
        // Test 2: APIs
        await this.testAPIs();
        
        // Test 3: Autenticación
        await this.testAuthentication();
        
        // Test 4: Predicciones
        await this.testPredictions();
        
        // Test 5: Admin
        await this.testAdmin();
        
        // Test 6: Sincronización
        await this.testSynchronization();
        
        // Mostrar resultados
        this.showResults();
    }
    
    async testDatabase() {
        console.log('📊 TEST 1: BASE DE DATOS');
        
        try {
            const health = await this.fetch('/api/health');
            const data = await health.json();
            
            if (data.status === 'ok') {
                this.results.database = '✅ Conexión OK';
                console.log('✅ Base de datos conectada');
            } else {
                throw new Error('Database not healthy');
            }
        } catch (error) {
            this.results.database = '❌ Error de conexión';
            console.error('❌ Error BD:', error.message);
        }
    }
    
    async testAPIs() {
        console.log('\n🔌 TEST 2: APIs');
        
        const endpoints = [
            '/api/data/municipalities',
            '/api/data/candidates/18',
            '/api/predictions/municipalities/18',
            '/api/historical/years',
            '/api/surveys/active'
        ];
        
        for (const endpoint of endpoints) {
            try {
                const response = await this.fetch(endpoint);
                if (response.ok) {
                    console.log(`✅ ${endpoint} - OK`);
                    this.results[endpoint] = '✅';
                } else {
                    console.error(`❌ ${endpoint} - Error ${response.status}`);
                    this.results[endpoint] = `❌ ${response.status}`;
                }
            } catch (error) {
                console.error(`❌ ${endpoint} - Error: ${error.message}`);
                this.results[endpoint] = '❌ Network Error';
            }
        }
    }
    
    async testAuthentication() {
        console.log('\n🔐 TEST 3: AUTENTICACIÓN');
        
        // Test auth normal
        try {
            const response = await this.fetch('/api/auth/request-code', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phone: '7471234567' })
            });
            
            if (response.ok) {
                console.log('✅ Sistema de OTP funcionando');
                this.results.auth = '✅ OTP Ready';
            } else {
                throw new Error('OTP system error');
            }
        } catch (error) {
            console.error('❌ Error en autenticación:', error.message);
            this.results.auth = '❌ Auth Error';
        }
    }
    
    async testPredictions() {
        console.log('\n📈 TEST 4: PREDICCIONES');
        
        try {
            // Simular predicción
            const testPrediction = {
                municipalityId: 18,
                candidateId: 'candidato_21',
                confidence: 75
            };
            
            const headers = {
                'Content-Type': 'application/json',
                'X-Dev-Mode': 'true',
                'Authorization': 'Bearer dev_token'
            };
            
            const response = await this.fetch('/api/predictions', {
                method: 'POST',
                headers: headers,
                body: JSON.stringify(testPrediction)
            });
            
            if (response.ok) {
                console.log('✅ Sistema de predicciones funcionando');
                this.results.predictions = '✅ Ready';
            } else {
                const error = await response.json();
                console.error('❌ Error en predicción:', error);
                this.results.predictions = `❌ ${error.error}`;
            }
        } catch (error) {
            console.error('❌ Error:', error.message);
            this.results.predictions = '❌ Network Error';
        }
    }
    
    async testAdmin() {
        console.log('\n👨‍💼 TEST 5: PANEL ADMIN');
        
        try {
            // Verificar si admin.html existe
            const response = await this.fetch('/admin');
            if (response.ok) {
                console.log('✅ Panel admin accesible');
                this.results.admin = '✅ Accessible';
            } else {
                throw new Error('Admin panel not found');
            }
        } catch (error) {
            console.error('❌ Error accediendo admin:', error.message);
            this.results.admin = '❌ Not Found';
        }
    }
    
    async testSynchronization() {
        console.log('\n🔄 TEST 6: SINCRONIZACIÓN');
        
        try {
            // Test sincronización de datos
            const surveys = await this.fetch('/api/surveys').then(r => r.json());
            const candidates = await this.fetch('/api/data/candidates/18').then(r => r.json());
            const predictions = await this.fetch('/api/predictions/stats/18').then(r => r.json());
            
            console.log(`✅ Encuestas: ${surveys.length || 0}`);
            console.log(`✅ Candidatos: ${candidates.length || 0}`);
            console.log(`✅ Predicciones: ${predictions.totalVoters || 0}`);
            
            this.results.sync = '✅ Sincronizado';
            
        } catch (error) {
            console.error('❌ Error de sincronización:', error.message);
            this.results.sync = '❌ Sync Error';
        }
    }
    
    showResults() {
        console.log('\n================================================');
        console.log('📋 RESUMEN DE VALIDACIÓN');
        console.log('================================================');
        
        let allPassed = true;
        
        for (const [key, value] of Object.entries(this.results)) {
            console.log(`${key}: ${value}`);
            if (value.includes('❌')) {
                allPassed = false;
            }
        }
        
        console.log('================================================');
        
        if (allPassed) {
            console.log('✅ ¡SISTEMA LISTO PARA PRODUCCIÓN!');
        } else {
            console.log('⚠️ HAY PROBLEMAS QUE RESOLVER');
        }
    }
}

// Ejecutar validación
(async () => {
    // Cambia la URL si tu servidor está en otro puerto o dominio
    const baseURL = process.env.BASE_URL || 'http://localhost:3000';
    
    console.log(`🌐 Conectando a: ${baseURL}\n`);
    
    const validator = new SystemValidator(baseURL);
    await validator.runAllTests();
    
    console.log('\n✅ Validación completada\n');
})();