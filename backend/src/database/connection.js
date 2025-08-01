const { Pool } = require('pg');
const logger = require('../utils/logger');

// Создаем пул подключений к PostgreSQL
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  max: 20, // максимальное количество подключений в пуле
  idleTimeoutMillis: 30000, // время жизни неактивного подключения
  connectionTimeoutMillis: 2000, // таймаут подключения
});

// Обработка событий пула
pool.on('connect', (client) => {
  logger.info('New database client connected');
});

pool.on('error', (err) => {
  logger.error('Database pool error:', err);
});

pool.on('remove', (client) => {
  logger.info('Database client removed from pool');
});

// Функция для выполнения запросов
const query = async (text, params) => {
  const start = Date.now();
  try {
    const result = await pool.query(text, params);
    const duration = Date.now() - start;
    
    logger.debug('Query executed', {
      query: text,
      duration: `${duration}ms`,
      rows: result.rowCount
    });
    
    return result;
  } catch (error) {
    logger.error('Database query error:', {
      query: text,
      params: params,
      error: error.message
    });
    throw error;
  }
};

// Функция для получения клиента из пула (для транзакций)
const getClient = async () => {
  try {
    const client = await pool.connect();
    
    // Добавляем методы для удобства работы с транзакциями
    const originalQuery = client.query;
    client.query = async (text, params) => {
      const start = Date.now();
      try {
        const result = await originalQuery.call(client, text, params);
        const duration = Date.now() - start;
        
        logger.debug('Transaction query executed', {
          query: text,
          duration: `${duration}ms`,
          rows: result.rowCount
        });
        
        return result;
      } catch (error) {
        logger.error('Transaction query error:', {
          query: text,
          params: params,
          error: error.message
        });
        throw error;
      }
    };
    
    return client;
  } catch (error) {
    logger.error('Failed to get database client:', error);
    throw error;
  }
};

// Функция для проверки подключения к базе данных
const checkConnection = async () => {
  try {
    const result = await query('SELECT NOW() as current_time, version() as pg_version');
    logger.info('Database connection successful', {
      time: result.rows[0].current_time,
      version: result.rows[0].pg_version.split(' ')[0]
    });
    
    // Проверяем наличие TimescaleDB
    try {
      const tsResult = await query("SELECT extname FROM pg_extension WHERE extname = 'timescaledb'");
      if (tsResult.rows.length > 0) {
        logger.info('TimescaleDB extension detected');
        
        // Получаем версию TimescaleDB
        const versionResult = await query("SELECT extversion FROM pg_extension WHERE extname = 'timescaledb'");
        logger.info(`TimescaleDB version: ${versionResult.rows[0].extversion}`);
      } else {
        logger.warn('TimescaleDB extension not found');
      }
    } catch (tsError) {
      logger.warn('Could not check TimescaleDB extension:', tsError.message);
    }
    
    return true;
  } catch (error) {
    logger.error('Database connection failed:', error);
    throw error;
  }
};

// Функция для инициализации базы данных при запуске
const initializeDatabase = async () => {
  try {
    logger.info('Initializing database connection...');
    await checkConnection();
    
    // Можно добавить дополнительную инициализацию здесь
    // например, создание индексов или проверку схемы
    
    logger.info('Database initialization completed');
  } catch (error) {
    logger.error('Database initialization failed:', error);
    throw error;
  }
};

// Функция для graceful shutdown
const closePool = async () => {
  try {
    await pool.end();
    logger.info('Database pool closed');
  } catch (error) {
    logger.error('Error closing database pool:', error);
  }
};

// Экспортируем функции и пул
module.exports = {
  query,
  getClient,
  pool,
  checkConnection,
  initializeDatabase,
  closePool
};

// Инициализируем подключение при загрузке модуля
initializeDatabase().catch((error) => {
  logger.error('Failed to initialize database:', error);
  // В продакшене можно завершить процесс при критической ошибке БД
  if (process.env.NODE_ENV === 'production') {
    process.exit(1);
  }
});