// public/js/auth.js
const API_BASE = 'https://pulsoguerrero.vercel.app/api';

// Guarda el token en localStorage
function setAuthToken(token) {
    localStorage.setItem('guardianes_token', token);
}

// Obtiene el token guardado
function getAuthToken() {
    return localStorage.getItem('guardianes_token');
}

// Limpia la sesión
function logout() {
    localStorage.removeItem('guardianes_token');
    showAuthView();
}

// Muestra la vista de autenticación (login)
function showAuthView() {
    const app = document.getElementById('app');
    app.innerHTML = `
        <div class="auth-form">
            <h2>Regístra tu Voz</h2>
            <p>Ingresa tu número de teléfono para recibir un código de verificación. Tu número nunca será almacenado.</p>
            <form id="requestCodeForm">
                <input type="tel" id="phone" placeholder="Número a 10 dígitos" pattern="[0-9]{10}" required>
                <button type="submit">Solicitar Código</button>
            </form>
            <form id="verifyCodeForm" style="display:none;">
                <p>Te enviamos un código de 6 dígitos.</p>
                <input type="text" id="code" placeholder="Código de verificación" maxlength="6" required>
                <button type="submit">Verificar y Entrar</button>
            </form>
            <div id="auth-message"></div>
        </div>
    `;
    attachAuthListeners();
}

// Muestra la vista principal del portal (ya autenticado)
function showPortalView() {
    const app = document.getElementById('app');
    app.innerHTML = `
        <div class="portal-header">
            <h2>Bienvenido, Guardián</h2>
            <button id="logout-btn">Salir</button>
        </div>
        <div id="surveys-container">
            <h3>Encuestas Activas</h3>
            <p>Cargando encuestas...</p>
        </div>
    `;
    document.getElementById('logout-btn').addEventListener('click', logout);
    loadSurveys(); // Cargar las encuestas disponibles
}

// Asigna los eventos a los formularios de auth
function attachAuthListeners() {
    const requestCodeForm = document.getElementById('requestCodeForm');
    const verifyCodeForm = document.getElementById('verifyCodeForm');

    requestCodeForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const phone = document.getElementById('phone').value;
        const messageEl = document.getElementById('auth-message');
        
        try {
            const response = await fetch(`${API_BASE}/auth/request-code`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phone })
            });
            const data = await response.json();

            if (response.ok) {
                messageEl.textContent = `Código enviado. Revisa tu teléfono (o la consola para desarrollo). Código: ${data.debug_otp}`;
                requestCodeForm.style.display = 'none';
                verifyCodeForm.style.display = 'block';
            } else {
                messageEl.textContent = `Error: ${data.error}`;
            }
        } catch (error) {
            messageEl.textContent = 'Error de conexión. Intenta de nuevo.';
            console.error('Request Code Error:', error);
        }
    });

    verifyCodeForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const phone = document.getElementById('phone').value;
        const code = document.getElementById('code').value;
        const messageEl = document.getElementById('auth-message');

        try {
            const response = await fetch(`${API_BASE}/auth/verify-code`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phone, code })
            });
            const data = await response.json();

            if (response.ok) {
                setAuthToken(data.token);
                showPortalView(); // ¡Éxito! Mostrar el portal
            } else {
                messageEl.textContent = `Error: ${data.error}`;
            }
        } catch (error) {
            messageEl.textContent = 'Error de conexión. Intenta de nuevo.';
            console.error('Verify Code Error:', error);
        }
    });
}

// Inicialización: ¿El usuario ya tiene una sesión?
document.addEventListener('DOMContentLoaded', () => {
    if (getAuthToken()) {
        showPortalView();
    } else {
        showAuthView();
    }
});