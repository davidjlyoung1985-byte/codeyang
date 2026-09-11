#!/bin/bash
# CodeYang 本地部署脚本
# 用法: ./deploy.sh [--skip-tests] [--skip-build] [--clean]

set -e

SKIP_TESTS=false
SKIP_BUILD=false
CLEAN=false

# 解析参数
for arg in "$@"; do
    case $arg in
        --skip-tests)
            SKIP_TESTS=true
            ;;
        --skip-build)
            SKIP_BUILD=true
            ;;
        --clean)
            CLEAN=true
            ;;
        --help)
            echo "用法: ./deploy.sh [选项]"
            echo ""
            echo "选项:"
            echo "  --clean        清理旧文件（node_modules, dist, etc.）"
            echo "  --skip-tests   跳过测试"
            echo "  --skip-build   跳过构建"
            echo "  --help         显示帮助"
            exit 0
            ;;
        *)
            echo "未知参数: $arg"
            echo "使用 --help 查看帮助"
            exit 1
            ;;
    esac
done

echo "=================================="
echo "  CodeYang 本地部署脚本 v1.0"
echo "=================================="
echo ""

# 检查环境
echo "[1/7] 检查环境..."
NODE_VERSION=$(node --version)
NPM_VERSION=$(npm --version)
echo "✅ Node.js: $NODE_VERSION"
echo "✅ NPM: $NPM_VERSION"
echo ""

# 清理（可选）
if [ "$CLEAN" = true ]; then
    echo "[2/7] 清理旧文件..."
    [ -d "node_modules" ] && echo "  清理 node_modules..." && rm -rf node_modules
    [ -d "dist" ] && echo "  清理 dist..." && rm -rf dist
    [ -f "package-lock.json" ] && echo "  清理 package-lock.json..." && rm -f package-lock.json
    echo "✅ 清理完成"
    echo ""
else
    echo "[2/7] 跳过清理（使用 --clean 参数启用）"
    echo ""
fi

# 安装依赖
echo "[3/7] 安装依赖..."
npm install
echo "✅ 依赖安装完成"
echo ""

# 代码格式化
echo "[4/7] 格式化代码..."
if npm run format 2>/dev/null; then
    echo "✅ 代码格式化完成"
else
    echo "⚠️  代码格式化跳过（未找到 format 脚本）"
fi
echo ""

# Lint 检查
echo "[5/7] Lint 检查..."
if npm run lint 2>/dev/null; then
    echo "✅ Lint 检查通过"
else
    echo "⚠️  Lint 检查有警告（继续部署）"
fi
echo ""

# 运行测试
if [ "$SKIP_TESTS" = false ]; then
    echo "[6/7] 运行测试..."
    export CODEYANG_BASH_LIMIT=10000
    npm test -- --run
    echo "✅ 测试通过"
    echo ""
else
    echo "[6/7] 跳过测试（使用 --skip-tests 参数）"
    echo ""
fi

# 构建项目
if [ "$SKIP_BUILD" = false ]; then
    echo "[7/7] 构建项目..."
    npm run build
    echo "✅ 构建完成"
    echo ""
else
    echo "[7/7] 跳过构建（使用 --skip-build 参数）"
    echo ""
fi

# 部署完成
echo "=================================="
echo "  🎉 部署成功！"
echo "=================================="
echo ""
echo "下一步:"
echo "  1. 配置 API Key: npm start -- --api-key YOUR_KEY"
echo "  2. 启动 CodeYang: npm start"
echo "  3. 查看帮助: npm start -- --help"
echo ""
echo "故障排查:"
echo "  查看 TROUBLESHOOTING.md 了解常见问题"
echo ""
echo "环境变量（可选）:"
echo "  CODEYANG_BASH_LIMIT=500      # 调整 Bash 限流"
echo "  CODEYANG_DEBUG=true          # 启用调试日志"
echo "  NODE_OPTIONS=--max-old-space-size=4096  # 增加内存"
echo ""
