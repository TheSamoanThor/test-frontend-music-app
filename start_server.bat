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
    echo Установите Python 3.10+ с https://python.org
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

REM Проверяем, установлена ли уже fastapi, чтобы не лезть в сеть без нужды
python -c "import fastapi" >nul 2>&1
if errorlevel 1 (
    echo [SETUP] Зависимости не найдены. Пытаемся установить...
    
    REM Обновляем pip
    python -m pip install --upgrade pip
    
    REM Устанавливаем зависимости в обход SSL
    pip install --trusted-host pypi.org --trusted-host pypi.python.org --trusted-host files.pythonhosted.org -r requirements.txt
    
    REM Финальная проверка установки
    python -c "import fastapi" >nul 2>&1
    if errorlevel 1 (
        echo.
        echo [ОШИБКА] Не удалось установить пакеты. Проверьте интернет-соединение!
        pause
        exit /b 1
    )
) else (
    echo [SETUP] Все необходимые библиотеки уже установлены в venv. Скрипт установки пропущен.
)

REM Запускаем сервер
echo.
echo [RUN] Запуск сервера...
echo [RUN] Открой в браузере: http://localhost:8000
echo [RUN] Для остановки нажми Ctrl+C
echo.
start "" http://localhost:8000
python server.py

pause
