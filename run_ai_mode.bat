@echo off
echo Compiling TypeScript files...
call npx tsc
echo Starting AI MODE Workspace on Port 8004...
start "AI Mode" python scripts/save_server.py 8004 /ai_mode.html
echo Waiting for server...
timeout /t 2 /nobreak > nul
start http://localhost:8004
echo.
echo ==========================================
echo AI MODE IS RUNNING ON PORT 8004
echo ==========================================
pause
