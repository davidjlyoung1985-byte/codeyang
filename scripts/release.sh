#!/bin/bash
# Release script for CodeYang
# Usage: ./scripts/release.sh [major|minor|patch|version]

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo -e "${RED}Error: package.json not found. Run this script from the project root.${NC}"
    exit 1
fi

# Check if git is clean
if [ -n "$(git status --porcelain)" ]; then
    echo -e "${RED}Error: Git working directory is not clean. Commit or stash changes first.${NC}"
    git status --short
    exit 1
fi

# Get current version
CURRENT_VERSION=$(node -p "require('./package.json').version")
echo -e "${GREEN}Current version: ${CURRENT_VERSION}${NC}"

# Determine new version
if [ $# -eq 0 ]; then
    echo "Usage: $0 [major|minor|patch|version]"
    echo "Example: $0 patch"
    echo "Example: $0 0.9.0"
    exit 1
fi

VERSION_TYPE=$1

if [[ $VERSION_TYPE =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    # Direct version specified
    NEW_VERSION=$VERSION_TYPE
else
    # Calculate new version based on type
    IFS='.' read -ra VERSION_PARTS <<< "$CURRENT_VERSION"
    MAJOR=${VERSION_PARTS[0]}
    MINOR=${VERSION_PARTS[1]}
    PATCH=${VERSION_PARTS[2]}

    case $VERSION_TYPE in
        major)
            MAJOR=$((MAJOR + 1))
            MINOR=0
            PATCH=0
            ;;
        minor)
            MINOR=$((MINOR + 1))
            PATCH=0
            ;;
        patch)
            PATCH=$((PATCH + 1))
            ;;
        *)
            echo -e "${RED}Error: Invalid version type. Use major, minor, patch, or a version number.${NC}"
            exit 1
            ;;
    esac

    NEW_VERSION="${MAJOR}.${MINOR}.${PATCH}"
fi

echo -e "${YELLOW}New version will be: ${NEW_VERSION}${NC}"
read -p "Continue? (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Aborted."
    exit 0
fi

# Update package.json version
echo -e "${GREEN}Updating package.json...${NC}"
npm version $NEW_VERSION --no-git-tag-version

# Run tests
echo -e "${GREEN}Running tests...${NC}"
npm test

# Run build
echo -e "${GREEN}Building project...${NC}"
npm run build

# Create CHANGELOG entry if CHANGELOG.md exists
if [ -f CHANGELOG.md ]; then
    echo -e "${GREEN}Update CHANGELOG.md with release notes${NC}"
    echo "Edit CHANGELOG.md now, then press Enter to continue..."
    read
fi

# Git commit
echo -e "${GREEN}Creating git commit...${NC}"
git add package.json package-lock.json
git commit -m "chore: bump version to ${NEW_VERSION}"

# Create git tag
echo -e "${GREEN}Creating git tag v${NEW_VERSION}...${NC}"
git tag -a "v${NEW_VERSION}" -m "Release v${NEW_VERSION}"

# Push to remote
echo -e "${YELLOW}Ready to push. This will:${NC}"
echo "  1. Push commits to origin"
echo "  2. Push tag v${NEW_VERSION}"
echo "  3. Trigger GitHub Actions release workflow"
echo ""
read -p "Push now? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    git push origin master
    git push origin "v${NEW_VERSION}"
    echo -e "${GREEN}✓ Released version ${NEW_VERSION}!${NC}"
    echo "Check GitHub Actions: https://github.com/davidjlyoung1985-byte/codeyang/actions"
else
    echo -e "${YELLOW}Tag created locally but not pushed.${NC}"
    echo "To push later, run:"
    echo "  git push origin master"
    echo "  git push origin v${NEW_VERSION}"
fi
