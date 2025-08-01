const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const { User } = require('../database/models');
const logger = require('../utils/logger');

const router = express.Router();

// Rate limiting для аутентификации (простой для начального этапа)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 минут
  max: 5, // максимум 5 попыток входа за 15 минут
  message: {
    error: 'Too many login attempts, please try again later'
  },
  standardHeaders: true,
  legacyHeaders: false
});

// Middleware для проверки JWT токена
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN
  
  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }
  
  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      logger.warn('Invalid token attempt', { token: token.substring(0, 20) + '...' });
      return res.status(403).json({ error: 'Invalid or expired token' });
    }
    
    req.user = user;
    next();
  });
};

// Регистрация нового пользователя (простая для начального этапа)
router.post('/register', async (req, res) => {
  try {
    const { email, password, first_name, last_name, company, phone } = req.body;
    
    // Простая валидация
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }
    
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters long' });
    }
    
    // Проверяем существует ли пользователь
    const existingUser = await User.findByEmail(email);
    if (existingUser) {
      return res.status(409).json({ error: 'User with this email already exists' });
    }
    
    // Хешируем пароль
    const saltRounds = parseInt(process.env.BCRYPT_ROUNDS) || 10;
    const password_hash = await bcrypt.hash(password, saltRounds);
    
    // Создаем пользователя
    const userData = {
      email: email.toLowerCase().trim(),
      password_hash,
      first_name: first_name || null,
      last_name: last_name || null,
      company: company || null,
      phone: phone || null
    };
    
    const newUser = await User.create(userData);
    
    // Создаем JWT токен
    const token = jwt.sign(
      { 
        userId: newUser.id, 
        email: newUser.email 
      },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );
    
    logger.info('New user registered', {
      userId: newUser.id,
      email: newUser.email,
      company: newUser.company
    });
    
    res.status(201).json({
      message: 'User registered successfully',
      user: {
        id: newUser.id,
        email: newUser.email,
        first_name: newUser.first_name,
        last_name: newUser.last_name,
        company: newUser.company
      },
      token
    });
    
  } catch (error) {
    logger.error('Registration error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// Вход пользователя
router.post('/login', authLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }
    
    // Находим пользователя
    const user = await User.findByEmail(email.toLowerCase().trim());
    if (!user) {
      logger.warn('Login attempt with non-existent email', { email });
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    // Проверяем пароль
    const isValidPassword = await bcrypt.compare(password, user.password_hash);
    if (!isValidPassword) {
      logger.warn('Login attempt with invalid password', { userId: user.id, email });
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    // Создаем JWT токен
    const token = jwt.sign(
      { 
        userId: user.id, 
        email: user.email 
      },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );
    
    logger.info('User logged in', {
      userId: user.id,
      email: user.email,
      ip: req.ip
    });
    
    res.json({
      message: 'Login successful',
      user: {
        id: user.id,
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
        company: user.company
      },
      token
    });
    
  } catch (error) {
    logger.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Получение информации о текущем пользователе
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json({
      user: {
        id: user.id,
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
        company: user.company,
        phone: user.phone,
        created_at: user.created_at
      }
    });
    
  } catch (error) {
    logger.error('Get user info error:', error);
    res.status(500).json({ error: 'Failed to get user information' });
  }
});

// Обновление профиля пользователя
router.put('/profile', authenticateToken, async (req, res) => {
  try {
    const { first_name, last_name, company, phone } = req.body;
    
    const updatedUser = await User.update(req.user.userId, {
      first_name,
      last_name,
      company,
      phone
    });
    
    if (!updatedUser) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    logger.info('User profile updated', {
      userId: req.user.userId,
      changes: { first_name, last_name, company, phone }
    });
    
    res.json({
      message: 'Profile updated successfully',
      user: updatedUser
    });
    
  } catch (error) {
    logger.error('Profile update error:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// Проверка токена (для frontend)
router.get('/verify', authenticateToken, (req, res) => {
  res.json({ 
    valid: true, 
    user: { 
      userId: req.user.userId, 
      email: req.user.email 
    } 
  });
});

// Выход (простая реализация - токен остается валидным до истечения)
router.post('/logout', authenticateToken, (req, res) => {
  logger.info('User logged out', {
    userId: req.user.userId,
    email: req.user.email
  });
  
  res.json({ message: 'Logged out successfully' });
});

// Экспортируем middleware для использования в других роутерах
router.authenticateToken = authenticateToken;

module.exports = router;