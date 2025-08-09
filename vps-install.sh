#!/bin/bash

# vps-install.sh
# Скрипт полной установки и развертывания FleetMon на чистом Ubuntu 22.04 VPS
# Выполнять от имени root или с sudo

set -e

# Цвета для вывода
RED='\033[0;31m'
GREEN='\033[0;32m' 
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
NC='\033[0m' # No Color

# Конфигурация проекта
PROJECT_NAME="fleetmon"
PROJECT_DIR="/opt/fleetmon"
SYSTEM_USER="fleetmon"
DB_NAME="fleetmon"
DB_USER="fleetmon_user"
DB_PASSWORD="FleetMon2024SecurePass!"
JWT_SECRET="FleetMon_JWT_Secret_2024_$(openssl rand -hex 32)"

# GitHub репозиторий
REPO_URL="https://github.com/iForza/FleetMon.git"
REPO_BRANCH="main"

# Внешний MQTT брокер (НЕ устанавливаем локально!)
MQTT_HOST="m9.wqtt.ru"
MQTT_PORT="20264"
MQTT_TLS_PORT="20265"
MQTT_WS_TLS_PORT="20267"
MQTT_USER="u_MZEPA5"
MQTT_PASS="L3YAUTS6"

# Порты приложения
BACKEND_PORT="3000"
FRONTEND_PORT="3001"

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

# Проверка Ubuntu версии
check_ubuntu_version() {
    log_step "Проверка версии Ubuntu..."
    
    if ! grep -q "Ubuntu 22.04" /etc/os-release; then
        log_warning "Скрипт протестирован на Ubuntu 22.04. Текущая система:"
        cat /etc/os-release | grep PRETTY_NAME
        echo ""
        read -p "Продолжить установку? (y/N): " continue_install
        if [[ ! "$continue_install" =~ ^[Yy]$ ]]; then
            log_info "Установка отменена пользователем"
            exit 0
        fi
    fi
    
    log_success "Ubuntu версия проверена"
}

# Обновление системы
update_system() {
    log_step "Обновление системы..."
    
    export DEBIAN_FRONTEND=noninteractive
    apt update
    apt upgrade -y
    apt install -y curl wget git unzip htop nano lsb-release ca-certificates
    
    check_status "Система обновлена" "Ошибка обновления системы"
}

# Установка Node.js 18.x
install_nodejs() {
    log_step "Установка Node.js 18.x..."
    
    # Удаление старых версий Node.js
    apt remove -y nodejs npm 2>/dev/null || true
    
    # Установка Node.js 18.x через NodeSource
    curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
    apt install -y nodejs
    
    # Проверка версии
    node_version=$(node --version)
    npm_version=$(npm --version)
    
    log_info "Установлен Node.js: $node_version"
    log_info "Установлен npm: $npm_version"
    
    check_status "Node.js установлен" "Ошибка установки Node.js"
}

# Установка PostgreSQL и расширений
install_postgresql() {
    log_step "Установка PostgreSQL и расширений..."
    
    # Установка PostgreSQL
    apt install -y postgresql postgresql-contrib postgresql-client
    
    # Установка PostGIS
    apt install -y postgresql-14-postgis-3 postgresql-14-postgis-3-scripts
    
    # Установка TimescaleDB
    sh -c "echo 'deb https://packagecloud.io/timescale/timescaledb/ubuntu/ $(lsb_release -c -s) main' > /etc/apt/sources.list.d/timescaledb.list"
    wget --quiet -O - https://packagecloud.io/timescale/timescaledb/gpgkey | apt-key add -
    apt update
    apt install -y timescaledb-2-postgresql-14
    
    # Настройка TimescaleDB
    timescaledb-tune --quiet --yes
    
    # Добавление TimescaleDB в конфигурацию
    if ! grep -q "timescaledb" /etc/postgresql/14/main/postgresql.conf; then
        echo "shared_preload_libraries = 'timescaledb'" >> /etc/postgresql/14/main/postgresql.conf
    fi
    
    # Запуск PostgreSQL
    systemctl start postgresql
    systemctl enable postgresql
    
    check_status "PostgreSQL установлен" "Ошибка установки PostgreSQL"
}

# Настройка базы данных
setup_database() {
    log_step "Настройка базы данных..."
    
    # Создание пользователя базы данных
    sudo -u postgres psql -c "CREATE USER $DB_USER WITH PASSWORD '$DB_PASSWORD';" || true
    
    # Создание базы данных
    sudo -u postgres createdb -O $DB_USER $DB_NAME || true
    
    # Предоставление прав
    sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $DB_USER;"
    sudo -u postgres psql -c "ALTER USER $DB_USER CREATEDB;"
    
    # Создание расширений в базе данных
    sudo -u postgres psql -d $DB_NAME -c "CREATE EXTENSION IF NOT EXISTS timescaledb;"
    sudo -u postgres psql -d $DB_NAME -c "CREATE EXTENSION IF NOT EXISTS postgis;"
    sudo -u postgres psql -d $DB_NAME -c "CREATE EXTENSION IF NOT EXISTS \"uuid-ossp\";"
    
    check_status "База данных настроена" "Ошибка настройки базы данных"
}

# Установка PM2 и serve
install_pm2() {
    log_step "Установка PM2 и serve..."
    
    npm install -g pm2
    npm install -g serve
    
    check_status "PM2 и serve установлены" "Ошибка установки PM2"
}

# Установка и настройка Nginx
install_nginx() {
    log_step "Установка Nginx..."
    
    apt install -y nginx
    
    # Остановка Nginx (настроим позже)
    systemctl stop nginx
    
    check_status "Nginx установлен" "Ошибка установки Nginx"
}

# Создание системного пользователя
create_system_user() {
    log_step "Создание системного пользователя..."
    
    # Создание пользователя
    useradd -r -s /bin/bash -d $PROJECT_DIR -m $SYSTEM_USER || true
    
    # Создание директорий
    mkdir -p $PROJECT_DIR
    mkdir -p $PROJECT_DIR/logs
    
    # Установка прав
    chown -R $SYSTEM_USER:$SYSTEM_USER $PROJECT_DIR
    
    check_status "Пользователь создан" "Ошибка создания пользователя"
}

# Клонирование проекта
clone_project() {
    log_step "Клонирование проекта FleetMon..."
    
    # Переключение на пользователя fleetmon
    sudo -u $SYSTEM_USER bash -c "
        cd $PROJECT_DIR
        if [ -d '.git' ]; then
            git pull origin $REPO_BRANCH
        else
            git clone $REPO_URL .
            git checkout $REPO_BRANCH
        fi
    "
    
    check_status "Проект клонирован" "Ошибка клонирования проекта"
}

# Создание конфигурационного файла
create_env_config() {
    log_step "Создание конфигурационного файла..."
    
    # Получение IP сервера
    SERVER_IP=$(curl -s ifconfig.me || echo "localhost")
    
    cat > $PROJECT_DIR/.env.production << EOF
# FleetMon Production Environment Configuration

# Server
NODE_ENV=production
PORT=$BACKEND_PORT

# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=$DB_NAME
DB_USER=$DB_USER
DB_PASSWORD=$DB_PASSWORD
DB_SSL=false

# JWT
JWT_SECRET=$JWT_SECRET
JWT_EXPIRE=7d

# MQTT (внешний брокер wqtt.ru)
MQTT_HOST=$MQTT_HOST
MQTT_PORT=$MQTT_PORT
MQTT_TLS_PORT=$MQTT_TLS_PORT
MQTT_WS_TLS_PORT=$MQTT_WS_TLS_PORT
MQTT_USERNAME=$MQTT_USER
MQTT_PASSWORD=$MQTT_PASS
MQTT_USE_TLS=true

# URLs
FRONTEND_URL=http://$SERVER_IP:$FRONTEND_PORT
BACKEND_URL=http://$SERVER_IP:$BACKEND_PORT
REACT_APP_BACKEND_URL=http://$SERVER_IP:$BACKEND_PORT

# Logging
LOG_LEVEL=info
LOG_FILE=$PROJECT_DIR/logs/app.log

# Security
CORS_ORIGIN=http://$SERVER_IP:$FRONTEND_PORT
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# WebSocket
SOCKET_IO_CORS_ORIGIN=http://$SERVER_IP:$FRONTEND_PORT
EOF

    # Установка прав на файл
    chown $SYSTEM_USER:$SYSTEM_USER $PROJECT_DIR/.env.production
    chmod 600 $PROJECT_DIR/.env.production
    
    log_info "Конфигурация создана: $PROJECT_DIR/.env.production"
    log_info "Server IP: $SERVER_IP"
    
    check_status "Конфигурация создана" "Ошибка создания конфигурации"
}

# Установка зависимостей
install_dependencies() {
    log_step "Установка зависимостей..."
    
    sudo -u $SYSTEM_USER bash -c "
        cd $PROJECT_DIR
        
        # Backend зависимости
        echo 'Установка backend зависимостей...'
        cd backend
        npm install --production
        cd ..
        
        # Frontend зависимости
        echo 'Установка frontend зависимостей...'
        cd frontend
        npm install
        cd ..
    "
    
    check_status "Зависимости установлены" "Ошибка установки зависимостей"
}

# Инициализация базы данных
init_database() {
    log_step "Инициализация базы данных..."
    
    # Выполнение SQL скрипта инициализации
    if [ -f "$PROJECT_DIR/database/init.sql" ]; then
        PGPASSWORD="$DB_PASSWORD" psql -h localhost -U $DB_USER -d $DB_NAME -f $PROJECT_DIR/database/init.sql
        check_status "База данных инициализирована" "Ошибка инициализации базы данных"
    else
        log_warning "Файл init.sql не найден, пропускаем инициализацию базы данных"
    fi
}

# Сборка frontend
build_frontend() {
    log_step "Сборка frontend приложения..."
    
    sudo -u $SYSTEM_USER bash -c "
        cd $PROJECT_DIR/frontend
        npm run build
    "
    
    check_status "Frontend собран" "Ошибка сборки frontend"
}

# Настройка PM2 автозапуска
setup_pm2_startup() {
    log_step "Настройка автозапуска PM2..."
    
    # Генерация команды startup
    startup_cmd=$(sudo -u $SYSTEM_USER pm2 startup systemd | grep 'sudo env' || true)
    
    if [ -n "$startup_cmd" ]; then
        # Выполнение команды startup
        eval "$startup_cmd"
        log_success "PM2 автозапуск настроен"
    else
        log_warning "Не удалось настроить автозапуск PM2"
    fi
}

# Запуск приложения через PM2
start_application() {
    log_step "Запуск приложения через PM2..."
    
    sudo -u $SYSTEM_USER bash -c "
        cd $PROJECT_DIR
        
        # Остановка старых процессов
        pm2 delete all 2>/dev/null || true
        
        # Запуск через ecosystem.config.js
        pm2 start ecosystem.config.js
        
        # Сохранение конфигурации
        pm2 save
    "
    
    # Ожидание запуска
    sleep 5
    
    check_status "Приложение запущено" "Ошибка запуска приложения"
}

# Настройка Nginx
setup_nginx() {
    log_step "Настройка Nginx..."
    
    # Получение IP сервера
    SERVER_IP=$(curl -s ifconfig.me || echo "localhost")
    
    # Создание конфигурации Nginx
    cat > /etc/nginx/sites-available/fleetmon << EOF
upstream fleetmon_backend {
    server 127.0.0.1:$BACKEND_PORT;
}

upstream fleetmon_frontend {
    server 127.0.0.1:$FRONTEND_PORT;
}

server {
    listen 80;
    server_name $SERVER_IP;
    
    client_max_body_size 100M;
    
    # Frontend (React app)
    location / {
        proxy_pass http://fleetmon_frontend;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        
        # CORS headers
        add_header Access-Control-Allow-Origin *;
        add_header Access-Control-Allow-Methods 'GET, POST, OPTIONS, PUT, DELETE';
        add_header Access-Control-Allow-Headers 'Origin, X-Requested-With, Content-Type, Accept, Authorization';
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
}
EOF

    # Активация конфигурации
    ln -sf /etc/nginx/sites-available/fleetmon /etc/nginx/sites-enabled/
    rm -f /etc/nginx/sites-enabled/default
    
    # Проверка конфигурации
    nginx -t
    
    # Запуск Nginx
    systemctl start nginx
    systemctl enable nginx
    
    check_status "Nginx настроен" "Ошибка настройки Nginx"
}

# Проверка работы приложения
check_application() {
    log_step "Проверка работы приложения..."
    
    # Получение IP сервера
    SERVER_IP=$(curl -s ifconfig.me || echo "localhost")
    
    # Проверка PM2 статуса
    sudo -u $SYSTEM_USER pm2 status
    
    echo ""
    log_info "Проверка доступности сервисов..."
    
    # Проверка backend
    if curl -s http://localhost:$BACKEND_PORT/api/health >/dev/null 2>&1; then
        log_success "Backend доступен на порту $BACKEND_PORT"
    else
        log_warning "Backend может быть недоступен на порту $BACKEND_PORT"
    fi
    
    # Проверка frontend
    if curl -s http://localhost:$FRONTEND_PORT >/dev/null 2>&1; then
        log_success "Frontend доступен на порту $FRONTEND_PORT"
    else
        log_warning "Frontend может быть недоступен на порту $FRONTEND_PORT"
    fi
    
    echo ""
    log_success "=== УСТАНОВКА ЗАВЕРШЕНА! ==="
    echo ""
    echo "🌐 Приложение доступно по адресам:"
    echo "   Frontend: http://$SERVER_IP/"
    echo "   Backend:  http://$SERVER_IP/api/"
    echo ""
    echo "📊 Управление приложением:"
    echo "   sudo -u $SYSTEM_USER pm2 status    - статус приложений"
    echo "   sudo -u $SYSTEM_USER pm2 logs      - логи"
    echo "   sudo -u $SYSTEM_USER pm2 restart all - перезапуск"
    echo "   sudo -u $SYSTEM_USER pm2 stop all  - остановка"
    echo ""
    echo "🗂️ Важные файлы:"
    echo "   Проект:       $PROJECT_DIR"
    echo "   Конфигурация: $PROJECT_DIR/.env.production"
    echo "   Логи PM2:     $PROJECT_DIR/logs/"
    echo "   Логи Nginx:   /var/log/nginx/"
    echo ""
    echo "🔧 Дополнительные команды:"
    echo "   systemctl status nginx    - статус Nginx"
    echo "   systemctl status postgresql - статус базы данных"
    echo ""
}

# Основная функция
main() {
    echo "=== УСТАНОВКА FLEETMON НА UBUNTU 22.04 VPS ==="
    echo ""
    
    check_sudo
    check_ubuntu_version
    
    echo ""
    log_info "Начинаем установку FleetMon..."
    echo ""
    
    update_system
    install_nodejs
    install_postgresql
    setup_database
    install_pm2
    install_nginx
    create_system_user
    clone_project
    create_env_config
    install_dependencies
    init_database
    build_frontend
    setup_pm2_startup
    start_application
    setup_nginx
    
    echo ""
    check_application
}

# Обработчик прерывания
cleanup() {
    echo ""
    log_error "Установка прервана пользователем"
    exit 1
}

trap cleanup INT

# Запуск скрипта
main "$@"
