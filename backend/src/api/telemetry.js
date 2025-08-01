const express = require('express');
const { Tractor, Telemetry } = require('../database/models');
const { authenticateToken } = require('./auth');
const logger = require('../utils/logger');

const router = express.Router();

// Все маршруты требуют аутентификации
router.use(authenticateToken);

// Получить последние данные телеметрии для трактора
router.get('/:tractorId/latest', async (req, res) => {
  try {
    const tractorId = req.params.tractorId;
    const limit = parseInt(req.query.limit) || 1;
    
    // Проверяем принадлежность трактора пользователю
    const userTractors = await Tractor.findByUserId(req.user.userId);
    const tractor = userTractors.find(t => t.id === tractorId);
    
    if (!tractor) {
      return res.status(404).json({ error: 'Tractor not found' });
    }
    
    const telemetryData = await Telemetry.getLatestByTractorId(tractorId, limit);
    
    res.json({
      tractorId: tractorId,
      tractorName: tractor.name,
      data: limit === 1 ? telemetryData : telemetryData,
      count: Array.isArray(telemetryData) ? telemetryData.length : (telemetryData ? 1 : 0)
    });
    
  } catch (error) {
    logger.error('Error fetching latest telemetry:', error);
    res.status(500).json({ error: 'Failed to fetch telemetry data' });
  }
});

// Получить исторические данные телеметрии
router.get('/:tractorId/history', async (req, res) => {
  try {
    const tractorId = req.params.tractorId;
    const { start_time, end_time, interval } = req.query;
    
    // Валидация параметров времени
    if (!start_time || !end_time) {
      return res.status(400).json({ error: 'Start time and end time are required' });
    }
    
    const startTime = new Date(start_time);
    const endTime = new Date(end_time);
    
    if (isNaN(startTime.getTime()) || isNaN(endTime.getTime())) {
      return res.status(400).json({ error: 'Invalid date format' });
    }
    
    if (startTime >= endTime) {
      return res.status(400).json({ error: 'Start time must be before end time' });
    }
    
    // Ограничиваем период запроса (максимум 30 дней)
    const maxPeriod = 30 * 24 * 60 * 60 * 1000; // 30 дней в миллисекундах
    if (endTime - startTime > maxPeriod) {
      return res.status(400).json({ error: 'Period cannot exceed 30 days' });
    }
    
    // Проверяем принадлежность трактора пользователю
    const userTractors = await Tractor.findByUserId(req.user.userId);
    const tractor = userTractors.find(t => t.id === tractorId);
    
    if (!tractor) {
      return res.status(404).json({ error: 'Tractor not found' });
    }
    
    // Определяем интервал агрегации
    let aggregationInterval = interval || '5 minutes';
    const validIntervals = ['1 minute', '5 minutes', '15 minutes', '30 minutes', '1 hour', '6 hours', '1 day'];
    
    if (!validIntervals.includes(aggregationInterval)) {
      aggregationInterval = '5 minutes';
    }
    
    const historyData = await Telemetry.getByTimeRange(
      tractorId, 
      startTime, 
      endTime, 
      aggregationInterval
    );
    
    res.json({
      tractorId: tractorId,
      tractorName: tractor.name,
      period: {
        start: startTime.toISOString(),
        end: endTime.toISOString(),
        interval: aggregationInterval
      },
      data: historyData,
      count: historyData.length
    });
    
  } catch (error) {
    logger.error('Error fetching telemetry history:', error);
    res.status(500).json({ error: 'Failed to fetch telemetry history' });
  }
});

// Получить историю перемещений (для карты)
router.get('/:tractorId/location-history', async (req, res) => {
  try {
    const tractorId = req.params.tractorId;
    const { start_time, end_time, limit } = req.query;
    
    // Валидация параметров
    if (!start_time || !end_time) {
      return res.status(400).json({ error: 'Start time and end time are required' });
    }
    
    const startTime = new Date(start_time);
    const endTime = new Date(end_time);
    
    if (isNaN(startTime.getTime()) || isNaN(endTime.getTime())) {
      return res.status(400).json({ error: 'Invalid date format' });
    }
    
    // Проверяем принадлежность трактора пользователю
    const userTractors = await Tractor.findByUserId(req.user.userId);
    const tractor = userTractors.find(t => t.id === tractorId);
    
    if (!tractor) {
      return res.status(404).json({ error: 'Tractor not found' });
    }
    
    const locationLimit = Math.min(parseInt(limit) || 1000, 5000); // Максимум 5000 точек
    
    const locationHistory = await Telemetry.getLocationHistory(
      tractorId,
      startTime,
      endTime,
      locationLimit
    );
    
    res.json({
      tractorId: tractorId,
      tractorName: tractor.name,
      period: {
        start: startTime.toISOString(),
        end: endTime.toISOString()
      },
      locations: locationHistory,
      count: locationHistory.length
    });
    
  } catch (error) {
    logger.error('Error fetching location history:', error);
    res.status(500).json({ error: 'Failed to fetch location history' });
  }
});

// Предустановленные периоды для удобства
router.get('/:tractorId/quick/:period', async (req, res) => {
  try {
    const tractorId = req.params.tractorId;
    const period = req.params.period;
    
    // Определяем временной период
    const now = new Date();
    let startTime, interval;
    
    switch (period) {
      case '10min':
        startTime = new Date(now - 10 * 60 * 1000);
        interval = '1 minute';
        break;
      case '1hour':
        startTime = new Date(now - 60 * 60 * 1000);
        interval = '5 minutes';
        break;
      case '6hours':
        startTime = new Date(now - 6 * 60 * 60 * 1000);
        interval = '15 minutes';
        break;
      case '24hours':
        startTime = new Date(now - 24 * 60 * 60 * 1000);
        interval = '1 hour';
        break;
      case '7days':
        startTime = new Date(now - 7 * 24 * 60 * 60 * 1000);
        interval = '6 hours';
        break;
      default:
        return res.status(400).json({ 
          error: 'Invalid period. Available: 10min, 1hour, 6hours, 24hours, 7days' 
        });
    }
    
    // Проверяем принадлежность трактора пользователю
    const userTractors = await Tractor.findByUserId(req.user.userId);
    const tractor = userTractors.find(t => t.id === tractorId);
    
    if (!tractor) {
      return res.status(404).json({ error: 'Tractor not found' });
    }
    
    const telemetryData = await Telemetry.getByTimeRange(
      tractorId,
      startTime,
      now,
      interval
    );
    
    res.json({
      tractorId: tractorId,
      tractorName: tractor.name,
      period: {
        name: period,
        start: startTime.toISOString(),
        end: now.toISOString(),
        interval: interval
      },
      data: telemetryData,
      count: telemetryData.length
    });
    
  } catch (error) {
    logger.error('Error fetching quick period data:', error);
    res.status(500).json({ error: 'Failed to fetch telemetry data' });
  }
});

module.exports = router;