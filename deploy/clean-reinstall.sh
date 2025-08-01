#!/bin/bash

# Скрипт полной переустановки FleetMon на VPS
# Выполняется от имени root

set -e

echo "=== Полная переустановка FleetMon ==="

# Останавливаем все процессы PM2
echo "Остановка PM2 процессов..."
pm2 kill || true

# Удаляем пользователя fleetmon и все его данные
echo "Удаление пользователя fleetmon..."
userdel -r fleetmon || true
groupdel fleetmon || true

# Удаляем директорию проекта
echo "Удаление директории проекта..."
rm -rf /opt/fleetmon

# Пересоздаем директорию и клонируем проект
echo "Клонирование свежей версии проекта..."
mkdir -p /opt/fleetmon
git clone https://github.com/iForza/FleetMon.git /opt/fleetmon
cd /opt/fleetmon

# Делаем скрипты исполняемыми
chmod +x deploy/*.sh

# Запускаем установку зависимостей
echo "Запуск установки зависимостей..."
./deploy/install-dependencies.sh

echo "=== Переустановка завершена! ==="
echo "Теперь переключитесь на пользователя fleetmon и запустите деплой:"
echo "su - fleetmon"
echo "cd /opt/fleetmon"  
echo "cp .env.production .env"
echo "nano .env  # отредактируйте пароли"
echo "./deploy/deploy-vps.sh"