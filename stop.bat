@echo off
setlocal enabledelayedexpansion
title FlowTrack Stopper
cls

echo ====================================================
echo           FLOWTRACK - STOPPING SERVICES
echo ====================================================
echo.

:: 1. Terminate windows by window title
echo [*] Terminating FlowTrack console windows...
taskkill /FI "WINDOWTITLE eq FlowTrack-API*" /T /F >nul 2>&1
taskkill /FI "WINDOWTITLE eq FlowTrack-Web*" /T /F >nul 2>&1

:: 2. Terminate any lingering process on port 3001 (API)
echo [*] Checking port 3001 - Backend API...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3001 ^| findstr LISTENING') do (
    if not "%%a"=="0" (
        echo     - Stopping process on port 3001 - PID %%a
        taskkill /F /T /PID %%a >nul 2>&1
    )
)

:: 3. Terminate any lingering process on port 5173 (Frontend Web)
echo [*] Checking port 5173 - Frontend Web...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :5173 ^| findstr LISTENING') do (
    if not "%%a"=="0" (
        echo     - Stopping process on port 5173 - PID %%a
        taskkill /F /T /PID %%a >nul 2>&1
    )
)

ping -n 2 127.0.0.1 >nul
echo.
echo ====================================================
echo           ALL FLOWTRACK SERVICES STOPPED
echo ====================================================
echo.
echo Ports 3001 (API) and 5173 (Web) have been released.
echo.
pause
