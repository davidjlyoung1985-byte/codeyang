#!/bin/bash
# CodeYang 快速启动脚本

echo "==================================="
echo "  CodeYang AI Coding Agent"
echo "==================================="
echo ""

# 检查是否在正确的目录
if [ ! -f "package.json" ]; then
    echo "❌ 错误: 请在 codeyang 项目根目录运行此脚本"
    exit 1
fi

# 检查构建文件
if [ ! -f "dist/index.js" ]; then
    echo "⚠️  未找到构建文件，正在构建..."
    npm run build
    if [ $? -ne 0 ]; then
        echo "❌ 构建失败"
        exit 1
    fi
    echo "✅ 构建完成"
fi

# 检查环境变量
if [ -z "$DEEPSEEK_API_KEY" ] && [ -z "$CODEYANG_API_KEY" ]; then
    echo "⚠️  未检测到 API 密钥环境变量"
    if [ -f ".env" ]; then
        echo "✅ 将使用 .env 文件中的配置"
    else
        echo "💡 提示: 首次运行会提示输入 API 密钥"
    fi
fi

echo ""
echo "🚀 启动 CodeYang..."
echo "-----------------------------------"
echo ""

# 启动
node dist/index.js "$@"
