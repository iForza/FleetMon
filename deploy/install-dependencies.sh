#!/bin/bash

# Скрипт установки зависимостей для Ubuntu 22.04 VPS
# Выполняется от имени root или с sudo

set -e

echo "=== Установка зависимостей FleetMon на Ubuntu 22.04 ==="

# Обновляем систему
echo "Обновление системы..."
apt update && apt upgrade -y

# Устанавливаем Node.js 18.x
echo "Установка Node.js 18.x..."
curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
apt install -y nodejs

# Устанавливаем PostgreSQL и PostGIS
echo "Установка PostgreSQL и PostGIS..."
apt install -y postgresql postgresql-contrib postgresql-client
apt install -y postgresql-14-postgis-3 postgresql-14-postgis-3-scripts

# Устанавливаем TimescaleDB
echo "Установка TimescaleDB..."
sh -c "echo 'deb https://packagecloud.io/timescale/timescaledb/ubuntu/ $(lsb_release -c -s) main' > /etc/apt/sources.list.d/timescaledb.list"
wget --quiet -O - https://packagecloud.io/timescale/timescaledb/gpgkey | apt-key add -
apt update
apt install -y timescaledb-2-postgresql-14

# Настраиваем TimescaleDB
timescaledb-tune --quiet --yes

# Устанавливаем PM2 глобально
echo "Установка PM2..."
npm install -g pm2

# Устанавливаем serve для статического сервера
echo "Установка serve..."
npm install -g serve

# Создаем пользователя для приложения
echo "Создание пользователя fleetmon..."
useradd -r -s /bin/bash -d /opt/fleetmon fleetmon || true

# Создаем директории
echo "Создание директорий..."
mkdir -p /opt/fleetmon
mkdir -p /opt/fleetmon/logs
chown -R fleetmon:fleetmon /opt/fleetmon

# Настраиваем PostgreSQL
echo "Настройка PostgreSQL..."
systemctl start postgresql
systemctl enable postgresql

# Создаем базу данных и пользователя
sudo -u postgres psql << EOF
CREATE USER fleetmon_user WITH PASSWORD 'fleetmon_secure_password_2024';
CREATE DATABASE fleetmon OWNER fleetmon_user;
GRANT ALL PRIVILEGES ON DATABASE fleetmon TO fleetmon_user;
\c fleetmon
CREATE EXTENSION IF NOT EXISTS timescaledb;
CREATE EXTENSION IF NOT EXISTS postgis;
\q
EOF

# Настраиваем файрвол
echo "Настройка файрвола..."
ufw allow 22
ufw allow 3000
ufw allow 3001
ufw --force enable

# Настраиваем автозапуск PM2
echo "Настройка автозапуска PM2..."
sudo -u fleetmon pm2 startup systemd -u fleetmon --hp /opt/fleetmon
# Команда выше выведет команду для выполнения от root - её нужно будет выполнить

echo "=== Установка зависимостей завершена! ==="
echo ""
echo "Следующие шаги:"
echo "1. Скопируйте код проекта в /opt/fleetmon"
echo "2. Установите npm зависимости"
echo "3. Настройте .env файл"
echo "4. Инициализируйте базу данных"
echo "5. Соберите frontend"
echo "6. Запустите приложение через PM2"
echo ""
echo "Данные для подключения к БД:"
echo "Host: localhost"
echo "Port: 5432"
echo "Database: fleetmon"
echo "User: fleetmon_user"
echo "Password: fleetmon_secure_password_2024"