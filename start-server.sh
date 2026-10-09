#!/usr/bin/env bash
set -e

echo "============================================"
echo "  Music Player - Local Server"
echo "============================================"
echo

# Проверяем Python
if ! command -v python3 &> /dev/null; then
    echo "[ОШИБКА] python3 не найден. Установите Python 3.10+."
    exit 1
fi

# Создаём venv, если его нет
if [ ! -d "venv" ]; then
    echo "[SETUP] Создаю виртуальное окружение..."
    python3 -m venv venv
fi

# Активируем
source venv/bin/activate

# Устанавливаем зависимости
echo "[SETUP] Проверяю зависимости..."
pip install -q -r requirements.txt

# Запускаем
echo
echo "[RUN] Запуск сервера..."
echo "[RUN] Открой в браузере: http://localhost:8000"
echo "[RUN] Для остановки нажми Ctrl+C"
echo

# Пытаемся открыть браузер (не критично, если не получится)
if command -v xdg-open &> /dev/null; then
    (sleep 1 && xdg-open http://localhost:8000) &
elif command -v open &> /dev/null; then
    (sleep 1 && open http://localhost:8000) &
fi

python server.py
