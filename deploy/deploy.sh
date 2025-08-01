#!/bin/bash

# deploy.sh  
# Простой скрипт развертывания FleetMon на Ubuntu 22.04 VPS

set -e

# Цвета для вывода
RED='\033[0;31m'
GREEN='\033[0;32m' 
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
NC='\033[0m' # No Color

# Конфигурация
PROJECT_NAME="fleetmon"
DEPLOY_PATH="/opt/fleetmon"
NGINX_CONFIG_PATH="/etc/nginx/sites-available/fleetmon"
DOMAIN="your-domain.com"  # ЗАМЕНИТЬ НА РЕАЛЬНЫЙ ДОМЕН

# Внешний MQTT брокер (НЕ устанавливаем локально)
MQTT_HOST="m9.wqtt.ru"
MQTT_PORT="20264"
MQTT_TLS_PORT="20265"
MQTT_WS_TLS_PORT="20267"
MQTT_USER="u_MZEPA5"
MQTT_PASS="L3YAUTS6"

# Функции логирования
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_step() {
    echo -e "${PURPLE}[STEP]${NC} $1"
}

# Функция проверки статуса команды
check_status() {
    if [ $? -eq 0 ]; then
        log_success "$1"
    else
        log_error "$2"
        exit 1
    fi
}

# Проверка прав sudo
check_sudo() {
    if [ "$EUID" -ne 0 ]; then
        log_error "Этот скрипт должен запускаться с правами sudo"
        exit 1
    fi
}

# Проверка зависимостей для Ubuntu 22.04
check_dependencies() {
    log_step "Проверка зависимостей Ubuntu 22.04..."
    
    # Обновление пакетов
    log_info "Обновление пакетов системы..."
    apt-get update
    
    # Node.js 18.x
    if ! command -v node &> /dev/null; then
        log_info "Установка Node.js 18.x..."
        curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
        apt-get install -y nodejs
        check_status "Node.js установлен" "Ошибка установки Node.js"
    else
        NODE_VERSION=$(node --version)
        log_success "Node.js уже установлен: $NODE_VERSION"
    fi
    
    # PostgreSQL и TimescaleDB
    if ! command -v psql &> /dev/null; then
        log_info "Установка PostgreSQL и TimescaleDB..."
        apt-get install -y postgresql postgresql-contrib
        
        # Добавление репозитория TimescaleDB
        echo "deb https://packagecloud.io/timescale/timescaledb/ubuntu/ $(lsb_release -c -s) main" | tee /etc/apt/sources.list.d/timescaledb.list
        wget --quiet -O - https://packagecloud.io/timescale/timescaledb/gpgkey | apt-key add -
        apt-get update
        apt-get install -y timescaledb-2-postgresql-14
        
        # Настройка TimescaleDB
        timescaledb-tune --quiet --yes
        systemctl restart postgresql
        systemctl enable postgresql
        
        check_status "PostgreSQL и TimescaleDB установлены" "Ошибка установки PostgreSQL"
    else
        log_success "PostgreSQL уже установлен"
    fi
    
    # PM2 для управления Node.js приложениями
    if ! command -v pm2 &> /dev/null; then
        log_info "Установка PM2..."
        npm install -g pm2
        pm2 startup
        check_status "PM2 установлен" "Ошибка установки PM2"
    else
        log_success "PM2 уже установлен"
    fi
    
    # Git
    if ! command -v git &> /dev/null; then
        log_info "Установка Git..."
        apt-get install -y git
        check_status "Git установлен" "Ошибка установки Git"
    else
        log_success "Git уже установлен"
    fi
    
    # Nginx
    if ! command -v nginx &> /dev/null; then
        log_info "Установка Nginx..."
        apt-get install -y nginx
        systemctl enable nginx
        systemctl start nginx
        check_status "Nginx установлен" "Ошибка установки Nginx"
    else
        log_success "Nginx уже установлен"
    fi
    
    # Дополнительные пакеты
    log_info "Установка дополнительных пакетов..."
    apt-get install -y curl wget unzip build-essential
}

# Создание пользователя для приложения
create_app_user() {
    log_step "Создание пользователя приложения..."
    
    if ! id "fleetmon" &>/dev/null; then
        useradd -r -s /bin/bash -d $DEPLOY_PATH -m fleetmon
        log_success "Пользователь fleetmon создан"
    else
        log_success "Пользователь fleetmon уже существует"
    fi
}

# Обновление кода из GitHub (простой git pull)
deploy_code() {
    log_step "Обновление кода из GitHub..."
    
    if [ -d "$DEPLOY_PATH" ]; then
        log_info "Обновление существующего репозитория..."
        cd $DEPLOY_PATH
        
        # Сохранение локальных изменений если есть
        if [ -n "$(git status --porcelain)" ]; then
            log_warning "Найдены локальные изменения, создание stash..."
            git stash push -m "Auto stash before deploy $(date)"
        fi
        
        # Обновление из GitHub
        git fetch origin
        git reset --hard origin/main
        check_status "Код обновлен из GitHub" "Ошибка обновления кода"
        
        # Установка Node.js зависимостей
        if [ -f "backend/package.json" ]; then
            log_info "Установка backend зависимостей..."
            cd backend && npm install --production
            cd ..
        fi
        
        if [ -f "frontend/package.json" ]; then
            log_info "Установка frontend зависимостей..."
            cd frontend && npm install
            log_info "Сборка frontend..."
            npm run build
            cd ..
        fi
        
    else
        log_error "Директория проекта $DEPLOY_PATH не найдена!"
        log_info "Для первоначальной установки выполните:"
        log_info "git clone https://github.com/username/FleetMon.git $DEPLOY_PATH"
        exit 1
    fi
    
    # Установка прав на файлы
    chown -R $USER:$USER $DEPLOY_PATH
    chmod +x $DEPLOY_PATH/deploy/*.sh
}

# Обновление версии проекта
update_version() {
    log_step "Обновление версии проекта..."
    
    cd $DEPLOY_PATH
    
    # Создание резервной копии текущей версии
    if [ -f "version.json" ]; then
        sudo -u fleetmon ./deploy/backup-version.sh
    fi
    
    # Получение текущей версии
    CURRENT_VERSION=$(node -p "require('./version.json').version" 2>/dev/null || echo "0.0.0")
    
    # Инкремент версии (patch)
    IFS='.' read -ra VERSION_PARTS <<< "$CURRENT_VERSION"
    MAJOR=${VERSION_PARTS[0]}
    MINOR=${VERSION_PARTS[1]}
    PATCH=${VERSION_PARTS[2]}
    
    NEW_PATCH=$((PATCH + 1))
    NEW_VERSION="$MAJOR.$MINOR.$NEW_PATCH"
    
    # Обновление version.json
    sudo -u fleetmon node -e "
    const fs = require('fs');
    const version = require('./version.json');
    version.version = '$NEW_VERSION';
    version.lastUpdated = new Date().toISOString();
    version.build = (version.build || 0) + 1;
    fs.writeFileSync('./version.json', JSON.stringify(version, null, 2));
    "
    
    log_success "Версия обновлена: $CURRENT_VERSION → $NEW_VERSION"
}

# Настройка переменных окружения с внешним MQTT
setup_environment() {
    log_step "Настройка переменных окружения..."
    
    cd $DEPLOY_PATH
    
    # Создание .env файла если не существует
    if [ ! -f ".env" ]; then
        cat > .env << EOF
# FleetMon Production Environment

# Database
DATABASE_URL=postgresql://fleetmon:fleetmon_secure_pass@localhost:5432/fleetmon
POSTGRES_USER=fleetmon
POSTGRES_PASSWORD=fleetmon_secure_pass
POSTGRES_DB=fleetmon

# Внешний MQTT брокер wqtt.ru
MQTT_BROKER_HOST=$MQTT_HOST
MQTT_BROKER_PORT=$MQTT_PORT
MQTT_TLS_PORT=$MQTT_TLS_PORT  
MQTT_WS_TLS_PORT=$MQTT_WS_TLS_PORT
MQTT_USERNAME=$MQTT_USER
MQTT_PASSWORD=$MQTT_PASS
MQTT_USE_TLS=false

# Backend
NODE_ENV=production
PORT=3000
JWT_SECRET=fleetmon_jwt_secret_$(openssl rand -hex 32)
BCRYPT_ROUNDS=10

# Frontend  
REACT_APP_API_URL=http://$DOMAIN:3000/api
REACT_APP_WS_URL=ws://$DOMAIN:3000
REACT_APP_MAPBOX_TOKEN=your_mapbox_token_here

# Простая авторизация (начальный этап)
AUTH_SIMPLE=true
ADMIN_EMAIL=admin@fleetmon.local
ADMIN_PASSWORD=admin123

# Логирование
LOG_LEVEL=info
LOG_FILE=/var/log/fleetmon.log
EOF
        chmod 600 .env
        log_success "Создан файл .env с настройками внешнего MQTT"
        log_warning "ВАЖНО: Отредактируйте домен и Mapbox токен в .env файле!"
    else
        log_success "Файл .env уже существует"
    fi
}

# Настройка базы данных PostgreSQL
setup_database() {
    log_step "Настройка базы данных..."
    
    # Создание пользователя и базы данных
    sudo -u postgres psql << EOF
CREATE USER fleetmon WITH PASSWORD 'fleetmon_secure_pass';
CREATE DATABASE fleetmon OWNER fleetmon;
GRANT ALL PRIVILEGES ON DATABASE fleetmon TO fleetmon;
\q
EOF
    check_status "База данных создана" "Ошибка создания базы данных"
    
    # Инициализация схемы
    if [ -f "$DEPLOY_PATH/database/init.sql" ]; then
        log_info "Инициализация схемы базы данных..."
        sudo -u postgres psql -d fleetmon -f "$DEPLOY_PATH/database/init.sql"
        check_status "Схема базы данных инициализирована" "Ошибка инициализации схемы"
    fi
}

# Запуск приложений через PM2 (без Docker)
start_applications() {
    log_step "Запуск приложений через PM2..."
    
    cd $DEPLOY_PATH
    
    # Остановка старых процессов PM2
    pm2 delete fleetmon-backend 2>/dev/null || true
    pm2 delete fleetmon-frontend 2>/dev/null || true
    
    # Запуск backend
    if [ -f "backend/package.json" ]; then
        log_info "Запуск backend через PM2..."
        cd backend
        pm2 start npm --name "fleetmon-backend" -- start
        cd ..
        check_status "Backend запущен" "Ошибка запуска backend"
    fi
    
    # Запуск frontend (serve build)
    if [ -d "frontend/build" ]; then
        log_info "Запуск frontend через PM2..."
        cd frontend
        npm install -g serve
        pm2 start serve --name "fleetmon-frontend" -- -s build -l 3001
        cd ..
        check_status "Frontend запущен" "Ошибка запуска frontend"
    fi
    
    # Сохранение конфигурации PM2
    pm2 save
    
    # Ожидание запуска сервисов
    log_info "Ожидание запуска сервисов..."
    sleep 10
    
    # Показать статус PM2
    pm2 status
}

# Настройка Nginx
setup_nginx() {
    log_step "Настройка Nginx..."
    
    # Создание конфигурации Nginx
    cat > $NGINX_CONFIG_PATH << EOF
upstream fleetmon_backend {
    server 127.0.0.1:3000;
}

upstream fleetmon_frontend {
    server 127.0.0.1:3001;
}

server {
    listen 80;
    server_name $DOMAIN www.$DOMAIN;
    
    # Redirect HTTP to HTTPS
    return 301 https://\$server_name\$request_uri;
}

server {
    listen 443 ssl http2;
    server_name $DOMAIN www.$DOMAIN;
    
    # SSL Configuration (настроить SSL сертификаты)
    ssl_certificate /etc/ssl/certs/fleetmon.crt;
    ssl_certificate_key /etc/ssl/private/fleetmon.key;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-RSA-AES256-GCM-SHA512:DHE-RSA-AES256-GCM-SHA512:ECDHE-RSA-AES256-GCM-SHA384:DHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;
    
    # Security headers
    add_header X-Frame-Options DENY;
    add_header X-Content-Type-Options nosniff;
    add_header X-XSS-Protection "1; mode=block";
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    
    # Frontend (React app)
    location / {
        proxy_pass http://fleetmon_frontend;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
    
    # Backend API
    location /api/ {
        proxy_pass http://fleetmon_backend;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
    
    # WebSocket для real-time обновлений
    location /socket.io/ {
        proxy_pass http://fleetmon_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
    
    # Gzip compression
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/plain text/css text/xml text/javascript application/javascript application/xml+rss application/json;
    
    # Static files caching
    location ~* \.(jpg|jpeg|png|gif|ico|css|js)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
EOF
    
    # Включение сайта
    ln -sf $NGINX_CONFIG_PATH /etc/nginx/sites-enabled/fleetmon
    
    # Тест конфигурации Nginx
    nginx -t
    check_status "Конфигурация Nginx корректна" "Ошибка в конфигурации Nginx"
    
    # Перезагрузка Nginx
    systemctl reload nginx
    check_status "Nginx перезагружен" "Ошибка перезагрузки Nginx"
}

# Проверка работоспособности
health_check() {
    log_step "Проверка работоспособности..."
    
    # Проверка статуса PM2
    log_info "Статус приложений PM2:"
    pm2 status
    
    # Проверка портов
    if netstat -tuln | grep -q ":3000"; then
        log_success "Backend доступен на порту 3000"
    else
        log_error "Backend недоступен на порту 3000"
    fi
    
    if netstat -tuln | grep -q ":3001"; then
        log_success "Frontend доступен на порту 3001"
    else
        log_error "Frontend недоступен на порту 3001"
    fi
    
    # Проверка базы данных
    if sudo -u postgres psql -d fleetmon -c "SELECT version();" > /dev/null 2>&1; then
        log_success "База данных доступна"
    else
        log_error "База данных недоступна"
    fi
    
    # Проверка HTTP ответа (с таймаутом)
    sleep 5
    if curl -s --max-time 10 -o /dev/null -w "%{http_code}" http://localhost:3000/api/health 2>/dev/null | grep -q "200"; then
        log_success "API отвечает корректно"
    else
        log_warning "API может быть недоступно (проверьте логи PM2)"
    fi
}

# Вывод информации о развертывании
deployment_info() {
    cd $DEPLOY_PATH
    CURRENT_VERSION=$(node -p "require('./version.json').version" 2>/dev/null || echo "unknown")
    
    echo
    log_success "=== РАЗВЕРТЫВАНИЕ ЗАВЕРШЕНО ==="
    echo -e "${GREEN}Проект:${NC} FleetMon"
    echo -e "${GREEN}Версия:${NC} $CURRENT_VERSION"
    echo -e "${GREEN}Домен:${NC} https://$DOMAIN"
    echo -e "${GREEN}Путь:${NC} $DEPLOY_PATH"
    echo -e "${GREEN}Пользователь:${NC} fleetmon"
    echo
    echo -e "${YELLOW}Следующие шаги:${NC}"
    echo "1. Настройте SSL сертификаты"
    echo "2. Отредактируйте .env файл с реальными данными"
    echo "3. Настройте DNS записи для домена"
    echo "4. Протестируйте все функции системы"
    echo
    echo -e "${BLUE}Полезные команды:${NC}"
    echo "  Логи: pm2 logs"
    echo "  Рестарт: pm2 restart all"
    echo "  Статус: pm2 status"
    echo "  Мониторинг: pm2 monit"
}

# Основная функция для простого деплоя
main() {
    log_info "Начало простого развертывания FleetMon на Ubuntu 22.04..."
    
    check_sudo
    check_dependencies
    deploy_code
    update_version
    setup_environment
    setup_database
    start_applications
    setup_nginx
    health_check
    deployment_info
    
    log_success "Развертывание FleetMon завершено успешно!"
}

# Функция для быстрого обновления (только код)
quick_update() {
    log_info "Быстрое обновление FleetMon (только код)..."
    
    deploy_code
    update_version
    
    # Перезапуск приложений
    cd $DEPLOY_PATH
    pm2 restart fleetmon-backend
    pm2 restart fleetmon-frontend
    
    health_check
    log_success "Быстрое обновление завершено!"
}

# Запуск основной функции
main "$@"