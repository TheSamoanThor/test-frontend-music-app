@echo off
chcp 65001 >nul
echo ============================================
echo   Music Player - Local Server
echo ============================================
echo.

REM Проверяем Python
python --version >nul 2>&1
if errorlevel 1 (
    echo [ОШИБКА] Python не найден в PATH.
    echo Установите Python 3.10+ с https://www.python.org/downloads/
    pause
    exit /b 1
)

REM Создаём виртуальное окружение, если его нет
if not exist "venv" (
    echo [SETUP] Создаю виртуальное окружение...
    python -m venv venv
)

REM Активируем venv
call venv\Scripts\activate.bat

REM Устанавливаем зависимости (тихо, если уже стоят)
echo [SETUP] Проверяю зависимости...
pip install -q -r requirements.txt

REM Запускаем сервер
echo.
echo [RUN] Запуск сервера...
echo [RUN] Открой в браузере: http://localhost:8000
echo [RUN] Для остановки нажми Ctrl+C
echo.
start "" http://localhost:8000
python server.py

pause