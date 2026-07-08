@echo off
REM CodeYang Web — 完整启动（后端 + 前端）
REM 浏览器打开 http://localhost:5182

cd /d "C:\Users\Ehua\codeyang"

REM 启动后端 WebSocket 服务器
start /min "CodeYang Server" npx tsx web/server/index.ts

REM 等待 2 秒
timeout /t 2 /nobreak >nul

REM 启动前端 Vite 开发服务器
cd /d "C:\Users\Ehua\codeyang\web\client"
start /min "CodeYang Client" npx vite

REM 等待 3 秒后打开浏览器
timeout /t 3 /nobreak >nul
start http://localhost:5182
