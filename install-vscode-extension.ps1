# CodeYang VS Code Extension 安装脚本
# 用于本地开发安装扩展

Write-Host "🚀 安装 CodeYang VS Code 扩展" -ForegroundColor Cyan
Write-Host ""

$extensionDir = "vscode-extension"
$vscodeExtDir = "$env:USERPROFILE\.vscode\extensions"
$targetDir = "$vscodeExtDir\codeyang-vscode-0.3.1"

# 检查扩展目录是否存在
if (-not (Test-Path $extensionDir)) {
    Write-Host "❌ 错误: 找不到 vscode-extension 目录" -ForegroundColor Red
    exit 1
}

Write-Host "📁 源目录: $extensionDir" -ForegroundColor Gray
Write-Host "📁 目标目录: $targetDir" -ForegroundColor Gray
Write-Host ""

# 如果目标目录已存在，先删除
if (Test-Path $targetDir) {
    Write-Host "🗑️  删除旧版本..." -ForegroundColor Yellow
    Remove-Item -Recurse -Force $targetDir
}

# 创建目标目录
Write-Host "📦 复制扩展文件..." -ForegroundColor Cyan
New-Item -ItemType Directory -Force -Path $targetDir | Out-Null

# 复制文件
Copy-Item -Path "$extensionDir\*" -Destination $targetDir -Recurse -Force

Write-Host "✅ 扩展已安装到: $targetDir" -ForegroundColor Green
Write-Host ""
Write-Host "📋 下一步操作:" -ForegroundColor Cyan
Write-Host "  1. 重启 VS Code" -ForegroundColor White
Write-Host "  2. 按 Ctrl+Shift+Y 启动 CodeYang" -ForegroundColor White
Write-Host "  3. 或运行命令: CodeYang: Start Chat" -ForegroundColor White
Write-Host ""
Write-Host "⚙️  配置 API Key:" -ForegroundColor Cyan
Write-Host "  - 设置环境变量: CODEYANG_API_KEY" -ForegroundColor White
Write-Host "  - 或在 ~/.codeyang/config.json 中配置" -ForegroundColor White
Write-Host ""
