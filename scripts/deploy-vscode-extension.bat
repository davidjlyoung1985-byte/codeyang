@echo off
REM CodeYang VS Code Extension - Quick Deploy Script (Windows)

echo ================================================================
echo   CodeYang VS Code Extension - DeepSeek Anthropic API
echo ================================================================
echo.

REM Step 1: Build main project
echo [1/4] Building CodeYang...
call npm run build
if %errorlevel% neq 0 (
    echo Error: Build failed
    exit /b 1
)
echo [32m✓[0m Build completed
echo.

REM Step 2: Copy tools to extension
echo [2/4] Copying tools to extension...
copy /Y dist\cjs\tools.cjs vscode-extension\tools.cjs
echo [32m✓[0m Tools copied
echo.

REM Step 3: Install extension dependencies
echo [3/4] Installing extension dependencies...
cd vscode-extension
if not exist node_modules (
    call npm install
) else (
    echo Dependencies already installed
)
cd ..
echo [32m✓[0m Dependencies ready
echo.

REM Step 4: Install to VS Code
echo [4/4] Installing extension to VS Code...

set "EXT_DIR=%USERPROFILE%\.vscode\extensions\codeyang-vscode-0.3.1"

REM Remove old version
if exist "%EXT_DIR%" (
    echo Removing old version...
    rmdir /S /Q "%EXT_DIR%"
)

REM Copy extension
echo Copying extension to %EXT_DIR%...
mkdir "%EXT_DIR%"
xcopy /E /I /Y vscode-extension "%EXT_DIR%"

echo [32m✓[0m Extension installed
echo.

echo ================================================================
echo   [32m✓ Installation Complete![0m
echo ================================================================
echo.
echo Next steps:
echo   1. Reload VS Code window (Ctrl+Shift+P → Developer: Reload Window)
echo   2. Press Ctrl+Shift+Y to open CodeYang
echo   3. Enter your DeepSeek API key from https://platform.deepseek.com
echo.
echo Configuration:
echo   • API Base URL: https://api.deepseek.com/anthropic
echo   • Model: deepseek-v4-pro
echo.
echo For more info, see: vscode-extension\README.md
echo.
pause
