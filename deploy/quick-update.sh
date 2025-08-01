#!/bin/bash

# quick-update.sh
# Быстрое обновление FleetMon через git pull (для ежедневного использования)

set -e

# Цвета для вывода
RED='\033[0;31m'
GREEN='\033[0;32m' 
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Конфигурация
DEPLOY_PATH="/opt/fleetmon"

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

# Проверка что мы в правильной директории
check_directory() {
    if [ ! -d "$DEPLOY_PATH" ]; then
        log_error "Директория проекта $DEPLOY_PATH не найдена!"
        log_info "Выполните полную установку сначала: ./deploy/deploy.sh"
        exit 1
    fi
    
    cd $DEPLOY_PATH
    log_info "Находимся в: $(pwd)"
}

# Обновление кода
update_code() {
    log_info "Обновление кода из GitHub..."
    
    # Проверка изменений
    git fetch origin
    LOCAL=$(git rev-parse HEAD)
    REMOTE=$(git rev-parse origin/main)
    
    if [ "$LOCAL" = "$REMOTE" ]; then
        log_success "Код уже актуальный, обновление не требуется"
        return 0
    fi
    
    log_info "Найдены новые изменения, обновляем..."
    
    # Сохранение локальных изменений если есть
    if [ -n "$(git status --porcelain)" ]; then
        log_warning "Найдены локальные изменения, создание stash..."
        git stash push -m "Auto stash before update $(date)"
    fi
    
    # Обновление
    git reset --hard origin/main
    log_success "Код обновлен"
    
    # Показать что изменилось
    log_info "Изменения:"
    git log --oneline $LOCAL..HEAD | head -5
}

# Обновление зависимостей если нужно
update_dependencies() {
    # Backend зависимости
    if [ -f "backend/package.json" ] && [ -f "backend/package-lock.json" ]; then
        BACKEND_CHANGED=$(git diff --name-only $LOCAL..HEAD | grep "backend/package" || true)
        if [ -n "$BACKEND_CHANGED" ]; then
            log_info "Обновление backend зависимостей..."
            cd backend && npm install --production
            cd ..
        fi
    fi
    
    # Frontend зависимости и сборка
    if [ -f "frontend/package.json" ]; then
        FRONTEND_CHANGED=$(git diff --name-only $LOCAL..HEAD | grep -E "(frontend/package|frontend/src)" || true)
        if [ -n "$FRONTEND_CHANGED" ]; then
            log_info "Обновление frontend зависимостей и сборка..."
            cd frontend
            npm install
            npm run build
            cd ..
        fi
    fi
}

# Обновление версии
update_version() {
    if [ -f "version.json" ]; then
        CURRENT_VERSION=$(node -p "require('./version.json').version" 2>/dev/null || echo "unknown")
        log_info "Текущая версия: $CURRENT_VERSION"
        
        # Можно добавить логику инкремента версии при необходимости
    fi
}

# Перезапуск сервисов
restart_services() {
    log_info "Перезапуск сервисов PM2..."
    
    # Проверка что PM2 процессы существуют
    if pm2 list | grep -q "fleetmon-backend"; then
        pm2 restart fleetmon-backend
        log_success "Backend перезапущен"
    else
        log_warning "Backend процесс не найден в PM2"
    fi
    
    if pm2 list | grep -q "fleetmon-frontend"; then
        pm2 restart fleetmon-frontend  
        log_success "Frontend перезапущен"
    else
        log_warning "Frontend процесс не найден в PM2"
    fi
    
    # Сохранение конфигурации PM2
    pm2 save
}

# Проверка работоспособности
health_check() {
    log_info "Проверка работоспособности..."
    
    # Ждем запуска
    sleep 5
    
    # Проверка портов
    if netstat -tuln | grep -q ":3000"; then
        log_success "Backend доступен на порту 3000"
    else
        log_error "Backend недоступен на порту 3000"
        return 1
    fi
    
    if netstat -tuln | grep -q ":3001"; then
        log_success "Frontend доступен на порту 3001"
    else
        log_error "Frontend недоступен на порту 3001"
        return 1
    fi
    
    # Проверка API
    if curl -s --max-time 10 http://localhost:3000/api/health > /dev/null 2>&1; then
        log_success "API отвечает корректно"
    else
        log_warning "API может быть недоступно"
    fi
    
    log_success "Система работает нормально"
}

# Показать статус
show_status() {
    echo
    log_info "=== СТАТУС СИСТЕМЫ ==="
    echo "Время обновления: $(date)"
    echo "Путь: $DEPLOY_PATH"
    echo "Git commit: $(git rev-parse --short HEAD)"
    echo "Git branch: $(git branch --show-current)"
    echo
    echo "PM2 процессы:"
    pm2 status
    echo
    log_info "Логи: pm2 logs"
    log_info "Мониторинг: pm2 monit"
}

# Основная функция
main() {
    echo
    log_info "🚀 Быстрое обновление FleetMon"
    echo
    
    check_directory
    
    # Сохраняем текущий коммит для сравнения
    LOCAL=$(git rev-parse HEAD)
    
    update_code
    update_dependencies  
    update_version
    restart_services
    health_check
    show_status
    
    echo
    log_success "✅ Обновление FleetMon завершено успешно!"
    echo
}

# Проверка аргументов командной строки
case "${1:-}" in
    --help|-h)
        echo "Использование: $0 [--help]"
        echo "Быстрое обновление FleetMon из GitHub репозитория"
        echo ""
        echo "Что делает скрипт:"
        echo "  1. Обновляет код через git pull"
        echo "  2. Устанавливает новые зависимости если нужно"
        echo "  3. Перезапускает PM2 процессы"  
        echo "  4. Проверяет работоспособность"
        echo ""
        echo "Примеры:"
        echo "  $0           # Обычное обновление"
        echo "  $0 --help    # Показать эту справку"
        exit 0
        ;;
    *)
        main "$@"
        ;;
esac