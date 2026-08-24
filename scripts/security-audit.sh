#!/bin/bash
# Security audit script for CodeYang
# Checks for common security issues and credential leaks

set -e

echo "🔍 CodeYang Security Audit"
echo "=========================="
echo ""

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 1. Check .env in .gitignore
echo "📋 1. Checking .gitignore protection..."
if git check-ignore .env >/dev/null 2>&1; then
  echo -e "${GREEN}✅ .env is properly gitignored${NC}"
else
  echo -e "${RED}❌ WARNING: .env is NOT gitignored!${NC}"
  echo "   Run: echo '.env' >> .gitignore"
fi

if git check-ignore .env.local >/dev/null 2>&1; then
  echo -e "${GREEN}✅ .env.local is properly gitignored${NC}"
else
  echo -e "${YELLOW}⚠️  .env.local is not gitignored${NC}"
fi

echo ""

# 2. Check for accidentally committed secrets
echo "📋 2. Checking for committed .env files..."
if git ls-files | grep -E "\.env$|\.env\..*" | grep -v "\.env\.example"; then
  echo -e "${RED}❌ WARNING: .env file(s) found in git!${NC}"
else
  echo -e "${GREEN}✅ No .env files in git${NC}"
fi

echo ""

# 3. Check config file permissions (Unix only)
echo "📋 3. Checking config file permissions..."
if [ -f ~/.codeyang/config.json ]; then
  PERMS=$(stat -c "%a" ~/.codeyang/config.json 2>/dev/null || stat -f "%Lp" ~/.codeyang/config.json 2>/dev/null)
  if [ "$PERMS" = "600" ]; then
    echo -e "${GREEN}✅ Config file has secure permissions (600)${NC}"
  else
    echo -e "${YELLOW}⚠️  Config file permissions: $PERMS (recommended: 600)${NC}"
    echo "   Run: chmod 600 ~/.codeyang/config.json"
  fi
else
  echo -e "${GREEN}✅ No config file found yet${NC}"
fi

echo ""

# 4. Scan current codebase
echo "📋 4. Scanning source code for secrets..."
FOUND_SECRETS=0

# Simple regex patterns
if grep -r -E "(sk-[a-zA-Z0-9]{20,}|AKIA[0-9A-Z]{16}|ghp_[a-zA-Z0-9]{36})" src/ --include="*.ts" --include="*.js" 2>/dev/null | grep -v "test\|REDACTED\|example"; then
  echo -e "${RED}❌ Potential secrets found in source code!${NC}"
  FOUND_SECRETS=1
else
  echo -e "${GREEN}✅ No obvious secrets in source code${NC}"
fi

echo ""

# 5. Check npm dependencies
echo "📋 5. Checking npm dependencies for vulnerabilities..."
if command -v npm >/dev/null 2>&1; then
  if npm audit --audit-level=moderate 2>/dev/null; then
    echo -e "${GREEN}✅ No moderate+ vulnerabilities found${NC}"
  else
    echo -e "${YELLOW}⚠️  Vulnerabilities detected, run: npm audit fix${NC}"
  fi
else
  echo -e "${YELLOW}⚠️  npm not found, skipping dependency check${NC}"
fi

echo ""

# 6. Check for hardcoded URLs with credentials
echo "📋 6. Checking for URLs with embedded credentials..."
if grep -r -E "https?://[^:]+:[^@]+@" src/ --include="*.ts" --include="*.js" 2>/dev/null; then
  echo -e "${RED}❌ URLs with credentials found!${NC}"
  FOUND_SECRETS=1
else
  echo -e "${GREEN}✅ No URLs with embedded credentials${NC}"
fi

echo ""

# 7. Check pre-commit hook
echo "📋 7. Checking pre-commit hook..."
if [ -f .husky/pre-commit ]; then
  if grep -q "secret-scan" .husky/pre-commit; then
    echo -e "${GREEN}✅ Pre-commit secret scan is active${NC}"
  else
    echo -e "${YELLOW}⚠️  Pre-commit hook exists but no secret scan${NC}"
  fi
else
  echo -e "${RED}❌ No pre-commit hook found${NC}"
  echo "   Run: npm install"
fi

echo ""

# Summary
echo "=========================="
echo "📊 Audit Summary"
echo "=========================="

if [ $FOUND_SECRETS -eq 0 ]; then
  echo -e "${GREEN}✅ No critical issues found${NC}"
  exit 0
else
  echo -e "${RED}❌ Critical issues detected - please review above${NC}"
  exit 1
fi
