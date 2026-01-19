// public/js/auth.js
const API_BASE = 'https://pulsoguerrero.vercel.app/api';

function setAuthToken(token) { localStorage.setItem('guardianes_token', token); }
function getAuthToken() { return localStorage.getItem('guardianes_token'); }
function logout() { localStorage.removeItem('guardianes_token'); showAuthView(); }

function showAuthView() {
    const app = document.getElementById('app');
    app.innerHTML = `
        <div class="max-w-md mx-auto bg-white p-8 rounded-lg shadow-lg">
            <h2 class="text-3xl font-bold text-center mb-6 text-guardian-blue">Regístra tu Voz</h2>
            <form id="requestCodeForm" class="space-y-6">
                <div>
                    <label for="phone" class="block text-sm font-medium text-gray-700">Número a 10 dígitos</label>
                    <input type="tel" id="phone" name="phone" required pattern="[0-9]{10}" class="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-guardian-blue focus:border-guardian-blue">
                </div>
                <button type="submit" class="w-full bg-guardian-blue text-white font-bold py-3 px-4 rounded-md hover:bg-blue-700">Solicitar Código</button>
            </form>
            <form id="verifyCodeForm" class="space-y-6 mt-6" style="display:none;">
                <p class="text-sm text-gray-600">Te enviamos un código de 6 dígitos.</p>
                <input type="text" id="code" name="code" required maxlength="6" class="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-guardian-blue focus:border-guardian-blue">
                <button type="submit" class="w-full bg-emerald-accent text-white font-bold py-3 px-4 rounded-md hover:bg-green-600">Verificar y Entrar</button>
            </form>
            <div id="auth-message" class="mt-4 text-center text-red-600"></div>
        </div>
    `;
    attachAuthListeners();
}

function showPortalView() {
    const app = document.getElementById('app');
    app.innerHTML = `
        <header class="flex justify-between items-center mb-8">
            <h1 class="text-3xl font-black text-guardian-blue">Portal Guardianes</h1>
            <button id="logout-btn" class="text-sm bg-red-500 text-white px-4 py-2 rounded hover:bg-red-600">Salir</button>
        </header>
        <main id="surveys-container">
            <p class="text-center text-gray-500">Cargando encuestas...</p>
        </main>
    `;
    document.getElementById('logout-btn').addEventListener('click', logout);
    loadSurveys();
}

function attachAuthListeners() { /* ... (La lógica de fetch para request-code y verify-code va aquí, similar a la versión anterior) ... */ }

document.addEventListener('DOMContentLoaded', () => {
    if (getAuthToken()) showPortalView();
    else showAuthView();
});