const mqtt = require('mqtt');
const logger = require('../utils/logger');
const { Tractor, Telemetry } = require('../database/models');

class MQTTClient {
  constructor() {
    this.client = null;
    this.isConnected = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 10;
    this.reconnectDelay = 5000; // 5 секунд
    
    // Настройки подключения к внешнему брокеру wqtt.ru
    this.options = {
      host: process.env.MQTT_BROKER_HOST || 'm9.wqtt.ru',
      port: parseInt(process.env.MQTT_BROKER_PORT) || 20264,
      username: process.env.MQTT_USERNAME || 'u_MZEPA5',
      password: process.env.MQTT_PASSWORD || 'L3YAUTS6',
      clientId: process.env.MQTT_CLIENT_ID || `fleetmon-backend-${Date.now()}`,
      clean: true,
      connectTimeout: 30000, // 30 секунд
      keepalive: 60,
      reconnectPeriod: this.reconnectDelay,
      will: {
        topic: 'fleetmon/backend/status',
        payload: JSON.stringify({ 
          status: 'offline', 
          timestamp: new Date().toISOString(),
          clientId: process.env.MQTT_CLIENT_ID || `fleetmon-backend-${Date.now()}`
        }),
        qos: 1,
        retain: true
      }
    };
    
    this.subscriptions = [
      'fleetmon/+/telemetry',    // Телеметрия от всех тракторов
      'fleetmon/+/status',       // Статус тракторов
      'fleetmon/+/heartbeat'     // Heartbeat сигналы
    ];
  }
  
  async connect() {
    try {
      logger.info('Connecting to MQTT broker...', {
        host: this.options.host,
        port: this.options.port,
        clientId: this.options.clientId
      });
      
      const brokerUrl = `mqtt://${this.options.host}:${this.options.port}`;
      this.client = mqtt.connect(brokerUrl, this.options);
      
      this.setupEventHandlers();
      
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('MQTT connection timeout'));
        }, this.options.connectTimeout);
        
        this.client.once('connect', () => {
          clearTimeout(timeout);
          resolve();
        });
        
        this.client.once('error', (error) => {
          clearTimeout(timeout);
          reject(error);
        });
      });
      
    } catch (error) {
      logger.error('MQTT connection failed:', error);
      throw error;
    }
  }
  
  setupEventHandlers() {
    this.client.on('connect', () => {
      this.isConnected = true;
      this.reconnectAttempts = 0;
      
      logger.info('Connected to MQTT broker', {
        host: this.options.host,
        port: this.options.port,
        clientId: this.options.clientId
      });
      
      // Подписываемся на топики
      this.subscribeToTopics();
      
      // Отправляем статус online
      this.publishStatus('online');
    });
    
    this.client.on('message', (topic, message) => {
      this.handleMessage(topic, message);
    });
    
    this.client.on('error', (error) => {
      logger.error('MQTT client error:', error);
      this.isConnected = false;
    });
    
    this.client.on('disconnect', () => {
      this.isConnected = false;
      logger.warn('Disconnected from MQTT broker');
    });
    
    this.client.on('reconnect', () => {
      this.reconnectAttempts++;
      logger.info(`MQTT reconnect attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts}`);
      
      if (this.reconnectAttempts >= this.maxReconnectAttempts) {
        logger.error('Max MQTT reconnect attempts reached');
        this.client.end();
      }
    });
    
    this.client.on('close', () => {
      this.isConnected = false;
      logger.info('MQTT client closed');
    });
  }
  
  async subscribeToTopics() {
    try {
      for (const topic of this.subscriptions) {
        await new Promise((resolve, reject) => {
          this.client.subscribe(topic, { qos: 1 }, (error) => {
            if (error) {
              logger.error(`Failed to subscribe to ${topic}:`, error);
              reject(error);
            } else {
              logger.info(`Subscribed to topic: ${topic}`);
              resolve();
            }
          });
        });
      }
    } catch (error) {
      logger.error('Failed to subscribe to topics:', error);
    }
  }
  
  async handleMessage(topic, message) {
    try {
      const messageStr = message.toString();
      logger.debug('MQTT message received', { topic, message: messageStr });
      
      // Парсим JSON сообщение
      let data;
      try {
        data = JSON.parse(messageStr);
      } catch (parseError) {
        logger.warn('Failed to parse MQTT message as JSON:', parseError.message);
        return;
      }
      
      // Извлекаем device_id из топика
      const topicParts = topic.split('/');
      if (topicParts.length < 3) {
        logger.warn('Invalid topic format:', topic);
        return;
      }
      
      const deviceId = topicParts[1];
      const messageType = topicParts[2];
      
      switch (messageType) {
        case 'telemetry':
          await this.handleTelemetryMessage(deviceId, data);
          break;
          
        case 'status':
          await this.handleStatusMessage(deviceId, data);
          break;
          
        case 'heartbeat':
          await this.handleHeartbeatMessage(deviceId, data);
          break;
          
        default:
          logger.warn('Unknown message type:', messageType);
      }
      
    } catch (error) {
      logger.error('Error handling MQTT message:', error);
    }
  }
  
  async handleTelemetryMessage(deviceId, data) {
    try {
      // Находим трактор по device_id
      const tractor = await Tractor.findByDeviceId(deviceId);
      if (!tractor) {
        logger.warn(`Unknown tractor device_id: ${deviceId}`);
        return;
      }
      
      // Обновляем время последней активности
      await Tractor.updateLastSeen(tractor.id);
      
      // Создаем запись телеметрии
      const telemetryData = {
        tractor_id: tractor.id,
        device_id: deviceId,
        latitude: data.latitude,
        longitude: data.longitude,
        speed: data.speed,
        engine_rpm: data.engine_rpm,
        fuel_level: data.fuel_level,
        engine_temp: data.engine_temp,
        engine_hours: data.engine_hours,
        oil_pressure: data.oil_pressure,
        battery_voltage: data.battery_voltage,
        signal_strength: data.signal_strength,
        raw_data: data
      };
      
      const telemetry = await Telemetry.create(telemetryData);
      
      // Отправляем real-time обновление через WebSocket
      const io = require('../server').get('io');
      if (io) {
        io.to(`tractor_${tractor.id}`).emit('telemetry_update', {
          tractorId: tractor.id,
          deviceId: deviceId,
          data: telemetry
        });
      }
      
      logger.debug('Telemetry data saved', {
        tractorId: tractor.id,
        deviceId: deviceId,
        timestamp: telemetry.time
      });
      
    } catch (error) {
      logger.error('Error handling telemetry message:', error);
    }
  }
  
  async handleStatusMessage(deviceId, data) {
    try {
      const tractor = await Tractor.findByDeviceId(deviceId);
      if (!tractor) {
        logger.warn(`Unknown tractor device_id: ${deviceId}`);
        return;
      }
      
      logger.info('Tractor status update', {
        deviceId: deviceId,
        status: data.status,
        timestamp: data.timestamp
      });
      
      // Обновляем время последней активности
      await Tractor.updateLastSeen(tractor.id);
      
      // Отправляем статус через WebSocket
      const io = require('../server').get('io');
      if (io) {
        io.to(`tractor_${tractor.id}`).emit('status_update', {
          tractorId: tractor.id,
          deviceId: deviceId,
          status: data.status,
          timestamp: data.timestamp
        });
      }
      
    } catch (error) {
      logger.error('Error handling status message:', error);
    }
  }
  
  async handleHeartbeatMessage(deviceId, data) {
    try {
      const tractor = await Tractor.findByDeviceId(deviceId);
      if (tractor) {
        await Tractor.updateLastSeen(tractor.id);
        logger.debug('Heartbeat received', { deviceId: deviceId });
      }
    } catch (error) {
      logger.error('Error handling heartbeat message:', error);
    }
  }
  
  publishStatus(status) {
    if (!this.isConnected) {
      return;
    }
    
    const statusMessage = {
      status: status,
      timestamp: new Date().toISOString(),
      clientId: this.options.clientId
    };
    
    this.client.publish('fleetmon/backend/status', JSON.stringify(statusMessage), {
      qos: 1,
      retain: true
    }, (error) => {
      if (error) {
        logger.error('Failed to publish status:', error);
      } else {
        logger.debug('Backend status published:', status);
      }
    });
  }
  
  publishToTractor(deviceId, topic, data) {
    if (!this.isConnected) {
      logger.warn('MQTT client not connected, cannot publish message');
      return false;
    }
    
    const fullTopic = `fleetmon/${deviceId}/${topic}`;
    const message = typeof data === 'string' ? data : JSON.stringify(data);
    
    this.client.publish(fullTopic, message, { qos: 1 }, (error) => {
      if (error) {
        logger.error(`Failed to publish to ${fullTopic}:`, error);
      } else {
        logger.debug(`Message published to ${fullTopic}`);
      }
    });
    
    return true;
  }
  
  disconnect() {
    if (this.client) {
      this.publishStatus('offline');
      this.client.end();
      this.isConnected = false;
      logger.info('MQTT client disconnected');
    }
  }
  
  getStatus() {
    return {
      connected: this.isConnected,
      host: this.options.host,
      port: this.options.port,
      clientId: this.options.clientId,
      reconnectAttempts: this.reconnectAttempts
    };
  }
}

// Создаем единственный экземпляр MQTT клиента
const mqttClient = new MQTTClient();

// Автоматически подключаемся при загрузке модуля
mqttClient.connect().catch((error) => {
  logger.error('Failed to connect to MQTT broker:', error);
});

module.exports = mqttClient;