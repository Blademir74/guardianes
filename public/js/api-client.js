// api-client.js - Centralizado para todas las interfaces
// ========================================
// CONFIGURACIÓN
// ========================================
const API_BASE = '/api';

// ========================================
// INTERCEPTOR DE PETICIONES
// ========================================
async function fetchWithAuth(url, options = {}) {
    const token = localStorage.getItem('authToken') || localStorage.getItem('adminToken');
    if (token) {
        options.headers = {
            ...options.headers,
            'Authorization': `Bearer ${token}`
        };
    }
    
    try {
        const response = await fetch(`${API_BASE}${url}`, options);
        
        if (response.status === 401) {
            // Token expirado o inválido
            localStorage.removeItem('authToken');
            localStorage.removeItem('adminToken');
            throw new Error('Sesión expirada. Por favor, inicia sesión nuevamente.');
        }
        
        return response;
    } catch (error) {
        console.error('API Error:', error);
        
        // Notificación global de error
        showGlobalAlert('Error de conexión. Por favor, verifica tu internet.');
        throw error;
    }
}

// ========================================
// FUNCIONES REUTILIZABLES POR SECCIÓN
// ========================================

// --- SECCIÓN: AUTENTICACIÓN ---
export const authAPI = {
    // Usuario portal ciudadano
    login: async (phone) => {
        const res = await fetch('/auth/request-code', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone })
        });
        return res.json();
    },
    
    verify: async (phone, code) => {
        const res = await fetch('/auth/verify-code', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone, code })
        });
        return res.json();
    },
    
    // Admin
    adminLogin: async (username, password) => {
        const res = await fetch('/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password, isAdmin: true })
        });
        return res.json();
    },
    
    me: async () => {
        const res = await fetchWithAuth('/auth/me');
        return res.json();
    }
};

// --- SECCIÓN: ENCUENTAS ---
export const surveyAPI = {
    // Obtener encuestas activas
    getActive: async () => {
        const res = await fetch('/surveys/active');
        return res.json();
    },
    
    // Obtener una encuesta específica
    getOne: async (id) => {
        const res = await fetch(`/surveys/${id}`);
        return res.json();
    },
    
    // Obtener preguntas de una encuesta
    getQuestions: async (id) => {
        const res = await fetch(`/surveys/${id}/questions`);
        return res.json();
    },
    
    // Enviar respuesta
    submitResponse: async (surveyId, responses) => {
        const res = await fetchWithAuth(`/surveys/${surveyId}/response`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ responses })
        });
        return res.json();
    },
    
    // Resultados en vivo
    liveResults: async () => {
        const res = await fetch('/surveys/live-results');
        return res.json();
    }
};

// --- SECCIÓN: INCIDENTES ---
export const incidentAPI = {
    // Reportar incidente
    report: async (data) => {
        const res = await fetchWithAuth('/incidents', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        return res.json();
    },
    
    // Obtener incidentes
    getAll: async (limit = 50) => {
        const res = await fetchWithAuth(`/incidents?limit=${limit}`);
        return res.json();
    },
    
    // Marcar como verificado (admin)
    verify: async (id) => {
        const res = await fetchWithAuth(`/incidents/${id}/verify`, {
            method: 'POST'
        });
        return res.json();
    },
    
    // Rechazar incidente (admin)
    reject: async (id) => {
        const res = await fetchWithAuth(`/incidents/${id}/reject`, {
            method: 'POST'
        });
        return res.json();
    }
};

// --- SECCIÓN: HISTÓRICOS ---
export const historicalAPI = {
    // Obtener datos históricos (con filtro opcional por municipio)
    getData: async (municipality = null) => {
        const url = municipality 
            ? `/data/historical?municipality=${encodeURIComponent(municipality)}`
            : '/data/historical';
        const res = await fetchWithAuth(url);
        return res.json();
    },
    
    // Obtener estadísticas globales
    getStats: async () => {
        const res = await fetch('/data/stats');
        return res.json();
    }
};

// --- SECCIÓN: PREDICCIONES ---
export const predictionAPI = {
    // Guardar predicción de usuario
    save: async (data) => {
        const res = await fetchWithAuth('/predictions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        return res.json();
    },
    
    // Obtener predicciones comunitarias (agregadas)
    getCommunity: async () => {
        const res = await fetchWithAuth('/predictions/community');
        return res.json();
    },
    
    // Obtener predicciones por municipio
    getByMunicipality: async (municipality) => {
        const res = await fetchWithAuth(`/predictions/municipality/${encodeURIComponent(municipality)}`);
        return res.json();
    },
    
    // Comparar con histórico
    compareWithHistorical: async (municipality, candidateId) => {
        const res = await fetchWithAuth(`/predictions/compare/${encodeURIComponent(municipality)}?candidateId=${candidateId}`);
        return res.json();
    }
};

// --- SECCIÓN: ADMIN ---
export const adminAPI = {
    // Dashboard stats
    getStats: async () => {
        const res = await fetchWithAuth('/admin/stats');
        return res.json();
    },
    
    // Encuestas
    createSurvey: async (surveyData) => {
        const res = await fetchWithAuth('/admin/surveys', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(surveyData)
        });
        return res.json();
    },
    
    toggleSurvey: async (id) => {
        const res = await fetchWithAuth(`/admin/surveys/${id}/toggle`, {
            method: 'POST'
        });
        return res.json();
    },
    
    deleteSurvey: async (id) => {
        const res = await fetchWithAuth(`/admin/surveys/${id}`, {
            method: 'DELETE'
        });
        return res.json();
    },
    
    // Usuarios
    getUsers: async () => {
        const res = await fetchWithAuth('/admin/users');
        return res.json();
    },
    
    // Incidencias (admin)
    getIncidents: async (limit = 100) => {
        const res = await fetchWithAuth(`/incidents?limit=${limit}`);
        return res.json();
    }
};

// ========================================
// UTILIDADES DE UI
// ========================================
function showGlobalAlert(message, type = 'error') {
    // Crear o mostrar alerta global
    let alertContainer = document.getElementById('global-alert');
    if (!alertContainer) {
        alertContainer = document.createElement('div');
        alertContainer.id = 'global-alert';
        alertContainer.className = 'fixed top-20 left-1/2 transform -translate-x-1/2 z-50 px-6 py-4 rounded-lg shadow-xl max-w-md text-center';
        document.body.appendChild(alertContainer);
    }
    
    const bgColor = type === 'error' ? 'bg-red-600' : 'bg-green-600';
    alertContainer.className = `fixed top-20 left-1/2 transform -translate-x-1/2 z-50 px-6 py-4 rounded-lg shadow-xl max-w-md text-center ${bgColor} text-white`;
    alertContainer.textContent = message;
    alertContainer.style.display = 'block';
    
    setTimeout(() => {
        alertContainer.style.display = 'none';
    }, 4000);
}

// ========================================
// EJEMPLO DE USO
// ========================================
/*
// Ejemplo 1: Login de usuario
const loginResponse = await authAPI.login('7441234567');
if (loginResponse.success) {
    console.log('Código enviado');
}

// Ejemplo 2: Cargar encuestas
const surveys = await surveyAPI.getActive();
surveys.forEach(s => {
    console.log(`Encuesta: ${s.title}`);
});

// Ejemplo 3: Enviar voto
const voteResponse = await surveyAPI.submitResponse(1, {
    responses: [
        { questionId: 1, answer: 'Félix Salgado Macedonio', confidence: 75 },
        { questionId: 2, answer: '75%', confidence: 75 }
    ]
});
if (voteResponse.success) {
    showGlobalAlert('✅ ¡Voto registrado!', 'success');
}
*/

// ========================================
// EXPORTACIONES
// ========================================
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        authAPI,
        surveyAPI,
        incidentAPI,
        historicalAPI,
        predictionAPI,
        adminAPI,
        fetchWithAuth,
        showGlobalAlert
    };
}