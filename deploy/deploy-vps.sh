#!/bin/bash

# Скрипт деплоя на VPS Ubuntu 22.04
# Выполняется на VPS от имени пользователя fleetmon

set -e

PROJECT_DIR="/opt/fleetmon"
REPO_URL="https://github.com/iForza/FleetMon.git"

echo "=== Деплой FleetMon на VPS ==="

# Переходим в рабочую директорию
cd $PROJECT_DIR

# Останавливаем приложение если оно запущено
echo "Остановка приложения..."
pm2 stop all || true

# Обновляем код из репозитория
echo "Обновление кода из GitHub..."
if [ -d ".git" ]; then
    git pull origin main
else
    # Если это первый деплой
    git clone $REPO_URL .
fi

# Устанавливаем зависимости backend
echo "Установка зависимостей backend..."
cd backend
npm install --production
cd ..

# Устанавливаем зависимости frontend
echo "Установка зависимостей frontend..."
cd frontend
npm install
cd ..

# Проверяем конфигурацию
if [ ! -f ".env.production" ]; then
    echo "ВНИМАНИЕ: Файл .env.production не найден!"
    echo "Скопируйте .env.example в .env.production и настройте параметры"
    cp .env.example .env.production
    echo "Файл .env.production создан. Отредактируйте его перед продолжением."
    exit 1
fi

# Инициализируем базу данных (только при первом деплое)
echo "Инициализация базы данных..."
PGPASSWORD=$(grep DB_PASSWORD .env.production | cut -d'=' -f2) psql -h localhost -U fleetmon_user -d fleetmon -f database/init.sql || echo "База данных уже инициализирована"

# Собираем frontend
echo "Сборка frontend..."
cd frontend
npm run build
cd ..

# Запускаем приложение через PM2
echo "Запуск приложения..."
pm2 start ecosystem.config.js

# Сохраняем конфигурацию PM2
pm2 save

echo "=== Деплой завершен успешно! ==="
echo ""
echo "Приложение доступно по адресам:"
echo "Backend: http://$(curl -s ifconfig.me):3000"
echo "Frontend: http://$(curl -s ifconfig.me):3001"
echo ""
echo "Управление приложением:"
echo "pm2 status        - статус приложений"
echo "pm2 logs          - логи"
echo "pm2 restart all   - перезапуск"
echo "pm2 stop all      - остановка"