@echo off
setlocal EnableExtensions
set "MYSQL_HOST=localhost"
set "MYSQL_USER=root"
set "MYSQL_PASS_RAW=root"
if not "%MYSQL_PASS_RAW%"=="" (
  set "MYSQL_PASS=--password=%MYSQL_PASS_RAW%"
) else (
  set "MYSQL_PASS="
)
echo HOST=[%MYSQL_HOST%]
echo USER=[%MYSQL_USER%]
echo PASS=[%MYSQL_PASS%]
mysql -h %MYSQL_HOST% -u %MYSQL_USER% %MYSQL_PASS% -e "SELECT 1;"
