@echo off
setlocal

echo Select environment:
echo [1] dev (local DB)
echo [2] prod (use .env)
set /p choice="Choose 1 or 2: "

if "%choice%"=="1" goto dev
if "%choice%"=="2" goto prod

echo Invalid choice. Exiting.
goto end

:dev
set "DB_URL=postgresql://postgres:alure@localhost:5432/alure"
set "DATA_ENCRYPTION_KEY=XeZZNvWtA9nPFYvsSaGwhXZfnjNDDla9evhvI7TwnS4="
start "Server (dev)" cmd /k "cd /d %~dp0server && set DATABASE_URL=%DB_URL% && set SWAGGER_ENABLED=true && set DATA_ENCRYPTION_KEY=%DATA_ENCRYPTION_KEY% && npm run start:dev"
start "Dashboard (dev)" cmd /k "cd /d %~dp0dashboard && npm run dev"
goto end

:prod
start "Server (prod)" cmd /k "cd /d %~dp0server && npm run start:prod"
start "Dashboard (prod)" cmd /k "cd /d %~dp0dashboard && npm run preview"
echo Note: prod mode expects builds (server/dist, dashboard/dist).

:end
endlocal
