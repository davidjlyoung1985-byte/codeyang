@echo off
REM CodeYang 快速启动脚本
REM 用于 Windows 系统

echo.
echo ========================================
echo   CodeYang v0.7.0 - AI Coding Agent
echo ========================================
echo.

REM 检查 Node.js
where node >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Node.js 未安装
    echo 请访问 https://nodejs.org 下载安装
    pause
    exit /b 1
)

REM 显示版本信息
echo [INFO] Node.js 版本:
node --version
echo.

REM 检查构建产物
if not exist "dist\index.js" (
    echo [WARN] 项目未构建，正在构建...
    call npm run build
    if %ERRORLEVEL% neq 0 (
        echo [ERROR] 构建失败
        pause
        exit /b 1
    )
    echo [INFO] 构建成功
    echo.
)

REM 检查配置文件
set CONFIG_FILE=%USERPROFILE%\.codeyang\config.json
if not exist "%CONFIG_FILE%" (
    echo [WARN] 配置文件不存在: %CONFIG_FILE%
    echo [INFO] 首次运行时会提示输入 API Key
    echo.
)

REM 启动 CodeYang
echo [INFO] 启动 CodeYang...
echo [INFO] 输入 /help 查看帮助
echo [INFO] 输入 /exit 退出程序
echo.
echo ========================================
echo.

REM 运行 CodeYang
node dist\index.js

REM 退出后提示
echo.
echo [INFO] CodeYang 已退出
pause
