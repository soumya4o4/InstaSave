@echo off
title ReelSave - Backend Engine
echo ==============================================
echo        Starting ReelSave FastAPI Backend
echo ==============================================
cd /d %~dp0
call venv\Scripts\activate.bat
python -m uvicorn main:app --reload --host 127.0.0.1 --port 8000
pause
