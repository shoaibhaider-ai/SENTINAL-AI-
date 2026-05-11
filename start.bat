@echo off
title SENTINEL AI — Cybersecurity NIDS
color 0A
echo.
echo  =========================================
echo   SENTINEL AI  ^|  NIDS  ^|  Deep Learning
echo  =========================================
echo.

cd /d "%~dp0backend"

:: Install dependencies
echo [1/3] Installing Python dependencies...
pip install -r requirements.txt --quiet
if %errorlevel% neq 0 (
    echo ERROR: pip install failed. Make sure Python 3.9+ is installed.
    pause & exit /b 1
)

:: Train model if not already trained
if not exist "model\nids_model.pkl" (
    echo.
    echo [2/3] Training NIDS Deep Learning model...
    echo       This will take 2-5 minutes. Please wait.
    echo.
    python model/train_model.py
    if %errorlevel% neq 0 (
        echo ERROR: Model training failed.
        pause & exit /b 1
    )
) else (
    echo [2/3] Model already trained. Skipping training.
)

:: Start backend
echo.
echo [3/3] Starting backend server on http://localhost:8000
echo.
start "" cmd /k "cd /d %~dp0backend && python -m uvicorn main:app --host 0.0.0.0 --port 8000 --ws websockets --reload"

:: Wait for backend to start
timeout /t 4 /nobreak >nul

:: Open frontend
echo Opening dashboard in browser...
start "" "%~dp0frontend\index.html"

echo.
echo  Dashboard : file:///%~dp0frontend/index.html
echo  API Docs  : http://localhost:8000/docs
echo  Health    : http://localhost:8000/api/health
echo.
echo Press any key to exit this window (backend stays running).
pause >nul
