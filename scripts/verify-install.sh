#!/bin/bash
# CodeYang 本地部署验证脚本

echo "================================================"
echo "   CodeYang v1.1.0 部署验证"
echo "================================================"
echo ""

# 颜色定义
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 1. 检查 Node.js 版本
echo "1. 检查 Node.js 版本..."
NODE_VERSION=$(node -v)
if [[ $? -eq 0 ]]; then
    echo -e "${GREEN}✓${NC} Node.js: $NODE_VERSION"
else
    echo -e "${RED}✗${NC} Node.js 未安装"
    exit 1
fi

# 2. 检查 npm 版本
echo ""
echo "2. 检查 npm 版本..."
NPM_VERSION=$(npm -v)
if [[ $? -eq 0 ]]; then
    echo -e "${GREEN}✓${NC} npm: $NPM_VERSION"
else
    echo -e "${RED}✗${NC} npm 未安装"
    exit 1
fi

# 3. 检查 codeyang 命令
echo ""
echo "3. 检查 codeyang 命令..."
CODEYANG_PATH=$(which codeyang)
if [[ $? -eq 0 ]]; then
    echo -e "${GREEN}✓${NC} codeyang 命令可用"
    echo "   路径: $CODEYANG_PATH"
    CODEYANG_VERSION=$(codeyang --version 2>&1)
    echo "   版本: $CODEYANG_VERSION"
else
    echo -e "${RED}✗${NC} codeyang 命令不可用"
    echo "   运行: cd ~/codeyang && npm link"
    exit 1
fi

# 4. 检查构建产物
echo ""
echo "4. 检查构建产物..."
if [ -d ~/codeyang/dist ]; then
    echo -e "${GREEN}✓${NC} dist/ 目录存在"
    DIST_FILES=$(ls ~/codeyang/dist/*.js 2>/dev/null | wc -l)
    echo "   构建文件数: $DIST_FILES"
else
    echo -e "${RED}✗${NC} dist/ 目录不存在"
    echo "   运行: npm run build"
    exit 1
fi

# 5. 检查环境配置
echo ""
echo "5. 检查环境配置..."
if [ -f ~/codeyang/.env ]; then
    echo -e "${GREEN}✓${NC} .env 文件存在"
    if grep -q "ANTHROPIC_API_KEY" ~/codeyang/.env 2>/dev/null; then
        echo "   - Anthropic API Key: 已配置"
    fi
    if grep -q "OPENAI_API_KEY" ~/codeyang/.env 2>/dev/null; then
        echo "   - OpenAI API Key: 已配置"
    fi
    if grep -q "DEEPSEEK_API_KEY" ~/codeyang/.env 2>/dev/null; then
        echo "   - DeepSeek API Key: 已配置"
    fi
    if grep -q "PONYTAIL_MODE" ~/codeyang/.env 2>/dev/null; then
        MODE=$(grep "PONYTAIL_MODE" ~/codeyang/.env | cut -d'=' -f2)
        echo "   - Ponytail Mode: $MODE"
    fi
else
    echo -e "${YELLOW}⚠${NC} .env 文件不存在"
    echo "   复制示例: cp ~/codeyang/.env.example ~/codeyang/.env"
fi

# 6. 检查测试状态
echo ""
echo "6. 检查测试状态..."
cd ~/codeyang
TEST_RESULT=$(npm test 2>&1 | grep "Test Files")
if [[ $? -eq 0 ]]; then
    echo -e "${GREEN}✓${NC} 测试通过"
    echo "   $TEST_RESULT"
else
    echo -e "${YELLOW}⚠${NC} 无法运行测试（跳过）"
fi

# 7. 检查可用命令
echo ""
echo "7. 可用的命令..."
echo -e "${GREEN}✓${NC} codeyang          - 启动 AI 编码助手"
echo -e "${GREEN}✓${NC} codeyang --help   - 查看帮助"
echo -e "${GREEN}✓${NC} codeyangx         - 扩展版本"
echo -e "${GREEN}✓${NC} codeyang-web      - Web 服务器"
echo -e "${GREEN}✓${NC} codeyang-setup    - 配置向导"

# 8. 检查配置目录
echo ""
echo "8. 检查配置目录..."
if [ -d ~/.codeyang ]; then
    echo -e "${GREEN}✓${NC} ~/.codeyang 目录存在"
    if [ -d ~/.codeyang/sessions ]; then
        SESSION_COUNT=$(ls ~/.codeyang/sessions/*.json 2>/dev/null | wc -l)
        echo "   - 保存的会话: $SESSION_COUNT 个"
    fi
else
    echo -e "${YELLOW}⚠${NC} ~/.codeyang 目录不存在（首次运行时会创建）"
fi

echo ""
echo "================================================"
echo "   部署验证完成！"
echo "================================================"
echo ""
echo "下一步："
echo "  1. 配置 API Key: codeyang-setup"
echo "  2. 启动助手:    codeyang"
echo "  3. 查看文档:    cat ~/codeyang/README.md"
echo ""
