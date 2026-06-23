@echo off
echo ========================================
echo CodeYang VS Code 扩展开关显示修复工具
echo ========================================
echo.

echo [1/5] 检查 chat.html 文件...
findstr /C:"settings-bar" vscode-extension\chat.html >nul
if %errorlevel% equ 0 (
    echo ✓ chat.html 已包含开关代码
) else (
    echo ✗ chat.html 未包含开关代码
    goto :error
)

echo.
echo [2/5] 检查 test-toggle.html 测试页面...
if exist "vscode-extension\test-toggle.html" (
    echo ✓ 测试页面存在
    echo 正在打开测试页面验证功能...
    start vscode-extension\test-toggle.html
) else (
    echo ✗ 测试页面不存在
)

echo.
echo [3/5] 生成扩展重载指令...
echo.
echo 请在 VS Code 中执行以下步骤：
echo.
echo   1. 关闭所有 CodeYang 聊天面板
echo   2. 按 F1 或 Ctrl+Shift+P
echo   3. 输入并选择: Developer: Reload Window
echo   4. 等待 VS Code 重新加载
echo   5. 按 Ctrl+Shift+P
echo   6. 输入并选择: CodeYang: Start Chat
echo   7. 查看输入框上方是否有开关
echo.

echo [4/5] 检查项目构建状态...
cd /d "%~dp0"
if exist "dist\index.js" (
    echo ✓ 项目已构建
) else (
    echo ! 正在构建项目...
    call npm run build
)

echo.
echo [5/5] 显示调试信息...
echo.
echo HTML 文件路径: %cd%\vscode-extension\chat.html
echo 测试页面路径: %cd%\vscode-extension\test-toggle.html
echo.
echo 如果在 VS Code 中仍然看不到开关，请：
echo.
echo 方法 A - 重启扩展主机:
echo   1. 按 F1
echo   2. 输入: Developer: Restart Extension Host
echo   3. 重新打开 CodeYang
echo.
echo 方法 B - 开发者工具检查:
echo   1. 在 CodeYang 聊天面板中右键
echo   2. 选择 "检查" 或 "Inspect"
echo   3. 在 Console 中输入: document.getElementById('settings-bar')
echo   4. 查看返回结果
echo.
echo 方法 C - 查看详细文档:
echo   - vscode-extension\CACHE_ISSUE.md
echo   - vscode-extension\TOGGLE_TROUBLESHOOTING.md
echo.

echo ========================================
echo 修复工具执行完成
echo ========================================
pause
goto :eof

:error
echo.
echo ✗ 发现错误，请检查文件是否正确修改
pause
exit /b 1
