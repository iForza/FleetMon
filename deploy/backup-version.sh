#!/bin/bash

# backup-version.sh
# Скрипт для создания резервной копии текущей версии проекта

set -e

# Цвета для вывода
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Функция для логирования
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

# Проверка что мы в корне проекта
if [ ! -f "version.json" ]; then
    log_error "version.json не найден. Убедитесь что вы находитесь в корне проекта FleetMon"
    exit 1
fi

# Чтение текущей версии
CURRENT_VERSION=$(node -p "require('./version.json').version")
log_info "Текущая версия проекта: $CURRENT_VERSION"

# Создание папки versions если не существует
mkdir -p versions

# Создание папки для текущей версии
VERSION_DIR="versions/v$CURRENT_VERSION"

if [ -d "$VERSION_DIR" ]; then
    log_warning "Резервная копия версии $CURRENT_VERSION уже существует"
    read -p "Перезаписать? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        log_info "Отменено пользователем"
        exit 0
    fi
    rm -rf "$VERSION_DIR"
fi

log_info "Создание резервной копии в $VERSION_DIR..."

# Создание папки версии
mkdir -p "$VERSION_DIR"

# Копирование основных файлов и папок
cp -r esp32-firmware "$VERSION_DIR/" 2>/dev/null || true
cp -r backend "$VERSION_DIR/" 2>/dev/null || true  
cp -r frontend "$VERSION_DIR/" 2>/dev/null || true
cp -r database "$VERSION_DIR/" 2>/dev/null || true
cp -r .github "$VERSION_DIR/" 2>/dev/null || true

# Копирование конфигурационных файлов
cp version.json "$VERSION_DIR/"
cp CHANGELOG.md "$VERSION_DIR/"
cp README.md "$VERSION_DIR/"
cp .env "$VERSION_DIR/" 2>/dev/null || true

# Создание метаинформации о бэкапе
cat > "$VERSION_DIR/backup-info.json" << EOF
{
  "version": "$CURRENT_VERSION",
  "backupDate": "$(date -u +"%Y-%m-%dT%H:%M:%S.%3NZ")",
  "gitCommit": "$(git rev-parse HEAD 2>/dev/null || echo 'unknown')",
  "gitBranch": "$(git branch --show-current 2>/dev/null || echo 'unknown')",
  "hostname": "$(hostname)",
  "user": "$(whoami)",
  "nodeVersion": "$(node --version 2>/dev/null || echo 'unknown')",
  "backupSize": "$(du -sh "$VERSION_DIR" | cut -f1)"
}
EOF

# Подсчет размера бэкапа
BACKUP_SIZE=$(du -sh "$VERSION_DIR" | cut -f1)

log_success "Резервная копия версии $CURRENT_VERSION создана успешно"
log_info "Расположение: $VERSION_DIR"
log_info "Размер: $BACKUP_SIZE"

# Показать содержимое бэкапа
log_info "Содержимое резервной копии:"
ls -la "$VERSION_DIR" | while read line; do
    echo "  $line"
done

# Очистка старых бэкапов (оставляем последние 10)
log_info "Проверка старых резервных копий..."
cd versions
BACKUP_COUNT=$(ls -1d v*/ 2>/dev/null | wc -l)

if [ "$BACKUP_COUNT" -gt 10 ]; then
    log_warning "Найдено $BACKUP_COUNT резервных копий, удаляем старые..."
    ls -1td v*/ | tail -n +11 | while read old_backup; do
        log_info "Удаление старой резервной копии: $old_backup"
        rm -rf "$old_backup"
    done
    log_success "Очистка завершена, оставлено 10 последних версий"
fi

cd ..

log_success "Процесс создания резервной копии завершен успешно!"

# Опционально: создать архив
read -p "Создать tar.gz архив? (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    log_info "Создание архива..."
    tar -czf "versions/fleetmon-v$CURRENT_VERSION.tar.gz" -C "$VERSION_DIR" .
    ARCHIVE_SIZE=$(du -sh "versions/fleetmon-v$CURRENT_VERSION.tar.gz" | cut -f1)
    log_success "Архив создан: versions/fleetmon-v$CURRENT_VERSION.tar.gz ($ARCHIVE_SIZE)"
fi

echo
log_info "=== СТАТИСТИКА РЕЗЕРВНЫХ КОПИЙ ==="
echo "Всего версий: $(ls -1d versions/v*/ 2>/dev/null | wc -l)"
echo "Общий размер папки versions: $(du -sh versions 2>/dev/null | cut -f1 || echo '0')"
echo "Архивы: $(ls -1 versions/*.tar.gz 2>/dev/null | wc -l)"