const db = require('./connection');
const logger = require('../utils/logger');

// Модель пользователей
class User {
  static async create(userData) {
    const { email, password_hash, first_name, last_name, company, phone } = userData;
    
    const query = `
      INSERT INTO users (email, password_hash, first_name, last_name, company, phone)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id, email, first_name, last_name, company, phone, is_active, created_at
    `;
    
    const values = [email, password_hash, first_name, last_name, company, phone];
    const result = await db.query(query, values);
    return result.rows[0];
  }
  
  static async findByEmail(email) {
    const query = 'SELECT * FROM users WHERE email = $1 AND is_active = true';
    const result = await db.query(query, [email]);
    return result.rows[0];
  }
  
  static async findById(id) {
    const query = 'SELECT id, email, first_name, last_name, company, phone, is_active, created_at FROM users WHERE id = $1 AND is_active = true';
    const result = await db.query(query, [id]);
    return result.rows[0];
  }
  
  static async update(id, userData) {
    const { first_name, last_name, company, phone } = userData;
    
    const query = `
      UPDATE users 
      SET first_name = $2, last_name = $3, company = $4, phone = $5, updated_at = NOW()
      WHERE id = $1 AND is_active = true
      RETURNING id, email, first_name, last_name, company, phone, updated_at
    `;
    
    const values = [id, first_name, last_name, company, phone];
    const result = await db.query(query, values);
    return result.rows[0];
  }
}

// Модель тракторов
class Tractor {
  static async create(tractorData) {
    const { user_id, device_id, name, model, year, registration_number } = tractorData;
    
    // Генерируем MQTT топик для трактора
    const mqtt_topic = `fleetmon/${device_id}/telemetry`;
    
    const query = `
      INSERT INTO tractors (user_id, device_id, name, model, year, registration_number, mqtt_topic)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `;
    
    const values = [user_id, device_id, name, model, year, registration_number, mqtt_topic];
    const result = await db.query(query, values);
    return result.rows[0];
  }
  
  static async findByUserId(userId) {
    const query = `
      SELECT t.*, 
             (SELECT time FROM telemetry WHERE tractor_id = t.id ORDER BY time DESC LIMIT 1) as last_telemetry
      FROM tractors t 
      WHERE t.user_id = $1 AND t.is_active = true
      ORDER BY t.created_at DESC
    `;
    
    const result = await db.query(query, [userId]);
    return result.rows;
  }
  
  static async findByDeviceId(deviceId) {
    const query = 'SELECT * FROM tractors WHERE device_id = $1 AND is_active = true';
    const result = await db.query(query, [deviceId]);
    return result.rows[0];
  }
  
  static async updateLastSeen(id) {
    const query = 'UPDATE tractors SET last_seen = NOW() WHERE id = $1';
    await db.query(query, [id]);
  }
  
  static async getActiveWithLatestTelemetry(userId) {
    const query = `
      SELECT 
        t.*,
        lt.time as last_telemetry_time,
        lt.latitude,
        lt.longitude,
        lt.speed,
        lt.fuel_level,
        lt.engine_temp,
        lt.engine_rpm,
        lt.engine_hours,
        lt.oil_pressure
      FROM tractors t
      LEFT JOIN latest_telemetry lt ON t.id = lt.tractor_id
      WHERE t.user_id = $1 AND t.is_active = true
      ORDER BY t.created_at DESC
    `;
    
    const result = await db.query(query, [userId]);
    return result.rows;
  }
}

// Модель телеметрии
class Telemetry {
  static async create(telemetryData) {
    const { 
      tractor_id, 
      device_id, 
      latitude, 
      longitude, 
      speed, 
      engine_rpm, 
      fuel_level, 
      engine_temp, 
      engine_hours, 
      oil_pressure,
      battery_voltage,
      signal_strength,
      raw_data 
    } = telemetryData;
    
    const query = `
      INSERT INTO telemetry (
        tractor_id, device_id, latitude, longitude, speed, engine_rpm, 
        fuel_level, engine_temp, engine_hours, oil_pressure, 
        battery_voltage, signal_strength, raw_data
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING *
    `;
    
    const values = [
      tractor_id, device_id, latitude, longitude, speed, engine_rpm,
      fuel_level, engine_temp, engine_hours, oil_pressure,
      battery_voltage, signal_strength, JSON.stringify(raw_data)
    ];
    
    const result = await db.query(query, values);
    return result.rows[0];
  }
  
  static async getLatestByTractorId(tractorId, limit = 1) {
    const query = `
      SELECT * FROM telemetry 
      WHERE tractor_id = $1 
      ORDER BY time DESC 
      LIMIT $2
    `;
    
    const result = await db.query(query, [tractorId, limit]);
    return limit === 1 ? result.rows[0] : result.rows;
  }
  
  static async getByTimeRange(tractorId, startTime, endTime, interval = '1 minute') {
    const query = `
      SELECT 
        time_bucket($4, time) AS bucket,
        AVG(speed) as avg_speed,
        AVG(engine_rpm) as avg_engine_rpm,
        AVG(fuel_level) as avg_fuel_level,
        AVG(engine_temp) as avg_engine_temp,
        AVG(oil_pressure) as avg_oil_pressure,
        MAX(engine_hours) as max_engine_hours,
        COUNT(*) as data_points
      FROM telemetry
      WHERE tractor_id = $1 AND time >= $2 AND time <= $3
      GROUP BY bucket
      ORDER BY bucket ASC
    `;
    
    const result = await db.query(query, [tractorId, startTime, endTime, interval]);
    return result.rows;
  }
  
  static async getLocationHistory(tractorId, startTime, endTime, limit = 1000) {
    const query = `
      SELECT time, latitude, longitude, speed
      FROM telemetry
      WHERE tractor_id = $1 AND time >= $2 AND time <= $3
        AND latitude IS NOT NULL AND longitude IS NOT NULL
      ORDER BY time ASC
      LIMIT $4
    `;
    
    const result = await db.query(query, [tractorId, startTime, endTime, limit]);
    return result.rows;
  }
}

// Модель настроек MQTT
class MqttSettings {
  static async createOrUpdate(userId, settings) {
    const { broker_host, broker_port, username, password, use_ssl, client_id } = settings;
    
    const query = `
      INSERT INTO mqtt_settings (user_id, broker_host, broker_port, username, password, use_ssl, client_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (user_id) 
      DO UPDATE SET 
        broker_host = $2,
        broker_port = $3,
        username = $4,
        password = $5,
        use_ssl = $6,
        client_id = $7,
        updated_at = NOW()
      RETURNING *
    `;
    
    const values = [userId, broker_host, broker_port, username, password, use_ssl, client_id];
    const result = await db.query(query, values);
    return result.rows[0];
  }
  
  static async findByUserId(userId) {
    const query = 'SELECT * FROM mqtt_settings WHERE user_id = $1 AND is_active = true';
    const result = await db.query(query, [userId]);
    return result.rows[0];
  }
}

// Модель для статистики и аналитики
class Analytics {
  static async getTractorStats(tractorId, days = 7) {
    const query = `
      SELECT 
        COUNT(*) as total_data_points,
        AVG(speed) as avg_speed,
        MAX(speed) as max_speed,
        AVG(fuel_level) as avg_fuel_level,
        MIN(fuel_level) as min_fuel_level,
        AVG(engine_temp) as avg_engine_temp,
        MAX(engine_temp) as max_engine_temp,
        MAX(engine_hours) - MIN(engine_hours) as hours_worked
      FROM telemetry
      WHERE tractor_id = $1 AND time >= NOW() - INTERVAL '$2 days'
    `;
    
    const result = await db.query(query, [tractorId, days]);
    return result.rows[0];
  }
  
  static async getUserOverview(userId) {
    const query = `
      SELECT 
        COUNT(DISTINCT t.id) as total_tractors,
        COUNT(DISTINCT CASE WHEN t.last_seen > NOW() - INTERVAL '1 hour' THEN t.id END) as online_tractors,
        COUNT(tel.id) as total_telemetry_points,
        MAX(tel.time) as last_activity
      FROM tractors t
      LEFT JOIN telemetry tel ON t.id = tel.tractor_id AND tel.time >= NOW() - INTERVAL '24 hours'
      WHERE t.user_id = $1 AND t.is_active = true
    `;
    
    const result = await db.query(query, [userId]);
    return result.rows[0];
  }
}

module.exports = {
  User,
  Tractor,
  Telemetry,
  MqttSettings,
  Analytics
};