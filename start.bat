@echo off
setlocal enabledelayedexpansion
title FlowTrack Launcher
cls

echo ====================================================
echo           FLOWTRACK - STARTING SERVICES
echo ====================================================
echo.

cd /d "%~dp0"

:: 1. Check if pnpm is installed
where pnpm >nul 2>&1
if errorlevel 1 (
    echo [ERROR] pnpm is not found in your PATH.
    echo Please install pnpm globally by running: npm install -g pnpm
    pause
    exit /b 1
)

:: 2. Ensure apps/api/.env exists
if not exist "apps\api\.env" (
    if exist "apps\api\.env.example" (
        echo [*] Creating apps\api\.env from template...
        copy "apps\api\.env.example" "apps\api\.env" >nul
    )
)

:: 3. Ensure shared package is built
if not exist "packages\shared\dist\index.js" (
    echo [*] First-time setup: Building @flowtrack/shared package...
    call pnpm run build:shared
    if errorlevel 1 (
        echo [ERROR] Failed to build @flowtrack/shared.
        pause
        exit /b 1
    )
)

:: 4. Start Backend API
echo [*] Launching FlowTrack API server on port 3001...
start "FlowTrack-API" cmd /k "title FlowTrack-API && cd /d ""%~dp0"" && pnpm dev:api"

:: 5. Brief pause before starting Web
ping -n 4 127.0.0.1 >nul

:: 6. Start Frontend Web
echo [*] Launching FlowTrack Web App on port 5173...
start "FlowTrack-Web" cmd /k "title FlowTrack-Web && cd /d ""%~dp0"" && pnpm dev:web"

:: 7. Wait and open browser
ping -n 4 127.0.0.1 >nul
echo [*] Opening FlowTrack in your browser...
start http://localhost:5173

echo.
echo ====================================================
echo             FLOWTRACK IS NOW RUNNING!
echo ====================================================
echo.
echo   [Web App]      http://localhost:5173
echo   [API Base]     http://localhost:3001/api/v1
echo   [Swagger Docs] http://localhost:3001/api/docs
echo.
echo  Default Login Credentials:
echo   - Email:    admin@flowtrack.dev
echo   - Password: Password123!
echo.
echo  Note: To stop all running services cleanly,
echo        double-click 'stop.bat'.
echo ====================================================
echo.
pause
