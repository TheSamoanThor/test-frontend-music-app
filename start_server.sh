#!/usr/bin/env bash

set -euo pipefail

GREEN='\033[0;32m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

echo "============================================"
echo "  Music Player - Local Server"
echo "============================================"
echo

cd "$(dirname "$0")"

# 1. Проверяем наличие python3 (на Windows в Git Bash это может быть просто python)
if command -v python3 &> /dev/null; then
    PYTHON_CMD="python3"
elif command -v python &> /dev/null; then
    PYTHON_CMD="python"
else
    echo -e "${RED}[ОШИБКА] Python не найден. Установите Python 3.10+.${NC}"
    exit 1
fi

# 2. Проверяем версию Python (минимум 3.10)
PYTHON_VERSION=$($PYTHON_CMD -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")')
REQUIRED_VERSION="3.10"

if [[ "$(printf '%s\n%s' "$REQUIRED_VERSION" "$PYTHON_VERSION" | sort -V | head -n1)" != "$REQUIRED_VERSION" ]]; then
    echo -e "${RED}[ОШИБКА] Установлена версия Python $PYTHON_VERSION, а требуется $REQUIRED_VERSION+.${NC}"
    exit 1
fi

# 3. Создаём venv, если его нет
if [ ! -d "venv" ]; then
    echo -e "${BLUE}[SETUP] Создаю виртуальное окружение...${NC}"
    $PYTHON_CMD -m venv venv || { echo -e "${RED}[ОШИБКА] Не удалось создать venv.${NC}"; exit 1; }
fi

# 4. АКТИВАЦИЯ С УЧЕТОМ ОС (Windows использует папку Scripts вместо bin)
if [ -f "venv/Scripts/activate" ]; then
    source venv/Scripts/activate
elif [ -f "venv/bin/activate" ]; then
    source venv/bin/activate
else
    echo -e "${RED}[ОШИБКА] Файл активации venv не найден.${NC}"
    exit 1
fi

# 5. Устанавливаем зависимости
if [ -f "requirements.txt" ]; then
    echo -e "${BLUE}[SETUP] Обновляю pip и проверяю зависимости...${NC}"
    python -m pip install --upgrade pip -q
    python -m pip install -q -r requirements.txt || { echo -e "${RED}[ОШИБКА] Не удалось установить зависимости.${NC}"; exit 1; }
else
    echo -e "${RED}[ОШИБКА] Файл requirements.txt не найден.${NC}"
    exit 1
fi

# 6. Запускаем
echo
echo -e "${GREEN}[RUN] Запуск сервера...${NC}"
echo -e "${GREEN}[RUN] Открой в браузере: http://localhost:8000${NC}"
echo -e "${BLUE}[RUN] Для остановки нажми Ctrl+C${NC}"
echo

# ОТКРЫТИЕ БРАУЗЕРА С УЧЕТОМ ОС (Добавлена поддержка Windows через start)
if command -v start &> /dev/null; then
    (sleep 1.5 && start http://localhost:8000) &> /dev/null &
elif command -v xdg-open &> /dev/null; then
    (sleep 1.5 && xdg-open http://localhost:8000) &> /dev/null &
elif command -v open &> /dev/null; then
    (sleep 1.5 && open http://localhost:8000) &> /dev/null &
fi

# Запуск сервера
if [ -f "server.py" ]; then
    python server.py
else
    echo -e "${RED}[ОШИБКА] Файл server.py не найден.${NC}"
fi

deactivate 2>/dev/null
