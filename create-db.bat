@echo off
setlocal EnableExtensions EnableDelayedExpansion

set ROOT=%~dp0
set "BOOT_ENV_FILE=%ROOT%projetoti\.env"

if exist "%BOOT_ENV_FILE%" (
  for /f "usebackq tokens=1* delims==" %%A in ("%BOOT_ENV_FILE%") do (
    if /I "%%A"=="DB_HOST" if "%MYSQL_HOST%"=="" set "MYSQL_HOST=%%B"
    if /I "%%A"=="DB_USER" if "%MYSQL_USER%"=="" set "MYSQL_USER=%%B"
    if /I "%%A"=="DB_PASS" if "%MYSQL_PASS_RAW%"=="" set "MYSQL_PASS_RAW=%%B"
    if /I "%%A"=="ï»¿DB_HOST" if "%MYSQL_HOST%"=="" set "MYSQL_HOST=%%B"
    if /I "%%A"=="ï»¿DB_USER" if "%MYSQL_USER%"=="" set "MYSQL_USER=%%B"
    if /I "%%A"=="ï»¿DB_PASS" if "%MYSQL_PASS_RAW%"=="" set "MYSQL_PASS_RAW=%%B"
  )
)

if "%MYSQL_USER%"=="" set "MYSQL_USER=root"
if "%MYSQL_HOST%"=="" set "MYSQL_HOST=localhost"

if "%MYSQL_PASS_RAW%"=="" (
  set /p MYSQL_PASS_RAW=Digite a senha do MySQL ^(ENTER se vazia^):
)
if not "%MYSQL_PASS_RAW%"=="" (
  set "MYSQL_PASS=-p%MYSQL_PASS_RAW%"
) else (
  set "MYSQL_PASS="
)

set "MYSQL_EXE="
where mysql >nul 2>&1
if errorlevel 1 (
  if exist "C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe" (
    set "MYSQL_EXE=C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe"
  )
) else (
  for /f "delims=" %%M in ('where mysql') do set "MYSQL_EXE=%%M"
)

if "%MYSQL_EXE%"=="" (
  echo [ERRO] mysql nao encontrado no PATH e no caminho padrao.
  echo [ERRO] Instale o MySQL ou adicione o bin ao PATH.
  exit /b 1
)

echo [INFO] Testando MySQL: host=%MYSQL_HOST% user=%MYSQL_USER%
"%MYSQL_EXE%" -h %MYSQL_HOST% -u %MYSQL_USER% %MYSQL_PASS% -e "SELECT 1;" >nul 2>&1
if errorlevel 1 (
  echo [ERRO] Falha ao conectar no MySQL com os dados informados.
  exit /b 1
)

echo [INFO] Criando/atualizando bancos...
cd /d "%ROOT%projetoti" || exit /b 1

"%MYSQL_EXE%" -h %MYSQL_HOST% -u %MYSQL_USER% %MYSQL_PASS% < operacional.sql
if errorlevel 1 (
  echo [ERRO] Falha ao criar banco operacional.
  exit /b 1
)

"%MYSQL_EXE%" -h %MYSQL_HOST% -u %MYSQL_USER% %MYSQL_PASS% < spec.sql
if errorlevel 1 (
  echo [ERRO] Falha ao criar banco spec.
  exit /b 1
)

echo [OK] Bancos criados/atualizados com sucesso.
endlocal
exit /b 0
