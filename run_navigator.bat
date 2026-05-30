@echo off
setlocal
echo Compiling TypeScript files...
call npx tsc
pushd "%~dp0\mode-launchers"
echo Starting Wall Navigator on Port 8003...
go run ./cmd/wall-navigator
echo.
echo ==========================================
echo NAVIGATOR IS RUNNING ON PORT 8003
echo ==========================================
pause
popd
endlocal
