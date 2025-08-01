-- FleetMon Database Schema
-- Система мониторинга сельскохозяйственной техники

-- Расширения PostgreSQL
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "timescaledb";
CREATE EXTENSION IF NOT EXISTS "postgis";

-- Таблица пользователей
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    company VARCHAR(255),
    phone VARCHAR(20),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Таблица тракторов
CREATE TABLE tractors (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    device_id VARCHAR(100) UNIQUE NOT NULL, -- ESP32 уникальный ID
    name VARCHAR(255) NOT NULL,
    model VARCHAR(255),
    year INTEGER,
    registration_number VARCHAR(50),
    mqtt_topic VARCHAR(255) NOT NULL,
    is_active BOOLEAN DEFAULT true,
    last_seen TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Индексы для тракторов
CREATE INDEX idx_tractors_user_id ON tractors(user_id);
CREATE INDEX idx_tractors_device_id ON tractors(device_id);
CREATE INDEX idx_tractors_mqtt_topic ON tractors(mqtt_topic);

-- Таблица телеметрии (TimescaleDB hypertable)
CREATE TABLE telemetry (
    time TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    tractor_id UUID REFERENCES tractors(id) ON DELETE CASCADE,
    device_id VARCHAR(100) NOT NULL,
    
    -- GPS данные
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    location GEOMETRY(POINT, 4326), -- PostGIS точка
    
    -- Основные параметры
    speed REAL, -- км/ч
    engine_rpm INTEGER, -- об/мин
    fuel_level REAL, -- %
    engine_temp REAL, -- °C
    engine_hours REAL, -- часы работы
    oil_pressure REAL, -- бар
    
    -- Системная информация
    battery_voltage REAL,
    signal_strength INTEGER,
    
    -- Метаданные
    raw_data JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Создание TimescaleDB hypertable для оптимизации временных рядов
SELECT create_hypertable('telemetry', 'time');

-- Индексы для телеметрии
CREATE INDEX idx_telemetry_tractor_id ON telemetry(tractor_id, time DESC);
CREATE INDEX idx_telemetry_device_id ON telemetry(device_id, time DESC);
CREATE INDEX idx_telemetry_location ON telemetry USING GIST(location);

-- Индекс для поиска по времени
CREATE INDEX idx_telemetry_time ON telemetry(time DESC);

-- Составной индекс для быстрой выборки последних данных
CREATE INDEX idx_telemetry_latest ON telemetry(tractor_id, time DESC) 
WHERE time > NOW() - INTERVAL '1 day';

-- Таблица алертов и уведомлений
CREATE TABLE alerts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tractor_id UUID REFERENCES tractors(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    alert_type VARCHAR(50) NOT NULL, -- 'low_fuel', 'high_temp', 'offline', etc
    severity VARCHAR(20) NOT NULL, -- 'low', 'medium', 'high', 'critical'
    title VARCHAR(255) NOT NULL,
    message TEXT,
    threshold_value REAL,
    actual_value REAL,
    is_resolved BOOLEAN DEFAULT false,
    resolved_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Индексы для алертов
CREATE INDEX idx_alerts_tractor_id ON alerts(tractor_id);
CREATE INDEX idx_alerts_user_id ON alerts(user_id);
CREATE INDEX idx_alerts_created_at ON alerts(created_at DESC);
CREATE INDEX idx_alerts_unresolved ON alerts(is_resolved, created_at DESC) WHERE NOT is_resolved;

-- Таблица настроек MQTT для пользователей
CREATE TABLE mqtt_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    broker_host VARCHAR(255) NOT NULL,
    broker_port INTEGER DEFAULT 1883,
    username VARCHAR(255),
    password VARCHAR(255),
    use_ssl BOOLEAN DEFAULT false,
    client_id VARCHAR(255),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Индекс для настроек MQTT
CREATE INDEX idx_mqtt_settings_user_id ON mqtt_settings(user_id);

-- Таблица сессий пользователей
CREATE TABLE user_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(255) NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    user_agent TEXT,
    ip_address INET,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Индексы для сессий
CREATE INDEX idx_user_sessions_user_id ON user_sessions(user_id);
CREATE INDEX idx_user_sessions_token_hash ON user_sessions(token_hash);
CREATE INDEX idx_user_sessions_expires_at ON user_sessions(expires_at);

-- Функция автоматического обновления updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Триггеры для автоматического обновления updated_at
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_tractors_updated_at BEFORE UPDATE ON tractors
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_mqtt_settings_updated_at BEFORE UPDATE ON mqtt_settings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Функция для обновления location на основе latitude/longitude
CREATE OR REPLACE FUNCTION update_location()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.latitude IS NOT NULL AND NEW.longitude IS NOT NULL THEN
        NEW.location = ST_SetSRID(ST_MakePoint(NEW.longitude, NEW.latitude), 4326);
    END IF;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Триггер для автоматического создания location
CREATE TRIGGER update_telemetry_location BEFORE INSERT OR UPDATE ON telemetry
    FOR EACH ROW EXECUTE FUNCTION update_location();

-- Политики автоматической очистки старых данных (retention policy)
-- Удаление телеметрии старше 1 года
SELECT add_retention_policy('telemetry', INTERVAL '1 year');

-- Удаление старых сессий
CREATE OR REPLACE FUNCTION cleanup_expired_sessions()
RETURNS void AS $$
BEGIN
    DELETE FROM user_sessions WHERE expires_at < NOW();
END;
$$ language 'plpgsql';

-- Создание задачи для автоматической очистки (нужно настроить cron)
-- SELECT cron.schedule('cleanup-sessions', '0 2 * * *', 'SELECT cleanup_expired_sessions();');

-- Представления для удобных запросов

-- Последние данные по каждому трактору
CREATE VIEW latest_telemetry AS
SELECT DISTINCT ON (tractor_id) 
    t.*,
    tr.name as tractor_name,
    tr.model as tractor_model,
    u.email as owner_email
FROM telemetry t
JOIN tractors tr ON t.tractor_id = tr.id
JOIN users u ON tr.user_id = u.id
ORDER BY tractor_id, time DESC;

-- Активные трактора с последними данными
CREATE VIEW active_tractors AS
SELECT 
    tr.*,
    lt.time as last_telemetry,
    lt.latitude,
    lt.longitude,
    lt.speed,
    lt.fuel_level,
    lt.engine_temp,
    u.email as owner_email,
    u.first_name as owner_first_name,
    u.last_name as owner_last_name
FROM tractors tr
LEFT JOIN latest_telemetry lt ON tr.id = lt.tractor_id
JOIN users u ON tr.user_id = u.id
WHERE tr.is_active = true;

-- Статистика по пользователям
CREATE VIEW user_stats AS
SELECT 
    u.id,
    u.email,
    u.first_name,
    u.last_name,
    COUNT(tr.id) as total_tractors,
    COUNT(CASE WHEN tr.last_seen > NOW() - INTERVAL '1 hour' THEN 1 END) as online_tractors,
    MAX(tr.last_seen) as last_activity
FROM users u
LEFT JOIN tractors tr ON u.id = tr.user_id
WHERE u.is_active = true
GROUP BY u.id, u.email, u.first_name, u.last_name;

-- Комментарии к таблицам
COMMENT ON TABLE users IS 'Пользователи системы мониторинга';
COMMENT ON TABLE tractors IS 'Информация о тракторах и ESP32 устройствах';
COMMENT ON TABLE telemetry IS 'Телеметрические данные от тракторов (TimescaleDB)';
COMMENT ON TABLE alerts IS 'Алерты и уведомления для пользователей';
COMMENT ON TABLE mqtt_settings IS 'Настройки MQTT подключений пользователей';
COMMENT ON TABLE user_sessions IS 'Сессии авторизованных пользователей';

-- Комментарии к важным полям
COMMENT ON COLUMN tractors.device_id IS 'Уникальный ID ESP32 устройства';
COMMENT ON COLUMN tractors.mqtt_topic IS 'MQTT топик для получения данных';
COMMENT ON COLUMN telemetry.location IS 'PostGIS геометрическая точка для пространственных запросов';
COMMENT ON COLUMN telemetry.raw_data IS 'Сырые данные от ESP32 в формате JSON';

-- Начальные данные для разработки
INSERT INTO users (email, password_hash, first_name, last_name, company) VALUES
('admin@fleetmon.com', '$2b$10$example_hash', 'Admin', 'User', 'FleetMon Ltd'),
('farmer@example.com', '$2b$10$example_hash', 'John', 'Farmer', 'Green Farm LLC');

-- Пример трактора для тестирования
INSERT INTO tractors (user_id, device_id, name, model, year, mqtt_topic) VALUES
((SELECT id FROM users WHERE email = 'admin@fleetmon.com'), 'ESP32_001', 'Трактор №1', 'John Deere 6120M', 2020, 'fleetmon/ESP32_001/telemetry');

COMMIT;