const http = require('http');
const app = require('./app');
const socketIO = require('socket.io');
const mqttClient = require('./mqtt/client');
const logger = require('./utils/logger');

// Загружаем переменные окружения
require('dotenv').config();

const PORT = process.env.PORT || 3000;

// Создаем HTTP сервер
const server = http.createServer(app);

// Настраиваем Socket.IO для real-time связи
const io = socketIO(server, {
  cors: {
    origin: process.env.FRONTEND_URL || "http://localhost:3001",
    methods: ["GET", "POST"]
  }
});

// Сохраняем io для использования в других модулях
app.set('io', io);

// Обработка WebSocket подключений
io.on('connection', (socket) => {
  logger.info(`WebSocket client connected: ${socket.id}`);
  
  socket.on('disconnect', () => {
    logger.info(`WebSocket client disconnected: ${socket.id}`);
  });
  
  // Подписка на обновления тракторов
  socket.on('subscribe_tractor', (tractorId) => {
    socket.join(`tractor_${tractorId}`);
    logger.info(`Client ${socket.id} subscribed to tractor ${tractorId}`);
  });
  
  socket.on('unsubscribe_tractor', (tractorId) => {
    socket.leave(`tractor_${tractorId}`);
    logger.info(`Client ${socket.id} unsubscribed from tractor ${tractorId}`);
  });
});

// Обработка сигналов завершения
process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

function gracefulShutdown(signal) {
  logger.info(`Received ${signal}. Starting graceful shutdown...`);
  
  server.close(() => {
    logger.info('HTTP server closed');
    
    // Закрываем MQTT подключение
    if (mqttClient && mqttClient.connected) {
      mqttClient.end(false, () => {
        logger.info('MQTT client disconnected');
        process.exit(0);
      });
    } else {
      process.exit(0);
    }
  });
}

// Запуск сервера
server.listen(PORT, () => {
  logger.info(`FleetMon Backend server started on port ${PORT}`);
  logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
  logger.info(`Frontend URL: ${process.env.FRONTEND_URL || 'http://localhost:3001'}`);
});

// Обработка необработанных исключений
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

module.exports = server;