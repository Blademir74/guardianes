// public/js/portal.js
const API_BASE = 'https://pulsoguerrero.vercel.app/api';

// Función para hacer peticiones autenticadas a la API
async function apiCall(endpoint, options = {}) {
    const token = localStorage.getItem('guardianes_token');
    const defaultOptions = {
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        }
    };
    const finalOptions = { ...defaultOptions, ...options };

    const response = await fetch(`${API_BASE}${endpoint}`, finalOptions);

    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Error en la petición');
    }

    return response.json();
}

// Carga y muestra las encuestas activas
async function loadSurveys() {
    const container = document.getElementById('surveys-container');
    container.innerHTML = '<p>Cargando encuestas...</p>';

    try {
        // Nota: Usamos el endpoint público para ver las encuestas activas
        const surveys = await apiCall('/public/surveys'); 
        container.innerHTML = ''; // Limpiar mensaje de carga

        if (surveys.length === 0) {
            container.innerHTML = '<p>No hay encuestas activas en este momento.</p>';
            return;
        }

        surveys.forEach(survey => {
            const surveyEl = document.createElement('div');
            surveyEl.className = 'survey-card';
            surveyEl.innerHTML = `
                <h4>${survey.title}</h4>
                <p>${survey.description || ''}</p>
                <div class="options-container" id="options-${survey.id}">
                    <p>Cargando opciones...</p>
                </div>
            `;
            container.appendChild(surveyEl);
            loadSurveyOptions(survey.id);
        });

    } catch (error) {
        container.innerHTML = `<p>Error al cargar las encuestas: ${error.message}</p>`;
        console.error('Load Surveys Error:', error);
    }
}

// Carga las opciones de una encuesta específica
async function loadSurveyOptions(surveyId) {
    const optionsContainer = document.getElementById(`options-${surveyId}`);
    
    try {
        // Asumimos que el endpoint público ya incluye las opciones
        const surveys = await apiCall('/public/surveys');
        const currentSurvey = surveys.find(s => s.id === surveyId);

        if (!currentSurvey || !currentSurvey.options) {
            optionsContainer.innerHTML = '<p>No se encontraron opciones para esta encuesta.</p>';
            return;
        }

        optionsContainer.innerHTML = ''; // Limpiar
        
        currentSurvey.options.forEach(option => {
            const optionLabel = document.createElement('label');
            optionLabel.className = 'option-label';
            optionLabel.innerHTML = `
                <input type="radio" name="survey-${surveyId}" value="${option.id}">
                <span>${option.text}</span>
            `;
            optionsContainer.appendChild(optionLabel);
        });

        const voteButton = document.createElement('button');
        voteButton.textContent = 'Enviar Voto';
        voteButton.className = 'vote-button';
        voteButton.onclick = () => submitVote(surveyId);
        optionsContainer.appendChild(voteButton);

    } catch (error) {
        optionsContainer.innerHTML = `<p>Error al cargar opciones: ${error.message}</p>`;
    }
}

// Envía el voto de un usuario a una encuesta
async function submitVote(surveyId) {
    const selectedOption = document.querySelector(`input[name="survey-${surveyId}"]:checked`);

    if (!selectedOption) {
        alert('Por favor, selecciona una opción antes de votar.');
        return;
    }

    const optionId = selectedOption.value;
    const voteButton = document.querySelector(`#options-${surveyId} .vote-button`);
    voteButton.disabled = true;
    voteButton.textContent = 'Enviando...';

    try {
        // IMPORTANTE: Ajusta este endpoint al que realmente tengas en tu backend
        const response = await apiCall('/surveys/vote', { 
            method: 'POST',
            body: JSON.stringify({ surveyId, optionId })
        });

        alert('¡Voto registrado con éxito! Gracias por participar.');
        // Opcional: Deshabilitar la encuesta para que no vote de nuevo
        document.querySelector(`#options-${surveyId}`).style.opacity = '0.6';
        document.querySelector(`#options-${surveyId}`).style.pointerEvents = 'none';

    } catch (error) {
        alert(`Error al enviar tu voto: ${error.message}`);
        voteButton.disabled = false;
        voteButton.textContent = 'Enviar Voto';
        console.error('Submit Vote Error:', error);
    }
}