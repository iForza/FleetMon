# 🛠️ Руководство по полной очистке и переустановке FleetMon на VPS

## 📋 Описание

Данный набор скриптов предназначен для полной очистки VPS от FleetMon проекта и его чистой переустановки на Ubuntu 22.04.

## 📦 Включенные файлы

1. **`vps-cleanup.sh`** - Скрипт полной очистки системы
2. **`vps-install.sh`** - Скрипт установки и развертывания
3. **`VPS-RESET-GUIDE.md`** - Данное руководство

## ⚠️ ВНИМАНИЕ!

**СКРИПТ ОЧИСТКИ ПОЛНОСТЬЮ УДАЛИТ ВСЕ ДАННЫЕ FLEETMON:**
- Все файлы проекта
- Базу данных PostgreSQL
- Пользователя системы
- Конфигурации Nginx
- Процессы PM2
- Логи и временные файлы

**ВСЕ ДАННЫЕ БУДУТ ПОТЕРЯНЫ НАВСЕГДА!**

## 🚀 Пошаговая инструкция

### Шаг 1: Подключение к VPS

```bash
ssh root@ВАШ_IP_АДРЕС
```

### Шаг 2: Скачивание скриптов

```bash
# Скачайте скрипты на VPS
wget https://raw.githubusercontent.com/iForza/FleetMon/main/vps-cleanup.sh
wget https://raw.githubusercontent.com/iForza/FleetMon/main/vps-install.sh

# Или если файлы есть локально, скопируйте их:
# scp vps-cleanup.sh root@ВАШ_IP:/root/
# scp vps-install.sh root@ВАШ_IP:/root/
```

### Шаг 3: Установка прав выполнения

```bash
chmod +x vps-cleanup.sh
chmod +x vps-install.sh
```

### Шаг 4: Полная очистка системы

```bash
# ВНИМАНИЕ: Эта команда удалит ВСЕ данные FleetMon!
sudo ./vps-cleanup.sh
```

**В процессе очистки скрипт:**
- Попросит подтверждение (введите `YES`)
- Остановит все процессы PM2
- Удалит базу данных PostgreSQL
- Удалит все файлы проекта
- Удалит системного пользователя fleetmon
- Очистит конфигурации Nginx
- Удалит systemd сервисы
- Очистит временные файлы

### Шаг 5: Чистая установка

```bash
# Устанавливаем FleetMon на чистой системе
sudo ./vps-install.sh
```

**В процессе установки скрипт:**
- Обновит систему Ubuntu 22.04
- Установит Node.js 18.x
- Установит PostgreSQL + TimescaleDB + PostGIS
- Установит PM2 и Nginx
- Создаст пользователя fleetmon
- Клонирует проект из GitHub
- Установит все зависимости
- Инициализирует базу данных
- Соберет frontend приложение
- Настроит автозапуск через PM2
- Настроит Nginx reverse proxy

### Шаг 6: Проверка работы

После успешной установки:

```bash
# Проверка статуса приложений
sudo -u fleetmon pm2 status

# Проверка логов
sudo -u fleetmon pm2 logs

# Проверка Nginx
systemctl status nginx

# Проверка PostgreSQL
systemctl status postgresql
```

## 🌐 Доступ к приложению

После установки FleetMon будет доступен по адресам:

- **Frontend**: `http://ВАШ_IP_АДРЕС/`
- **Backend API**: `http://ВАШ_IP_АДРЕС/api/`
- **Backend прямой**: `http://ВАШ_IP_АДРЕС:3000`
- **Frontend прямой**: `http://ВАШ_IP_АДРЕС:3001`

## 📁 Структура после установки

```
/opt/fleetmon/                    # Основная директория проекта
├── backend/                      # Node.js backend
├── frontend/                     # React frontend
├── database/                     # SQL схемы
├── logs/                         # Логи PM2
├── .env.production              # Конфигурация production
└── ecosystem.config.js          # Конфигурация PM2
```

## 🎛️ Управление приложением

### PM2 команды:
```bash
sudo -u fleetmon pm2 status       # Статус процессов
sudo -u fleetmon pm2 logs         # Просмотр логов
sudo -u fleetmon pm2 restart all  # Перезапуск всех процессов
sudo -u fleetmon pm2 stop all     # Остановка всех процессов
sudo -u fleetmon pm2 start all    # Запуск всех процессов
```

### Nginx команды:
```bash
systemctl status nginx            # Статус Nginx
systemctl restart nginx           # Перезапуск Nginx
nginx -t                          # Проверка конфигурации
```

### PostgreSQL команды:
```bash
systemctl status postgresql       # Статус базы данных
sudo -u postgres psql -d fleetmon # Подключение к базе
```

## 🔧 Важные файлы конфигурации

1. **`.env.production`** - основная конфигурация приложения
2. **`ecosystem.config.js`** - конфигурация PM2
3. **`/etc/nginx/sites-available/fleetmon`** - конфигурация Nginx

## 🔐 Безопасность

Скрипт автоматически генерирует:
- Уникальный JWT secret
- Безопасный пароль базы данных
- Правильные права доступа к файлам

## 📝 Логи

Логи приложения находятся в:
- **PM2 логи**: `/opt/fleetmon/logs/`
- **Nginx логи**: `/var/log/nginx/`
- **PostgreSQL логи**: `/var/log/postgresql/`

## 🆘 Решение проблем

### Если установка прервалась:
1. Запустите очистку: `sudo ./vps-cleanup.sh`
2. Повторите установку: `sudo ./vps-install.sh`

### Если приложение не запускается:
```bash
# Проверьте логи PM2
sudo -u fleetmon pm2 logs

# Проверьте статус базы данных
systemctl status postgresql

# Проверьте конфигурацию Nginx
nginx -t
```

### Если нет доступа к приложению:
```bash
# Проверьте открытые порты
ss -tlnp | grep -E ':(80|3000|3001)'

# Проверьте firewall (если установлен)
ufw status
```

## 📞 Поддержка

При возникновении проблем:
1. Проверьте логи приложения
2. Убедитесь, что все сервисы запущены
3. Проверьте сетевые настройки
4. При необходимости повторите полную переустановку

## 🔄 Обновление проекта

Для обновления проекта из GitHub:

```bash
sudo -u fleetmon bash -c "
cd /opt/fleetmon
git pull origin main
cd backend && npm install --production
cd ../frontend && npm install && npm run build
"
sudo -u fleetmon pm2 restart all
```

---

**Автор**: Система FleetMon
**Версия**: 1.0.0
**Дата**: 2025-01-02
