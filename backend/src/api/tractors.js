const express = require('express');
const { Tractor, Analytics } = require('../database/models');
const { authenticateToken } = require('./auth');
const logger = require('../utils/logger');

const router = express.Router();

// Все маршруты требуют аутентификации
router.use(authenticateToken);

// Получить все трактора пользователя
router.get('/', async (req, res) => {
  try {
    const tractors = await Tractor.getActiveWithLatestTelemetry(req.user.userId);
    
    res.json({
      tractors: tractors,
      count: tractors.length
    });
    
  } catch (error) {
    logger.error('Error fetching tractors:', error);
    res.status(500).json({ error: 'Failed to fetch tractors' });
  }
});

// Получить конкретный трактор
router.get('/:id', async (req, res) => {
  try {
    const tractorId = req.params.id;
    const tractors = await Tractor.getActiveWithLatestTelemetry(req.user.userId);
    const tractor = tractors.find(t => t.id === tractorId);
    
    if (!tractor) {
      return res.status(404).json({ error: 'Tractor not found' });
    }
    
    res.json({ tractor });
    
  } catch (error) {
    logger.error('Error fetching tractor:', error);
    res.status(500).json({ error: 'Failed to fetch tractor' });
  }
});

// Создать новый трактор
router.post('/', async (req, res) => {
  try {
    const { device_id, name, model, year, registration_number } = req.body;
    
    // Валидация
    if (!device_id || !name) {
      return res.status(400).json({ error: 'Device ID and name are required' });
    }
    
    // Проверяем уникальность device_id
    const existingTractor = await Tractor.findByDeviceId(device_id);
    if (existingTractor) {
      return res.status(409).json({ error: 'Tractor with this device ID already exists' });
    }
    
    const tractorData = {
      user_id: req.user.userId,
      device_id: device_id.trim(),
      name: name.trim(),
      model: model ? model.trim() : null,
      year: year ? parseInt(year) : null,
      registration_number: registration_number ? registration_number.trim() : null
    };
    
    const newTractor = await Tractor.create(tractorData);
    
    logger.info('New tractor created', {
      tractorId: newTractor.id,
      userId: req.user.userId,
      deviceId: newTractor.device_id,
      name: newTractor.name
    });
    
    res.status(201).json({
      message: 'Tractor created successfully',
      tractor: newTractor
    });
    
  } catch (error) {
    logger.error('Error creating tractor:', error);
    res.status(500).json({ error: 'Failed to create tractor' });
  }
});

// Получить статистику трактора
router.get('/:id/stats', async (req, res) => {
  try {
    const tractorId = req.params.id;
    const days = parseInt(req.query.days) || 7;
    
    // Проверяем принадлежность трактора пользователю
    const userTractors = await Tractor.findByUserId(req.user.userId);
    const tractor = userTractors.find(t => t.id === tractorId);
    
    if (!tractor) {
      return res.status(404).json({ error: 'Tractor not found' });
    }
    
    const stats = await Analytics.getTractorStats(tractorId, days);
    
    res.json({
      tractorId: tractorId,
      period: `${days} days`,
      stats: stats
    });
    
  } catch (error) {
    logger.error('Error fetching tractor stats:', error);
    res.status(500).json({ error: 'Failed to fetch tractor statistics' });
  }
});

// Получить обзор всех тракторов пользователя
router.get('/overview/dashboard', async (req, res) => {
  try {
    const overview = await Analytics.getUserOverview(req.user.userId);
    
    res.json({
      overview: overview,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    logger.error('Error fetching user overview:', error);
    res.status(500).json({ error: 'Failed to fetch overview' });
  }
});

module.exports = router;