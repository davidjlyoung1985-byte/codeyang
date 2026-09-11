# CodeYang 本地部署脚本
# 用法: .\deploy.ps1

param(
    [switch]$SkipTests,
    [switch]$SkipBuild,
    [switch]$Clean
)

$ErrorActionPreference = "Stop"

Write-Host "==================================" -ForegroundColor Cyan
Write-Host "  CodeYang 本地部署脚本 v1.0" -ForegroundColor Cyan
Write-Host "==================================" -ForegroundColor Cyan
Write-Host ""

# 检查环境
Write-Host "[1/7] 检查环境..." -ForegroundColor Yellow
$nodeVersion = node --version
$npmVersion = npm --version
Write-Host "✅ Node.js: $nodeVersion" -ForegroundColor Green
Write-Host "✅ NPM: $npmVersion" -ForegroundColor Green
Write-Host ""

# 清理（可选）
if ($Clean) {
    Write-Host "[2/7] 清理旧文件..." -ForegroundColor Yellow
    if (Test-Path "node_modules") {
        Write-Host "  清理 node_modules..."
        Remove-Item -Recurse -Force node_modules -ErrorAction SilentlyContinue
    }
    if (Test-Path "dist") {
        Write-Host "  清理 dist..."
        Remove-Item -Recurse -Force dist -ErrorAction SilentlyContinue
    }
    if (Test-Path "package-lock.json") {
        Write-Host "  清理 package-lock.json..."
        Remove-Item -Force package-lock.json -ErrorAction SilentlyContinue
    }
    Write-Host "✅ 清理完成" -ForegroundColor Green
    Write-Host ""
} else {
    Write-Host "[2/7] 跳过清理（使用 -Clean 参数启用）" -ForegroundColor Gray
    Write-Host ""
}

# 安装依赖
Write-Host "[3/7] 安装依赖..." -ForegroundColor Yellow
npm install
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ 依赖安装失败" -ForegroundColor Red
    exit 1
}
Write-Host "✅ 依赖安装完成" -ForegroundColor Green
Write-Host ""

# 代码格式化
Write-Host "[4/7] 格式化代码..." -ForegroundColor Yellow
npm run format 2>$null
if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ 代码格式化完成" -ForegroundColor Green
} else {
    Write-Host "⚠️  代码格式化跳过（未找到 format 脚本）" -ForegroundColor Yellow
}
Write-Host ""

# Lint 检查
Write-Host "[5/7] Lint 检查..." -ForegroundColor Yellow
npm run lint 2>$null
if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ Lint 检查通过" -ForegroundColor Green
} else {
    Write-Host "⚠️  Lint 检查有警告（继续部署）" -ForegroundColor Yellow
}
Write-Host ""

# 运行测试
if (-not $SkipTests) {
    Write-Host "[6/7] 运行测试..." -ForegroundColor Yellow
    $env:CODEYANG_BASH_LIMIT = "10000"
    npm test -- --run
    if ($LASTEXITCODE -ne 0) {
        Write-Host "❌ 测试失败" -ForegroundColor Red
        Write-Host "提示: 使用 -SkipTests 参数跳过测试" -ForegroundColor Yellow
        exit 1
    }
    Write-Host "✅ 测试通过" -ForegroundColor Green
    Write-Host ""
} else {
    Write-Host "[6/7] 跳过测试（使用 -SkipTests 参数）" -ForegroundColor Gray
    Write-Host ""
}

# 构建项目
if (-not $SkipBuild) {
    Write-Host "[7/7] 构建项目..." -ForegroundColor Yellow
    npm run build
    if ($LASTEXITCODE -ne 0) {
        Write-Host "❌ 构建失败" -ForegroundColor Red
        exit 1
    }
    Write-Host "✅ 构建完成" -ForegroundColor Green
    Write-Host ""
} else {
    Write-Host "[7/7] 跳过构建（使用 -SkipBuild 参数）" -ForegroundColor Gray
    Write-Host ""
}

# 部署完成
Write-Host "==================================" -ForegroundColor Cyan
Write-Host "  🎉 部署成功！" -ForegroundColor Green
Write-Host "==================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "下一步:" -ForegroundColor Yellow
Write-Host "  1. 配置 API Key: npm start -- --api-key YOUR_KEY"
Write-Host "  2. 启动 CodeYang: npm start"
Write-Host "  3. 查看帮助: npm start -- --help"
Write-Host ""
Write-Host "故障排查:" -ForegroundColor Yellow
Write-Host "  查看 TROUBLESHOOTING.md 了解常见问题"
Write-Host ""
Write-Host "环境变量（可选）:" -ForegroundColor Yellow
Write-Host "  CODEYANG_BASH_LIMIT=500      # 调整 Bash 限流"
Write-Host "  CODEYANG_DEBUG=true          # 启用调试日志"
Write-Host "  NODE_OPTIONS=--max-old-space-size=4096  # 增加内存"
Write-Host ""
