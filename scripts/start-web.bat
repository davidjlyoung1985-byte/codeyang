@echo off
REM CodeYang Web Server — 开机自启动脚本
REM 由 CodeYang 自动生成

cd /d "C:\Users\Ehua\codeyang"
npx tsx web/server/index.ts > "%USERPROFILE%\.codeyang\web-server.log" 2>&1
