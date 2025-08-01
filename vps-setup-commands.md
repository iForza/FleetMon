# Команды для подготовки VPS

## 1. Подключение к серверу
```bash
ssh root@147.45.213.22
# Пароль: v_z1gHA,n-We@U
```

## 2. Первоначальная настройка системы
```bash
# Обновление системы
apt update && apt upgrade -y

# Установка базовых утилит
apt install -y curl wget git unzip htop nano

# Проверка версии Ubuntu
lsb_release -a
```

## 3. Установка зависимостей FleetMon
```bash
# Скачиваем и запускаем скрипт установки
curl -o install-deps.sh https://raw.githubusercontent.com/iForza/FleetMon/main/deploy/install-dependencies.sh
chmod +x install-deps.sh
./install-deps.sh
```

## 4. После установки зависимостей
```bash
# Выполните команду, которую выведет скрипт для настройки PM2 autostart
# Она будет похожа на:
# sudo env PATH=$PATH:/usr/bin /usr/lib/node_modules/pm2/bin/pm2 startup systemd -u fleetmon --hp /opt/fleetmon

# Переключаемся на пользователя fleetmon
su - fleetmon

# Переходим в рабочую директорию
cd /opt/fleetmon

# Клонируем проект
git clone https://github.com/iForza/FleetMon.git .
```

## 5. Настройка окружения
```bash
# Копируем конфигурацию
cp .env.production .env

# Редактируем настройки (замените пароли!)
nano .env

# Важно изменить:
# DB_PASSWORD=your_secure_password_here
# JWT_SECRET=your_random_jwt_secret_here
# FRONTEND_URL=http://147.45.213.22:3001
# REACT_APP_BACKEND_URL=http://147.45.213.22:3000
```

## 6. Финальный деплой
```bash
# Запускаем скрипт деплоя
./deploy/deploy-vps.sh
```

## 7. Проверка работы
```bash
# Статус приложений
pm2 status

# Логи
pm2 logs

# Проверка портов
netstat -tlnp | grep :300
```

## Доступ к приложению
- Backend API: http://147.45.213.22:3000
- Frontend: http://147.45.213.22:3001

## Управление
```bash
pm2 restart all    # Перезапуск
pm2 stop all       # Остановка  
pm2 start all      # Запуск
pm2 logs           # Логи
pm2 monit          # Мониторинг
```