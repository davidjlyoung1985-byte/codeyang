@echo off
chcp 65001 >nul
REM CodeYang for WPS — 一键启动
cd /d "C:\Users\Ehua\codeyang"

REM 检查 Web 服务器
netstat -an | findstr "3456" >nul
if errorlevel 1 (
  echo 启动 CodeYang Web 服务器...
  start /min "CodeYang" node dist/web-server.js
  timeout /t 3 /nobreak >nul
)

echo.
echo  CodeYang ─ WPS Office 集成
echo.
echo  方式1: 在 WPS 中按 Alt+F11 打开宏 → 插入 → Web 控件
echo         地址输入: http://localhost:3456/wps
echo.
echo  方式2: 浏览器打开 http://localhost:3456/wps
echo.
echo  方式3: 文件加载 — WPS 开发工具 → 加载项 → 添加
echo         选择 wps-addin\manifest.xml
echo.
timeout /t 5 /nobreak >nul
start http://localhost:3456/wps
