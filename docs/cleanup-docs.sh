#!/bin/bash
# 文档清理脚本 - 将历史文档移到 archive/

set -e

# 要保留在根目录的核心文档
KEEP_FILES=(
  "README.md"
  "QUICKSTART.md"
  "SECURITY.md"
  "CHANGELOG.md"
  "CONTRIBUTING.md"
  "CONTRIBUTING.en.md"
  "FAQ.md"
  "FAQ.en.md"
  "USER_GUIDE.en.md"
  "QUICK_START.en.md"
  "FINAL_AUDIT_REPORT.md"
  "LATEST_AUDIT.md"
  "SECURITY_AUDIT.md"
  "architecture.md"
  "api-reference.md"
  "DEPLOYMENT.md"
  "DOCKER_GUIDE.md"
  "TROUBLESHOOTING.md"
  "TESTING.md"
  "DIFFERENTIATION.md"
  "ponytail-methodology.md"
)

# 要归档的历史文档模式
ARCHIVE_PATTERNS=(
  "*IMPROVEMENT*.md"
  "*REPORT*.md"
  "*SUMMARY*.md"
  "*STATUS*.md"
  "*PHASE*.md"
  "*COMPLETE*.md"
  "*FIXES*.md"
  "*FIX_*.md"
  "*PROGRESS*.md"
  "*ROADMAP*.md"
  "*EXECUTION*.md"
  "*MILESTONE*.md"
  "*PLAN*.md"
  "RELEASE-*.md"
  "RELEASE_*.md"
  "*OPTIMIZATION*.md"
  "*PERFORMANCE_*.md"
  "*COVERAGE_*.md"
  "*SECURITY_FIX*.md"
  "*ALERT*.md"
  "*REFACTOR*.md"
  "*ANALYSIS*.md"
  "*BENCHMARK*.md"
  "*ASSESSMENT*.md"
  "*WORK_SUMMARY*.md"
  "*PROJECT-REVIEW*.md"
  "*AGENT_*.md"
  "*BRIDGE_*.md"
  "*CLOSED_LOOP*.md"
  "*RL_*.md"
  "*ESBUILD*.md"
  "*GLOBAL_*.md"
  "*CRITICAL_*.md"
  "*ERROR_*.md"
  "sandbox-*.md"
  "bridge-*.md"
  "*GUIDE_*.md"
  "*USAGE_*.md"
  "*TOGGLE_*.md"
  "*CUI_*.md"
  "*INLINE_*.md"
  "*VSCODE_*.md"
  "*CONNECT_*.md"
  "*GITHUB_*.md"
  "*MOTION_*.md"
  "*NPM_*.md"
  "*TOOL_*.md"
  "*EXTERNAL_*.md"
  "*STATISTICS*.md"
  "*ORGANIZATION*.md"
  "*QUALITY*.md"
  "TODAY_*.md"
  "V1_*.md"
  "CHANGELOG_v*.md"
  "*IMPROVEMENTS-*.md"
)

echo "🧹 清理文档目录..."
echo ""

# 确保在 docs 目录
cd "$(dirname "$0")"

# 创建临时列表
MOVE_LIST=()

# 根据模式查找需要归档的文件
for pattern in "${ARCHIVE_PATTERNS[@]}"; do
  for file in $pattern; do
    if [ -f "$file" ]; then
      # 检查是否在保留列表中
      should_keep=0
      for keep in "${KEEP_FILES[@]}"; do
        if [ "$file" = "$keep" ]; then
          should_keep=1
          break
        fi
      done

      if [ $should_keep -eq 0 ]; then
        MOVE_LIST+=("$file")
      fi
    fi
  done
done

# 去重
MOVE_LIST=($(printf '%s\n' "${MOVE_LIST[@]}" | sort -u))

if [ ${#MOVE_LIST[@]} -eq 0 ]; then
  echo "✅ 没有需要归档的文档"
  exit 0
fi

echo "📦 将以下 ${#MOVE_LIST[@]} 个文档移到 archive/:"
echo ""
printf '%s\n' "${MOVE_LIST[@]}"
echo ""

read -p "继续? (y/N) " -n 1 -r
echo ""

if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  echo "❌ 已取消"
  exit 1
fi

# 移动文件
for file in "${MOVE_LIST[@]}"; do
  mv "$file" "archive/"
  echo "  ✓ $file"
done

echo ""
echo "✅ 清理完成！已归档 ${#MOVE_LIST[@]} 个文档"
echo ""
echo "📁 保留的核心文档:"
ls -1 *.md 2>/dev/null | head -20
