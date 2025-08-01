const winston = require('winston');
const path = require('path');

// Определяем уровень логирования
const logLevel = process.env.LOG_LEVEL || 'info';

// Создаем logger
const logger = winston.createLogger({
  level: logLevel,
  format: winston.format.combine(
    winston.format.timestamp({
      format: 'YYYY-MM-DD HH:mm:ss'
    }),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { 
    service: 'fleetmon-backend',
    version: process.env.npm_package_version || '0.1.0'
  },
  transports: [
    // Логи ошибок в отдельный файл
    new winston.transports.File({ 
      filename: process.env.LOG_FILE || '/var/log/fleetmon-error.log',
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5
    }),
    
    // Все логи в общий файл
    new winston.transports.File({ 
      filename: process.env.LOG_FILE || '/var/log/fleetmon.log',
      maxsize: 5242880, // 5MB
      maxFiles: 10
    })
  ]
});

// В development режиме также выводим в консоль
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.simple()
    )
  }));
}

// Если файлы логов недоступны (например, нет прав), используем только консоль
logger.on('error', (error) => {
  console.error('Logger error:', error);
  
  // Добавляем консольный transport как fallback
  if (!logger.transports.find(t => t.name === 'console')) {
    logger.add(new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    }));
  }
});

module.exports = logger;