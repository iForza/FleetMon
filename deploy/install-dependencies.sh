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

# Добавляем TimescaleDB в конфигурацию PostgreSQL
echo "Настройка shared_preload_libraries для TimescaleDB..."
echo "shared_preload_libraries = 'timescaledb'" >> /etc/postgresql/14/main/postgresql.conf

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

# Перезапускаем PostgreSQL чтобы загрузить TimescaleDB
echo "Перезапуск PostgreSQL для загрузки TimescaleDB..."
systemctl restart postgresql

# Ждем запуска сервера
sleep 5

# Создаем базу данных и пользователя
echo "Создание базы данных и пользователя..."
sudo -u postgres psql << EOF
CREATE USER fleetmon_user WITH PASSWORD 'fleetmon_secure_password_2024';
CREATE DATABASE fleetmon OWNER fleetmon_user;
GRANT ALL PRIVILEGES ON DATABASE fleetmon TO fleetmon_user;
\c fleetmon
CREATE EXTENSION IF NOT EXISTS timescaledb;
CREATE EXTENSION IF NOT EXISTS postgis;
\q
EOF

# Проверяем что расширения установились
echo "Проверка установленных расширений..."
sudo -u postgres psql -d fleetmon -c "\dx"

# Настраиваем файрвол
echo "Настройка файрвола..."
ufw allow 22
ufw allow 3000
ufw allow 3001
ufw --force enable

# Настраиваем автозапуск PM2
echo "Настройка автозапуска PM2..."
PM2_STARTUP_CMD=$(sudo -u fleetmon pm2 startup systemd -u fleetmon --hp /opt/fleetmon | grep "sudo env")

if [ ! -z "$PM2_STARTUP_CMD" ]; then
    echo "Выполнение команды PM2 startup..."
    eval $PM2_STARTUP_CMD
    echo "PM2 autostart настроен успешно!"
else
    echo "ВНИМАНИЕ: Выполните вручную команду PM2 startup, которая будет выведена выше"
fi

echo "=== Установка зависимостей завершена успешно! ==="
echo ""
echo "Следующие шаги:"
echo "1. Переключитесь на пользователя fleetmon: su - fleetmon"
echo "2. Перейдите в директорию: cd /opt/fleetmon"
echo "3. Настройте .env файл: cp .env.production .env && nano .env"
echo "4. Запустите деплой: ./deploy/deploy-vps.sh"
echo ""
echo "Данные для подключения к БД:"
echo "Host: localhost"
echo "Port: 5432"
echo "Database: fleetmon"
echo "User: fleetmon_user"
echo "Password: fleetmon_secure_password_2024"