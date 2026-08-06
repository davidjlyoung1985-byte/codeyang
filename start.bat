@echo off
REM CodeYang 快速启动脚本 (Windows)

echo ===================================
echo   CodeYang AI Coding Agent
echo ===================================
echo.

REM 检查是否在正确的目录
if not exist package.json (
    echo [ERROR] 请在 codeyang 项目根目录运行此脚本
    exit /b 1
)

REM 检查构建文件
if not exist dist\index.js (
    echo [WARNING] 未找到构建文件，正在构建...
    call npm run build
    if errorlevel 1 (
        echo [ERROR] 构建失败
        exit /b 1
    )
    echo [OK] 构建完成
)

REM 检查环境变量
if "%DEEPSEEK_API_KEY%"=="" if "%CODEYANG_API_KEY%"=="" (
    echo [WARNING] 未检测到 API 密钥环境变量
    if exist .env (
        echo [OK] 将使用 .env 文件中的配置
    ) else (
        echo [INFO] 首次运行会提示输入 API 密钥
    )
)

echo.
echo 启动 CodeYang...
echo -----------------------------------
echo.

REM 启动
node dist\index.js %*
