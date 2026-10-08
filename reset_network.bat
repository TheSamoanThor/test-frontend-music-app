@echo off
chcp 65001 > nul
cls

:: --- БЛОК АВТОПОВЫШЕНИЯ ПРИВИЛЕГИЙ ---
net session >nul 2>&1
if %errorLevel% == 0 (
    goto :admin_ok
) else (
    echo Запрос прав администратора...
    powershell -Command "Start-Process '%~f0' -Verb RunAs"
    exit /b
)
:admin_ok
cls
:: -------------------------------------

echo ===================================================
echo     СБРОС СЕТЕВЫХ НАСТРОЕК WINDOWS
echo ===================================================
echo.
echo Данный скрипт может помочь при проблемах с установкой зависимостей для сервера
echo Он скрипт выполнит сброс сети.
echo В процессе сеть может кратковременно отключиться.
echo.

set /p choice="Вы уверены, что хотите сбросить сеть? [Y/N]: "

if /i "%choice%"=="Y" goto :run_commands
if /i "%choice%"=="yes" goto :run_commands
if /i "%choice%"=="Д" goto :run_commands
if /i "%choice%"=="да" goto :run_commands

echo.
echo Операция отменена пользователем.
goto :end

:run_commands
echo.
echo [1/5] Сброс каталога Winsock...
netsh winsock reset

echo.
echo [2/5] Сброс настроек TCP/IP...
netsh int ip reset

echo.
echo [3/5] Очистка кэша DNS...
ipconfig /flushdns

echo.
echo [4/5] Освобождение текущего IP-адреса...
ipconfig /release

echo.
echo [5/5] Запрос нового IP-адреса...
ipconfig /renew

echo.
echo ===================================================
echo Все команды успешно выполнены.
@REM  echo Пожалуйста, ПЕРЕЗАГРУЗИТЕ компьютер вручную.
echo ===================================================

:: --- ВЫЗОВ ГРАФИЧЕСКОГО ОКНА НАПОМИНАНИЯ ---
powershell -Command "[System.Reflection.Assembly]::LoadWithPartialName('System.Windows.Forms') | Out-Null; [System.Windows.Forms.MessageBox]::Show('Сброс настроек сети успешно завершен. \n\nПожалуйста, ПЕРЕЗАГРУЗИТЕ компьютер вручную для применения всех изменений.', 'Готово!', [System.Windows.Forms.MessageBoxButtons]::OK, [System.Windows.Forms.MessageBoxIcon]::Information)"

:end
echo.
pause