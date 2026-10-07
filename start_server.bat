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

REM Обновляем pip до актуальной версии
echo [SETUP] Обновляю pip...
python -m pip install --upgrade pip

@REM  REM Устанавливаем зависимости из файла requirements.txt
@REM  echo [SETUP] Устанавливаем зависимости...
@REM  pip install -r requirements.txt

REM Устанавливаем зависимости в обход строгой проверки SSL-сертификатов
echo [SETUP] Устанавливаем зависимости в обход SSL...
pip install --trusted-host pypi.org --trusted-host pypi.python.org --trusted-host files.pythonhosted.org -r requirements.txt

REM Запускаем сервер
echo.
echo [RUN] Запуск сервера...
echo [RUN] Открой в браузере: http://localhost:8000
echo [RUN] Для остановки нажми Ctrl+C
echo.
start "" http://localhost:8000
python server.py

pause