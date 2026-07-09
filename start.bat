@echo off
cd /d "%~dp0"
start "" http://localhost:5500/waypick.html
node scripts\serve.js
