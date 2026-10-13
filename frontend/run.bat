@echo off
title ReelSave - Frontend Dev Server
echo ==============================================
echo        Starting ReelSave Frontend (Vite)
echo ==============================================
cd /d %~dp0
call npm run dev
pause
