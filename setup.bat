@echo off
setlocal EnableExtensions EnableDelayedExpansion

REM ===== Configuracao padrao =====
if "%MYSQL_USER%"=="" set MYSQL_USER=root
if "%MYSQL_HOST%"=="" set MYSQL_HOST=localhost
set "BOOT_ENV_FILE=%~dp0projetoti\.env"
if exist "%BOOT_ENV_FILE%" (
  for /f "usebackq delims=" %%V in (`powershell -NoProfile -Command "$p=$args[0];$k='DB_HOST'; $line=Get-Content $p | Where-Object { $_ -match ('^'+[regex]::Escape($k)+'=') } | Select-Object -Last 1; if($line){$line.Substring($k.Length + 1)}" -- "%BOOT_ENV_FILE%"`) do if "%MYSQL_HOST%"=="" set "MYSQL_HOST=%%V"
  for /f "usebackq delims=" %%V in (`powershell -NoProfile -Command "$p=$args[0];$k='DB_USER'; $line=Get-Content $p | Where-Object { $_ -match ('^'+[regex]::Escape($k)+'=') } | Select-Object -Last 1; if($line){$line.Substring($k.Length + 1)}" -- "%BOOT_ENV_FILE%"`) do if "%MYSQL_USER%"=="" set "MYSQL_USER=%%V"
  for /f "usebackq delims=" %%V in (`powershell -NoProfile -Command "$p=$args[0];$k='DB_PASS'; $line=Get-Content $p | Where-Object { $_ -match ('^'+[regex]::Escape($k)+'=') } | Select-Object -Last 1; if($line){$line.Substring($k.Length + 1)}" -- "%BOOT_ENV_FILE%"`) do if "%MYSQL_PASS_RAW%"=="" set "MYSQL_PASS_RAW=%%V"
)

if not "%MYSQL_PASS_RAW%"=="" (
  set MYSQL_PASS=-p%MYSQL_PASS_RAW%
) else (
  set /p MYSQL_PASS_RAW=Digite a senha do MySQL (ENTER se vazia):
  if not "%MYSQL_PASS_RAW%"=="" (
    set MYSQL_PASS=-p%MYSQL_PASS_RAW%
  ) else (
    set MYSQL_PASS=
  )
)

set ROOT=%~dp0

REM Verifica Node.js e npm
where node >nul 2>&1
if errorlevel 1 (
  echo [ERRO] Node.js nao encontrado.
  echo Execute install-node.bat e tente novamente.
  exit /b 1
)
where npm >nul 2>&1
if errorlevel 1 (
  echo [ERRO] npm nao encontrado.
  echo Execute install-node.bat e tente novamente.
  exit /b 1
)

echo [1/4] Instalando dependencias do back-end...
cd /d "%ROOT%projetoti" || exit /b 1
call npm install

echo [2/4] Instalando dependencias do front-end...
cd /d "%ROOT%frontend" || exit /b 1
call npm install

echo [3/4] Preparando .env do back-end...
cd /d "%ROOT%projetoti" || exit /b 1
if not exist ".env" (
  copy /Y ".env.example" ".env" >nul
  echo .env criado a partir de .env.example
) else (
  echo .env ja existe
)

set "ENV_FILE=%CD%\.env"
if not exist "%ENV_FILE%" (
  echo [ERRO] Nao foi possivel localizar %ENV_FILE%.
  exit /b 1
)

echo.
echo [3.1/4] Configuracao automatica de dados ao vivo...
call :ensure_env_value CORS_ORIGIN http://localhost:5173
call :ensure_env_value LIVE_FLIGHTS_CACHE_TTL 30
call :ensure_env_value LIVE_AERODATABOX_DELAY_MS 1200
call :ensure_env_value LIVE_FLIGHTS_AIRPORTS GRU
call :get_env_value OPENSKY_USERNAME OPENSKY_USERNAME_VALUE
call :get_env_value OPENSKY_PASSWORD OPENSKY_PASSWORD_VALUE
call :get_env_value AERODATABOX_API_KEY AERODATABOX_API_KEY_VALUE

set "LIVE_ALREADY_SET=0"
if defined OPENSKY_USERNAME_VALUE if defined OPENSKY_PASSWORD_VALUE if defined AERODATABOX_API_KEY_VALUE set "LIVE_ALREADY_SET=1"

if "%LIVE_ALREADY_SET%"=="1" (
  echo Credenciais de APIs ao vivo ja configuradas no .env.
) else (
  set /p CONFIG_LIVE_APIS=Configurar credenciais das APIs ao vivo agora? [S/N] (recomendado): 
  if /I "!CONFIG_LIVE_APIS!"=="S" (
    if not defined OPENSKY_USERNAME_VALUE (
      set /p NEW_OPENSKY_USERNAME=OPENSKY_USERNAME: 
      if defined NEW_OPENSKY_USERNAME call :set_env_value OPENSKY_USERNAME "!NEW_OPENSKY_USERNAME!"
    )
    if not defined OPENSKY_PASSWORD_VALUE (
      set /p NEW_OPENSKY_PASSWORD=OPENSKY_PASSWORD: 
      if defined NEW_OPENSKY_PASSWORD call :set_env_value OPENSKY_PASSWORD "!NEW_OPENSKY_PASSWORD!"
    )
    if not defined AERODATABOX_API_KEY_VALUE (
      set /p NEW_AERODATABOX_API_KEY=AERODATABOX_API_KEY: 
      if defined NEW_AERODATABOX_API_KEY call :set_env_value AERODATABOX_API_KEY "!NEW_AERODATABOX_API_KEY!"
    )
  )
)

call :get_env_value OPENSKY_USERNAME OPENSKY_USERNAME_VALUE
call :get_env_value OPENSKY_PASSWORD OPENSKY_PASSWORD_VALUE
call :get_env_value AERODATABOX_API_KEY AERODATABOX_API_KEY_VALUE
if defined OPENSKY_USERNAME_VALUE if defined OPENSKY_PASSWORD_VALUE if defined AERODATABOX_API_KEY_VALUE (
  echo Dados ao vivo: OpenSky + AeroDataBox habilitados.
) else (
  echo [AVISO] Credenciais incompletas para dados ao vivo.
  echo [AVISO] A aplicacao vai funcionar com fallback local no dia da apresentacao.
)

echo [4/4] Criando bancos e tabelas...
cd /d "%ROOT%projetoti" || exit /b 1

REM Requer mysql no PATH. Se nao tiver, instale MySQL e adicione ao PATH.
where mysql >nul 2>&1
if errorlevel 1 (
  echo [ERRO] mysql nao encontrado no PATH.
  echo [ERRO] Instale o MySQL e adicione o bin ao PATH.
  exit /b 1
)
mysql -h %MYSQL_HOST% -u %MYSQL_USER% %MYSQL_PASS% < operacional.sql
if errorlevel 1 (
  echo [ERRO] Falha ao criar banco operacional.
  exit /b 1
)
mysql -h %MYSQL_HOST% -u %MYSQL_USER% %MYSQL_PASS% < spec.sql
if errorlevel 1 (
  echo [ERRO] Falha ao criar banco spec.
  exit /b 1
)

echo.
echo Setup concluido. Agora execute start-all.bat
endlocal
exit /b 0

:get_env_value
set "%~2="
for /f "usebackq delims=" %%V in (`powershell -NoProfile -Command "$p=$args[0];$k=$args[1]; if(!(Test-Path $p)){exit 0}; $line=Get-Content $p | Where-Object { $_ -match ('^'+[regex]::Escape($k)+'=') } | Select-Object -Last 1; if($line){$line.Substring($k.Length + 1)}" -- "%ENV_FILE%" "%~1"`) do set "%~2=%%V"
exit /b 0

:set_env_value
powershell -NoProfile -Command "$p=$args[0];$k=$args[1];$v=$args[2]; if(!(Test-Path $p)){exit 1}; $lines=Get-Content $p; $pattern='^'+[regex]::Escape($k)+'='; $found=$false; for($i=0;$i -lt $lines.Count;$i++){ if($lines[$i] -match $pattern){ $lines[$i]=\"$k=$v\"; $found=$true } }; if(-not $found){ $lines += \"$k=$v\" }; Set-Content -Path $p -Value $lines -Encoding UTF8" -- "%ENV_FILE%" "%~1" "%~2"
if errorlevel 1 (
  echo [AVISO] Falha ao atualizar %~1 no .env.
  exit /b 1
)
exit /b 0

:ensure_env_value
call :get_env_value %~1 __CURRENT_VALUE
if not defined __CURRENT_VALUE (
  call :set_env_value %~1 %~2
)
set "__CURRENT_VALUE="
exit /b 0
