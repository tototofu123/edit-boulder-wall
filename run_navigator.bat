@echo off
echo Starting Wall Navigator on Port 8003...
start "Wall Navigator" python scripts/save_server.py 8003 /wall_navigator.html
echo Waiting for server...
timeout /t 2 /nobreak > nul
start http://localhost:8003
echo.
echo ==========================================
echo NAVIGATOR IS RUNNING ON PORT 8003
echo ==========================================
pause
