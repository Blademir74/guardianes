// public/js/auth-handler.js
// Manejo de autenticación para Guardianes
// ========================================

class AuthHandler {
  constructor() {
    this.accessToken = localStorage.getItem('accessToken');
    this.refreshToken = localStorage.getItem('refreshToken');
    this.user = null;
    this.refreshTimer = null;
  }
  
  /**
   * Solicitar código OTP
   */
  async requestOTP(phone) {
    try {
      const response = await fetch('/api/auth/request-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone })
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Error solicitando código');
      }
      
      return data;
    } catch (error) {
      console.error('Error requesting OTP:', error);
      throw error;
    }
  }
  
  /**
   * Verificar código OTP
   */
  async verifyOTP(phone, code) {
    try {
      const response = await fetch('/api/auth/verify-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, code })
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Error verificando código');
      }
      
      // Guardar tokens
      this.accessToken = data.accessToken;
      this.refreshToken = data.refreshToken;
      this.user = data.user;
      
      localStorage.setItem('accessToken', this.accessToken);
      localStorage.setItem('refreshToken', this.refreshToken);
      localStorage.setItem('user', JSON.stringify(this.user));
      
      // Programar refresh automático
      this.scheduleTokenRefresh();
      
      return data;
    } catch (error) {
      console.error('Error verifying OTP:', error);
      throw error;
    }
  }
  
  /**
   * Obtener headers con autenticación
   */
  getAuthHeaders() {
    const headers = {
      'Content-Type': 'application/json'
    };
    
    if (this.accessToken) {
      headers['Authorization'] = `Bearer ${this.accessToken}`;
    }
    
    return headers;
  }
  
  /**
   * Hacer request autenticado
   */
  async authenticatedFetch(url, options = {}) {
    options.headers = {
      ...options.headers,
      ...this.getAuthHeaders()
    };
    
    let response = await fetch(url, options);
    
    // Si el token expiró, intentar refresh
    if (response.status === 401) {
      const refreshed = await this.refreshAccessToken();
      if (refreshed) {
        options.headers['Authorization'] = `Bearer ${this.accessToken}`;
        response = await fetch(url, options);
      }
    }
    
    return response;
  }
  
  /**
   * Renovar access token
   */
  async refreshAccessToken() {
    if (!this.refreshToken) {
      return false;
    }
    
    try {
      const response = await fetch('/api/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: this.refreshToken })
      });
      
      if (!response.ok) {
        throw new Error('Failed to refresh token');
      }
      
      const data = await response.json();
      this.accessToken = data.accessToken;
      localStorage.setItem('accessToken', this.accessToken);
      
      this.scheduleTokenRefresh();
      return true;
      
    } catch (error) {
      console.error('Error refreshing token:', error);
      this.logout();
      return false;
    }
  }
  
  /**
   * Programar renovación automática
   */
  scheduleTokenRefresh() {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
    }
    
    // Renovar 5 minutos antes de expirar (55 minutos)
    this.refreshTimer = setTimeout(() => {
      this.refreshAccessToken();
    }, 55 * 60 * 1000);
  }
  
  /**
   * Verificar si hay sesión activa
   */
  async checkSession() {
    if (!this.accessToken) {
      return false;
    }
    
    try {
      const response = await this.authenticatedFetch('/api/auth/me');
      
      if (response.ok) {
        this.user = await response.json();
        return true;
      }
      
      return false;
    } catch (error) {
      return false;
    }
  }
  
  /**
   * Cerrar sesión
   */
  async logout() {
    try {
      if (this.accessToken) {
        await fetch('/api/auth/logout', {
          method: 'POST',
          headers: this.getAuthHeaders()
        });
      }
    } catch (error) {
      console.error('Error during logout:', error);
    }
    
    // Limpiar todo
    this.accessToken = null;
    this.refreshToken = null;
    this.user = null;
    
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('user');
    
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
    }
  }
}

// Inicializar handler global
window.authHandler = new AuthHandler();