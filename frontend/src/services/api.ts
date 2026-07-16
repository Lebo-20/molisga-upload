import axios from 'axios';

const api = axios.create({
  // In production: uses VITE_API_URL (https://api.molisgemilang.my.id)
  // In dev: empty string so Vite proxy routes /api → localhost:5000
  baseURL: import.meta.env.VITE_API_URL || '',
  timeout: 60000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Interceptor to attach Authorization header
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('molis_jwt_token');
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Interceptor to handle global API errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401) {
      // Clear token and redirect to login if session expires
      localStorage.removeItem('molis_jwt_token');
      localStorage.removeItem('molis_user');
      window.dispatchEvent(new Event('auth-logout'));
    }
    
    const message = error.response?.data?.error || error.message || 'Terjadi kesalahan sistem';
    return Promise.reject(new Error(message));
  }
);

export default api;
