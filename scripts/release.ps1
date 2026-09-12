# Release script for CodeYang (Windows)
# Usage: .\scripts\release.ps1 [major|minor|patch|version]

param(
    [Parameter(Mandatory=$true)]
    [string]$VersionType
)

$ErrorActionPreference = "Stop"

# Check if we're in the right directory
if (-not (Test-Path "package.json")) {
    Write-Host "Error: package.json not found. Run this script from the project root." -ForegroundColor Red
    exit 1
}

# Check if git is clean
$gitStatus = git status --porcelain
if ($gitStatus) {
    Write-Host "Error: Git working directory is not clean. Commit or stash changes first." -ForegroundColor Red
    git status --short
    exit 1
}

# Get current version
$packageJson = Get-Content package.json | ConvertFrom-Json
$currentVersion = $packageJson.version
Write-Host "Current version: $currentVersion" -ForegroundColor Green

# Determine new version
if ($VersionType -match '^\d+\.\d+\.\d+$') {
    $newVersion = $VersionType
} else {
    $versionParts = $currentVersion.Split('.')
    $major = [int]$versionParts[0]
    $minor = [int]$versionParts[1]
    $patch = [int]$versionParts[2]

    switch ($VersionType) {
        'major' {
            $major++
            $minor = 0
            $patch = 0
        }
        'minor' {
            $minor++
            $patch = 0
        }
        'patch' {
            $patch++
        }
        default {
            Write-Host "Error: Invalid version type. Use major, minor, patch, or a version number." -ForegroundColor Red
            exit 1
        }
    }

    $newVersion = "$major.$minor.$patch"
}

Write-Host "New version will be: $newVersion" -ForegroundColor Yellow
$confirmation = Read-Host "Continue? (y/n)"
if ($confirmation -ne 'y' -and $confirmation -ne 'Y') {
    Write-Host "Aborted."
    exit 0
}

# Update package.json version
Write-Host "Updating package.json..." -ForegroundColor Green
npm version $newVersion --no-git-tag-version

# Run tests
Write-Host "Running tests..." -ForegroundColor Green
npm test

# Run build
Write-Host "Building project..." -ForegroundColor Green
npm run build

# Create CHANGELOG entry if exists
if (Test-Path "CHANGELOG.md") {
    Write-Host "Update CHANGELOG.md with release notes" -ForegroundColor Green
    Write-Host "Edit CHANGELOG.md now, then press Enter to continue..."
    Read-Host
}

# Git commit
Write-Host "Creating git commit..." -ForegroundColor Green
git add package.json package-lock.json
git commit -m "chore: bump version to $newVersion"

# Create git tag
Write-Host "Creating git tag v$newVersion..." -ForegroundColor Green
git tag -a "v$newVersion" -m "Release v$newVersion"

# Push to remote
Write-Host "Ready to push. This will:" -ForegroundColor Yellow
Write-Host "  1. Push commits to origin"
Write-Host "  2. Push tag v$newVersion"
Write-Host "  3. Trigger GitHub Actions release workflow"
Write-Host ""
$pushConfirmation = Read-Host "Push now? (y/n)"
if ($pushConfirmation -eq 'y' -or $pushConfirmation -eq 'Y') {
    git push origin master
    git push origin "v$newVersion"
    Write-Host "✓ Released version $newVersion!" -ForegroundColor Green
    Write-Host "Check GitHub Actions: https://github.com/davidjlyoung1985-byte/codeyang/actions"
} else {
    Write-Host "Tag created locally but not pushed." -ForegroundColor Yellow
    Write-Host "To push later, run:"
    Write-Host "  git push origin master"
    Write-Host "  git push origin v$newVersion"
}
