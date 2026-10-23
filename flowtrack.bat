@echo off
setlocal enabledelayedexpansion
title FlowTrack Control Center
cd /d "%~dp0"

if /i "%1"=="start" goto do_start
if /i "%1"=="stop" goto do_stop
if /i "%1"=="restart" goto do_restart
if /i "%1"=="status" goto do_status

:menu
cls
echo ====================================================
echo             FLOWTRACK CONTROL CENTER
echo ====================================================
echo.
echo   [1] Start FlowTrack (API + Web App)
echo   [2] Stop FlowTrack
echo   [3] Restart FlowTrack
echo   [4] Check Service Status
echo   [5] Seed / Reset Sample Database Data
echo   [6] Exit
echo.
echo ====================================================
set /p choice="Enter choice (1-6): "

if "%choice%"=="1" goto do_start
if "%choice%"=="2" goto do_stop
if "%choice%"=="3" goto do_restart
if "%choice%"=="4" goto do_status
if "%choice%"=="5" goto do_seed
if "%choice%"=="6" exit /b 0

echo Invalid choice. Please try again.
ping -n 2 127.0.0.1 >nul
goto menu

:do_start
cls
call "%~dp0start.bat"
goto menu

:do_stop
cls
call "%~dp0stop.bat"
goto menu

:do_restart
cls
echo [*] Restarting FlowTrack...
call "%~dp0stop.bat"
ping -n 3 127.0.0.1 >nul
call "%~dp0start.bat"
goto menu

:do_status
cls
echo ====================================================
echo              FLOWTRACK STATUS CHECK
echo ====================================================
echo.
echo [*] Checking Backend API (Port 3001)...
netstat -ano | findstr :3001 | findstr LISTENING >nul
if errorlevel 1 (
    echo     [OFFLINE] API is NOT running on port 3001.
) else (
    echo     [ONLINE]  API is actively listening on port 3001.
)

echo.
echo [*] Checking Frontend Web (Port 5173)...
netstat -ano | findstr :5173 | findstr LISTENING >nul
if errorlevel 1 (
    echo     [OFFLINE] Web is NOT running on port 5173.
) else (
    echo     [ONLINE]  Web is actively listening on port 5173.
)

echo.
echo [*] Checking PostgreSQL Service (Port 5433)...
netstat -ano | findstr :5433 | findstr LISTENING >nul
if errorlevel 1 (
    echo     [OFFLINE] PostgreSQL is NOT detected on port 5433.
) else (
    echo     [ONLINE]  PostgreSQL is actively listening on port 5433.
)

echo.
echo ====================================================
pause
goto menu

:do_seed
cls
echo [*] Seeding FlowTrack database with sample records...
call pnpm --filter @flowtrack/api prisma:seed
echo.
pause
goto menu
