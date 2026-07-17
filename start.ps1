# CodeYang 快速启动脚本 (PowerShell)
# 用于 Windows 系统

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  CodeYang v0.7.0 - AI Coding Agent" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 检查 Node.js
try {
    $nodeVersion = node --version
    Write-Host "[INFO] Node.js 版本: $nodeVersion" -ForegroundColor Green
} catch {
    Write-Host "[ERROR] Node.js 未安装" -ForegroundColor Red
    Write-Host "请访问 https://nodejs.org 下载安装" -ForegroundColor Yellow
    Read-Host "按 Enter 键退出"
    exit 1
}

Write-Host ""

# 检查构建产物
if (-not (Test-Path "dist\index.js")) {
    Write-Host "[WARN] 项目未构建，正在构建..." -ForegroundColor Yellow
    npm run build
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[ERROR] 构建失败" -ForegroundColor Red
        Read-Host "按 Enter 键退出"
        exit 1
    }
    Write-Host "[INFO] 构建成功" -ForegroundColor Green
    Write-Host ""
}

# 检查配置文件
$configFile = "$env:USERPROFILE\.codeyang\config.json"
if (-not (Test-Path $configFile)) {
    Write-Host "[WARN] 配置文件不存在: $configFile" -ForegroundColor Yellow
    Write-Host "[INFO] 首次运行时会提示输入 API Key" -ForegroundColor Cyan
    Write-Host ""
}

# 显示使用提示
Write-Host "[INFO] 启动 CodeYang..." -ForegroundColor Green
Write-Host "[INFO] 输入 /help 查看帮助" -ForegroundColor Cyan
Write-Host "[INFO] 输入 /tools 查看所有工具" -ForegroundColor Cyan
Write-Host "[INFO] 输入 /exit 退出程序" -ForegroundColor Cyan
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 运行 CodeYang
node dist\index.js

# 退出后提示
Write-Host ""
Write-Host "[INFO] CodeYang 已退出" -ForegroundColor Green
Read-Host "按 Enter 键退出"
