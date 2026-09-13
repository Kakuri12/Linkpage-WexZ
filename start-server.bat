@echo off
cd /d "%~dp0"
py -m http.server 5500 --bind 127.0.0.1
pause
