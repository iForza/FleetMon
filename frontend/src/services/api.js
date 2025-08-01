import axios from 'axios';
import Cookies from 'js-cookie';

const API_BASE_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:3000';

export const api = axios.create({
  baseURL: `${API_BASE_URL}/api`,
  timeout: 10000,
});

// Добавляем токен к каждому запросу
api.interceptors.request.use(
  (config) => {
    const token = Cookies.get('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Обрабатываем ответы и ошибки
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Токен недействителен, удаляем его
      Cookies.remove('token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// API методы для работы с тракторами
export const tractorApi = {
  getAll: () => api.get('/tractors'),
  getById: (id) => api.get(`/tractors/${id}`),
  create: (data) => api.post('/tractors', data),
  getStats: (id, days = 7) => api.get(`/tractors/${id}/stats?days=${days}`),
  getOverview: () => api.get('/tractors/overview/dashboard'),
};

// API методы для работы с телеметрией
export const telemetryApi = {
  getLatest: (tractorId, limit = 1) => api.get(`/telemetry/${tractorId}/latest?limit=${limit}`),
  getHistory: (tractorId, startTime, endTime, interval = '5 minutes') => 
    api.get(`/telemetry/${tractorId}/history?start_time=${startTime}&end_time=${endTime}&interval=${interval}`),
  getLocationHistory: (tractorId, startTime, endTime, limit = 1000) =>
    api.get(`/telemetry/${tractorId}/location-history?start_time=${startTime}&end_time=${endTime}&limit=${limit}`),
  getQuickPeriod: (tractorId, period) => api.get(`/telemetry/${tractorId}/quick/${period}`),
};

// API методы для аутентификации
export const authApi = {
  login: (email, password) => api.post('/auth/login', { email, password }),
  register: (userData) => api.post('/auth/register', userData),
  logout: () => api.post('/auth/logout'),
  getProfile: () => api.get('/auth/me'),
  updateProfile: (data) => api.put('/auth/profile', data),
  verify: () => api.get('/auth/verify'),
};

export default api;