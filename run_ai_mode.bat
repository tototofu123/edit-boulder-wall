@echo off
setlocal
echo Compiling TypeScript files...
call npx tsc
pushd "%~dp0\mode-launchers"
echo.
echo ==========================================
echo Starting AI MODE Workspace on Port 8004
echo Browser should open automatically.
echo Console output and server logs will stay visible.
echo ==========================================
go run ./cmd/ai-mode
echo.
echo ==========================================
echo AI MODE IS RUNNING ON PORT 8004
echo ==========================================
pause
popd
endlocal
