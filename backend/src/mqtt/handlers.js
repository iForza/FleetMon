const logger = require('../utils/logger');
const { Tractor, Telemetry } = require('../database/models');

// Валидация данных телеметрии
function validateTelemetryData(data) {
  const errors = [];
  
  // Обязательные поля
  if (typeof data.latitude !== 'number' || data.latitude < -90 || data.latitude > 90) {
    errors.push('Invalid latitude value');
  }
  
  if (typeof data.longitude !== 'number' || data.longitude < -180 || data.longitude > 180) {
    errors.push('Invalid longitude value');
  }
  
  // Опциональные поля с валидацией
  if (data.speed !== undefined && (typeof data.speed !== 'number' || data.speed < 0 || data.speed > 200)) {
    errors.push('Invalid speed value (must be 0-200 km/h)');
  }
  
  if (data.engine_rpm !== undefined && (typeof data.engine_rpm !== 'number' || data.engine_rpm < 0 || data.engine_rpm > 10000)) {
    errors.push('Invalid engine RPM value (must be 0-10000)');
  }
  
  if (data.fuel_level !== undefined && (typeof data.fuel_level !== 'number' || data.fuel_level < 0 || data.fuel_level > 100)) {
    errors.push('Invalid fuel level value (must be 0-100%)');
  }
  
  if (data.engine_temp !== undefined && (typeof data.engine_temp !== 'number' || data.engine_temp < -50 || data.engine_temp > 200)) {
    errors.push('Invalid engine temperature value (must be -50 to 200°C)');
  }
  
  if (data.engine_hours !== undefined && (typeof data.engine_hours !== 'number' || data.engine_hours < 0)) {
    errors.push('Invalid engine hours value (must be positive)');
  }
  
  if (data.oil_pressure !== undefined && (typeof data.oil_pressure !== 'number' || data.oil_pressure < 0 || data.oil_pressure > 10)) {
    errors.push('Invalid oil pressure value (must be 0-10 bar)');
  }
  
  return errors;
}

// Обработчик телеметрических данных от ESP32
async function handleTelemetryData(deviceId, rawData, mqttTopic) {
  try {
    logger.debug('Processing telemetry data', { deviceId, topic: mqttTopic });
    
    // Валидируем входящие данные
    const validationErrors = validateTelemetryData(rawData);
    if (validationErrors.length > 0) {
      logger.warn('Telemetry validation failed', {
        deviceId,
        errors: validationErrors,
        data: rawData
      });
      return { success: false, errors: validationErrors };
    }
    
    // Находим трактор по device_id
    const tractor = await Tractor.findByDeviceId(deviceId);
    if (!tractor) {
      logger.warn('Unknown tractor device_id', { deviceId });
      
      // Можно добавить автоматическое создание трактора
      // или отправить уведомление администратору
      return { success: false, error: 'Unknown tractor' };
    }
    
    // Обновляем время последней активности трактора
    await Tractor.updateLastSeen(tractor.id);
    
    // Подготавливаем данные для сохранения
    const telemetryData = {
      tractor_id: tractor.id,
      device_id: deviceId,
      latitude: parseFloat(rawData.latitude),
      longitude: parseFloat(rawData.longitude),
      speed: rawData.speed ? parseFloat(rawData.speed) : null,
      engine_rpm: rawData.engine_rpm ? parseInt(rawData.engine_rpm) : null,
      fuel_level: rawData.fuel_level ? parseFloat(rawData.fuel_level) : null,
      engine_temp: rawData.engine_temp ? parseFloat(rawData.engine_temp) : null,
      engine_hours: rawData.engine_hours ? parseFloat(rawData.engine_hours) : null,
      oil_pressure: rawData.oil_pressure ? parseFloat(rawData.oil_pressure) : null,
      battery_voltage: rawData.battery_voltage ? parseFloat(rawData.battery_voltage) : null,
      signal_strength: rawData.signal_strength ? parseInt(rawData.signal_strength) : null,
      raw_data: rawData
    };
    
    // Сохраняем в базу данных
    const telemetry = await Telemetry.create(telemetryData);
    
    logger.info('Telemetry data saved', {
      tractorId: tractor.id,
      deviceId: deviceId,
      dataId: telemetry.id,
      location: `${telemetry.latitude}, ${telemetry.longitude}`,
      speed: telemetry.speed,
      timestamp: telemetry.time
    });
    
    // Отправляем real-time обновление
    await sendRealTimeUpdate(tractor.id, deviceId, telemetry);
    
    // Проверяем критические значения и создаем алерты
    await checkCriticalValues(tractor, telemetry);
    
    return { 
      success: true, 
      telemetryId: telemetry.id,
      tractorId: tractor.id 
    };
    
  } catch (error) {
    logger.error('Error processing telemetry data', {
      deviceId,
      error: error.message,
      stack: error.stack
    });
    
    return { success: false, error: error.message };
  }
}

// Отправка real-time обновлений через WebSocket
async function sendRealTimeUpdate(tractorId, deviceId, telemetryData) {
  try {
    // Получаем ссылку на Socket.io сервер
    const app = require('../app');
    const io = app.get('io');
    
    if (!io) {
      logger.warn('Socket.io server not available for real-time updates');
      return;
    }
    
    // Подготавливаем данные для отправки
    const updateData = {
      tractorId: tractorId,
      deviceId: deviceId,
      timestamp: telemetryData.time,
      location: {
        latitude: telemetryData.latitude,
        longitude: telemetryData.longitude
      },
      metrics: {
        speed: telemetryData.speed,
        engine_rpm: telemetryData.engine_rpm,
        fuel_level: telemetryData.fuel_level,
        engine_temp: telemetryData.engine_temp,
        engine_hours: telemetryData.engine_hours,
        oil_pressure: telemetryData.oil_pressure
      },
      system: {
        battery_voltage: telemetryData.battery_voltage,
        signal_strength: telemetryData.signal_strength
      }
    };
    
    // Отправляем данные подписанным клиентам
    io.to(`tractor_${tractorId}`).emit('telemetry_update', updateData);
    
    // Также отправляем общее обновление для dashboard
    io.emit('dashboard_update', {
      type: 'telemetry',
      tractorId: tractorId,
      timestamp: telemetryData.time
    });
    
    logger.debug('Real-time update sent', {
      tractorId: tractorId,
      recipients: `tractor_${tractorId}`
    });
    
  } catch (error) {
    logger.error('Error sending real-time update', {
      tractorId,
      error: error.message
    });
  }
}

// Проверка критических значений и создание алертов
async function checkCriticalValues(tractor, telemetry) {
  try {
    const alerts = [];
    
    // Проверка критических параметров
    if (telemetry.fuel_level !== null && telemetry.fuel_level < 10) {
      alerts.push({
        type: 'low_fuel',
        severity: 'high',
        title: 'Низкий уровень топлива',
        message: `Уровень топлива трактора ${tractor.name} составляет ${telemetry.fuel_level}%`,
        threshold_value: 10,
        actual_value: telemetry.fuel_level
      });
    }
    
    if (telemetry.engine_temp !== null && telemetry.engine_temp > 100) {
      alerts.push({
        type: 'high_temperature',
        severity: 'critical',
        title: 'Перегрев двигателя',
        message: `Температура двигателя трактора ${tractor.name} составляет ${telemetry.engine_temp}°C`,
        threshold_value: 100,
        actual_value: telemetry.engine_temp
      });
    }
    
    if (telemetry.oil_pressure !== null && telemetry.oil_pressure < 1) {
      alerts.push({
        type: 'low_oil_pressure',
        severity: 'critical',
        title: 'Низкое давление масла',
        message: `Давление масла в двигателе трактора ${tractor.name} составляет ${telemetry.oil_pressure} бар`,
        threshold_value: 1,
        actual_value: telemetry.oil_pressure
      });
    }
    
    if (telemetry.battery_voltage !== null && telemetry.battery_voltage < 11) {
      alerts.push({
        type: 'low_battery',
        severity: 'medium',
        title: 'Низкий заряд батареи',
        message: `Напряжение батареи трактора ${tractor.name} составляет ${telemetry.battery_voltage}V`,
        threshold_value: 11,
        actual_value: telemetry.battery_voltage
      });
    }
    
    // Сохраняем алерты в базе данных
    for (const alertData of alerts) {
      // Здесь можно добавить логику сохранения алертов
      // await Alert.create({ tractor_id: tractor.id, user_id: tractor.user_id, ...alertData });
      
      logger.warn('Critical alert generated', {
        tractorId: tractor.id,
        alertType: alertData.type,
        severity: alertData.severity,
        message: alertData.message
      });
    }
    
  } catch (error) {
    logger.error('Error checking critical values', {
      tractorId: tractor.id,
      error: error.message
    });
  }
}

// Обработчик команд для трактора
async function handleTractorCommand(deviceId, command, parameters) {
  try {
    logger.info('Processing tractor command', {
      deviceId,
      command,
      parameters
    });
    
    const tractor = await Tractor.findByDeviceId(deviceId);
    if (!tractor) {
      return { success: false, error: 'Unknown tractor' };
    }
    
    // Здесь можно добавить различные команды для трактора
    switch (command) {
      case 'get_status':
        // Запрос статуса трактора
        break;
        
      case 'set_config':
        // Изменение конфигурации
        break;
        
      case 'emergency_stop':
        // Экстренная остановка (если поддерживается)
        break;
        
      default:
        logger.warn('Unknown tractor command', { deviceId, command });
        return { success: false, error: 'Unknown command' };
    }
    
    return { success: true };
    
  } catch (error) {
    logger.error('Error processing tractor command', {
      deviceId,
      command,
      error: error.message
    });
    
    return { success: false, error: error.message };
  }
}

module.exports = {
  handleTelemetryData,
  sendRealTimeUpdate,
  checkCriticalValues,
  handleTractorCommand,
  validateTelemetryData
};