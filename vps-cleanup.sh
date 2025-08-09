#!/bin/bash

# vps-cleanup.sh
# Скрипт полной очистки VPS от FleetMon проекта
# Выполнять от имени root или с sudo

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
PROJECT_DIR="/opt/fleetmon"
DB_NAME="fleetmon"
DB_USER="fleetmon_user"
SYSTEM_USER="fleetmon"
NGINX_CONFIG="/etc/nginx/sites-available/fleetmon"
NGINX_LINK="/etc/nginx/sites-enabled/fleetmon"

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

# Проверка прав sudo
check_sudo() {
    if [ "$EUID" -ne 0 ]; then
        log_error "Этот скрипт должен запускаться с правами sudo"
        exit 1
    fi
}

# Подтверждение удаления
confirm_cleanup() {
    echo -e "${RED}⚠️  ВНИМАНИЕ! ⚠️${NC}"
    echo "Этот скрипт ПОЛНОСТЬЮ удалит все данные FleetMon:"
    echo "- Остановит все процессы PM2"
    echo "- Удалит базу данных и пользователя PostgreSQL"
    echo "- Удалит все файлы проекта и логи"
    echo "- Удалит конфигурации Nginx"
    echo "- Удалит системного пользователя fleetmon"
    echo ""
    echo -e "${YELLOW}ВСЕ ДАННЫЕ БУДУТ ПОТЕРЯНЫ НАВСЕГДА!${NC}"
    echo ""
    read -p "Вы уверены, что хотите продолжить? (введите 'YES' для подтверждения): " confirm
    
    if [ "$confirm" != "YES" ]; then
        log_info "Операция отменена пользователем"
        exit 0
    fi
}

# Остановка PM2 процессов
stop_pm2_processes() {
    log_step "Остановка PM2 процессов..."
    
    # Переключаемся на пользователя fleetmon для работы с PM2
    if id "$SYSTEM_USER" &>/dev/null; then
        sudo -u $SYSTEM_USER bash -c "
            cd $PROJECT_DIR 2>/dev/null || true
            pm2 stop all 2>/dev/null || true
            pm2 delete all 2>/dev/null || true
            pm2 kill 2>/dev/null || true
            pm2 unstartup 2>/dev/null || true
        " || true
        log_success "PM2 процессы остановлены"
    else
        log_warning "Пользователь $SYSTEM_USER не найден, пропускаем остановку PM2"
    fi
}

# Остановка Nginx
stop_nginx() {
    log_step "Остановка Nginx..."
    systemctl stop nginx || true
    systemctl disable nginx || true
    log_success "Nginx остановлен"
}

# Удаление конфигураций Nginx
remove_nginx_config() {
    log_step "Удаление конфигураций Nginx..."
    
    if [ -L "$NGINX_LINK" ]; then
        rm -f "$NGINX_LINK"
        log_info "Удалена ссылка $NGINX_LINK"
    fi
    
    if [ -f "$NGINX_CONFIG" ]; then
        rm -f "$NGINX_CONFIG"
        log_info "Удален конфиг $NGINX_CONFIG"
    fi
    
    log_success "Конфигурации Nginx удалены"
}

# Удаление базы данных PostgreSQL
remove_database() {
    log_step "Удаление базы данных PostgreSQL..."
    
    if systemctl is-active --quiet postgresql; then
        # Остановка соединений к базе данных
        sudo -u postgres psql -c "
            SELECT pg_terminate_backend(pg_stat_activity.pid)
            FROM pg_stat_activity
            WHERE pg_stat_activity.datname = '$DB_NAME'
            AND pid <> pg_backend_pid();
        " 2>/dev/null || true
        
        # Удаление базы данных
        sudo -u postgres dropdb "$DB_NAME" 2>/dev/null || true
        log_info "База данных $DB_NAME удалена"
        
        # Удаление пользователя
        sudo -u postgres dropuser "$DB_USER" 2>/dev/null || true
        log_info "Пользователь базы данных $DB_USER удален"
        
        log_success "База данных PostgreSQL очищена"
    else
        log_warning "PostgreSQL не запущен, пропускаем удаление БД"
    fi
}

# Удаление файлов проекта
remove_project_files() {
    log_step "Удаление файлов проекта..."
    
    if [ -d "$PROJECT_DIR" ]; then
        rm -rf "$PROJECT_DIR"
        log_info "Удалена директория $PROJECT_DIR"
    fi
    
    # Удаление логов в других возможных местах
    rm -rf /var/log/fleetmon* 2>/dev/null || true
    rm -rf /tmp/fleetmon* 2>/dev/null || true
    
    log_success "Файлы проекта удалены"
}

# Удаление системного пользователя
remove_system_user() {
    log_step "Удаление системного пользователя..."
    
    if id "$SYSTEM_USER" &>/dev/null; then
        # Остановка всех процессов пользователя
        pkill -u "$SYSTEM_USER" || true
        sleep 2
        pkill -9 -u "$SYSTEM_USER" || true
        
        # Удаление пользователя
        userdel -r "$SYSTEM_USER" 2>/dev/null || true
        log_info "Пользователь $SYSTEM_USER удален"
        
        # Удаление группы если существует
        groupdel "$SYSTEM_USER" 2>/dev/null || true
        
        log_success "Системный пользователь удален"
    else
        log_warning "Пользователь $SYSTEM_USER не существует"
    fi
}

# Очистка глобальных Node.js пакетов
cleanup_global_packages() {
    log_step "Очистка глобальных Node.js пакетов..."
    
    # Удаление PM2 если установлен глобально
    npm uninstall -g pm2 2>/dev/null || true
    
    # Удаление serve если установлен глобально  
    npm uninstall -g serve 2>/dev/null || true
    
    log_success "Глобальные пакеты очищены"
}

# Очистка systemd сервисов
cleanup_systemd() {
    log_step "Очистка systemd сервисов..."
    
    # Остановка и отключение возможных сервисов
    systemctl stop fleetmon* 2>/dev/null || true
    systemctl disable fleetmon* 2>/dev/null || true
    
    # Удаление файлов сервисов
    rm -f /etc/systemd/system/fleetmon* 2>/dev/null || true
    rm -f /lib/systemd/system/fleetmon* 2>/dev/null || true
    
    # Обновление systemd
    systemctl daemon-reload
    
    log_success "Systemd сервисы очищены"
}

# Очистка cron задач
cleanup_cron() {
    log_step "Очистка cron задач..."
    
    # Удаление cron задач для пользователя fleetmon
    crontab -u root -l 2>/dev/null | grep -v fleetmon | crontab -u root - 2>/dev/null || true
    
    # Удаление файлов cron
    rm -f /etc/cron.d/fleetmon* 2>/dev/null || true
    
    log_success "Cron задачи очищены"
}

# Очистка временных файлов и кеша
cleanup_temp_files() {
    log_step "Очистка временных файлов..."
    
    # Очистка npm кеша
    npm cache clean --force 2>/dev/null || true
    
    # Очистка системного кеша
    apt clean || true
    apt autoremove -y || true
    
    # Очистка логов
    journalctl --vacuum-time=1d || true
    
    log_success "Временные файлы очищены"
}

# Проверка остатков
check_cleanup_result() {
    log_step "Проверка результатов очистки..."
    
    local issues=0
    
    # Проверка процессов
    if pgrep -f "fleetmon" >/dev/null 2>&1; then
        log_warning "Найдены запущенные процессы FleetMon"
        pgrep -f "fleetmon" || true
        issues=$((issues + 1))
    fi
    
    # Проверка файлов
    if [ -d "$PROJECT_DIR" ]; then
        log_warning "Директория проекта все еще существует: $PROJECT_DIR"
        issues=$((issues + 1))
    fi
    
    # Проверка пользователя
    if id "$SYSTEM_USER" &>/dev/null; then
        log_warning "Пользователь $SYSTEM_USER все еще существует"
        issues=$((issues + 1))
    fi
    
    # Проверка базы данных
    if sudo -u postgres psql -lqt 2>/dev/null | cut -d \| -f 1 | grep -qw "$DB_NAME"; then
        log_warning "База данных $DB_NAME все еще существует"
        issues=$((issues + 1))
    fi
    
    if [ $issues -eq 0 ]; then
        log_success "Очистка выполнена полностью! ✅"
    else
        log_warning "Очистка завершена с $issues предупреждениями"
        echo "Проверьте предупреждения выше и при необходимости выполните очистку вручную"
    fi
}

# Основная функция
main() {
    echo "=== ПОЛНАЯ ОЧИСТКА VPS ОТ FLEETMON ==="
    echo ""
    
    check_sudo
    confirm_cleanup
    
    echo ""
    log_info "Начинаем полную очистку системы..."
    echo ""
    
    stop_pm2_processes
    stop_nginx
    remove_nginx_config
    remove_database
    remove_project_files
    remove_system_user
    cleanup_global_packages
    cleanup_systemd
    cleanup_cron
    cleanup_temp_files
    
    echo ""
    check_cleanup_result
    
    echo ""
    echo "=== ОЧИСТКА ЗАВЕРШЕНА ==="
    echo ""
    echo -e "${GREEN}VPS готов для чистой установки FleetMon${NC}"
    echo "Теперь можете запустить скрипт vps-install.sh"
    echo ""
}

# Запуск скрипта
main "$@"
