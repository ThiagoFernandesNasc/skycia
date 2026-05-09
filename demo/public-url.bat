@echo off
setlocal

set ROOT=%~dp0..

echo [1/4] Validando backend, dados e IA...
cd /d "%ROOT%\projetoti" || exit /b 1
call npm test
if errorlevel 1 exit /b 1

echo [2/4] Gerando build do frontend para ser servido pelo backend...
cd /d "%ROOT%\frontend" || exit /b 1
call npm run build
if errorlevel 1 exit /b 1

echo [3/4] Iniciando API + frontend estatico em http://localhost:3000 ...
cd /d "%ROOT%\projetoti" || exit /b 1
start "SkyTrak Public Demo" cmd /k "npm start"

echo [4/4] Abra outro terminal e exponha a porta 3000 com uma ferramenta de tunel.
echo Opcao recomendada sem instalacao:
echo   ssh -T -o StrictHostKeyChecking=no -o ServerAliveInterval=60 -R 80:localhost:3000 nokey@localhost.run
echo.
echo Alternativa:
echo   npx --yes localtunnel --port 3000
echo.
echo A URL publica gerada deve abrir a aplicacao completa.
echo Swagger: URL_PUBLICA/docs
echo API:     URL_PUBLICA/voos/live

endlocal
