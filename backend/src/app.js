const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const logger = require('./utils/logger');

const app = express();

// Безопасность
app.use(helmet({
  contentSecurityPolicy: false // Отключаем CSP для начального этапа
}));

// CORS настройки
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3001',
  credentials: true
}));

// Rate limiting (простой для начального этапа)
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 минут
  max: 100, // лимит запросов с IP
  message: {
    error: 'Too many requests from this IP, please try again later'
  }
});
app.use('/api/', limiter);

// Middleware для парсинга JSON
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Логирование запросов
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path} - ${req.ip}`);
  next();
});

// Health check endpoint
app.get('/api/health', async (req, res) => {
  try {
    const db = require('./database/connection');
    const mqttClient = require('./mqtt/client');
    
    // Проверяем подключение к базе данных
    let dbStatus = 'disconnected';
    try {
      await db.query('SELECT 1');
      dbStatus = 'connected';
    } catch (error) {
      logger.error('Database health check failed:', error.message);
    }
    
    // Проверяем MQTT подключение
    const mqttStatus = mqttClient && mqttClient.connected ? 'connected' : 'disconnected';
    
    const health = {
      status: 'ok',
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || '0.1.0',
      database: dbStatus,
      mqtt: mqttStatus,
      uptime: process.uptime()
    };
    
    res.json(health);
  } catch (error) {
    logger.error('Health check error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Health check failed'
    });
  }
});

// API маршруты
app.use('/api/auth', require('./api/auth'));
app.use('/api/tractors', require('./api/tractors'));
app.use('/api/telemetry', require('./api/telemetry'));

// 404 обработчик
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Route not found',
    path: req.originalUrl
  });
});

// Глобальный обработчик ошибок
app.use((error, req, res, next) => {
  logger.error('Application error:', error);
  
  // Не отправляем стек ошибок в продакшене
  const isDevelopment = process.env.NODE_ENV !== 'production';
  
  res.status(error.status || 500).json({
    error: error.message || 'Internal server error',
    ...(isDevelopment && { stack: error.stack })
  });
});

module.exports = app;