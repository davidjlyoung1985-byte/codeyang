# Release Process

This document describes the process for releasing new versions of CodeYang.

## Version Numbering

CodeYang follows [Semantic Versioning](https://semver.org/):

- **MAJOR** version when you make incompatible API changes
- **MINOR** version when you add functionality in a backward compatible manner
- **PATCH** version when you make backward compatible bug fixes

Format: `vMAJOR.MINOR.PATCH` (e.g., v0.9.0)

## Pre-Release Checklist

Before starting a release, ensure:

- [ ] All tests pass locally: `npm test`
- [ ] Build succeeds: `npm run build`
- [ ] Type checking passes: `npm run check`
- [ ] Linting passes: `npm run lint`
- [ ] Git working directory is clean (no uncommitted changes)
- [ ] You're on the `master` branch
- [ ] Your local branch is up to date with origin

```bash
git checkout master
git pull origin master
npm test
npm run build
```

## Release Steps

### Option 1: Using the Release Script (Recommended)

#### On Unix/Linux/macOS:
```bash
# Patch release (0.8.0 → 0.8.1)
./scripts/release.sh patch

# Minor release (0.8.0 → 0.9.0)
./scripts/release.sh minor

# Major release (0.8.0 → 1.0.0)
./scripts/release.sh major

# Specific version
./scripts/release.sh 0.9.0
```

#### On Windows:
```powershell
# Patch release
.\scripts\release.ps1 patch

# Minor release
.\scripts\release.ps1 minor

# Major release
.\scripts\release.ps1 major

# Specific version
.\scripts\release.ps1 0.9.0
```

The script will:
1. Validate the environment
2. Update package.json version
3. Run tests and build
4. Prompt you to update CHANGELOG.md
5. Create a git commit
6. Create a git tag
7. Push to GitHub (with confirmation)

### Option 2: Manual Release

If you prefer to release manually:

```bash
# 1. Update version in package.json
npm version patch  # or minor, or major

# 2. Run tests and build
npm test
npm run build

# 3. Update CHANGELOG.md
# Add release notes for the new version

# 4. Commit changes
git add package.json package-lock.json CHANGELOG.md
git commit -m "chore: release v0.9.0"

# 5. Create tag
git tag -a v0.9.0 -m "Release v0.9.0"

# 6. Push to GitHub
git push origin master
git push origin v0.9.0
```

## What Happens After Push

Once you push a version tag (e.g., `v0.9.0`), the GitHub Actions workflow will:

1. **Run CI checks** - Tests, lint, type checking
2. **Build the project** - Create distribution files
3. **Generate release notes** - Extract from CHANGELOG.md or git log
4. **Create GitHub Release** - Visible at https://github.com/davidjlyoung1985-byte/codeyang/releases
5. **Upload artifacts** - dist/, package.json, README.md
6. **(Optional) Publish to NPM** - If configured

Monitor the workflow at: https://github.com/davidjlyoung1985-byte/codeyang/actions

## CHANGELOG.md Format

Keep CHANGELOG.md up to date with each release:

```markdown
# Changelog

All notable changes to this project will be documented in this file.

## [0.9.0] - 2026-09-12

### Added
- New feature X
- New feature Y

### Changed
- Improved performance of Z

### Fixed
- Bug fix A
- Bug fix B

### Breaking Changes
- API change description

## [0.8.0] - 2026-09-11
...
```

## Pre-Release Versions

For alpha, beta, or release candidate versions:

```bash
# Alpha
npm version 0.9.0-alpha.1

# Beta
npm version 0.9.0-beta.1

# Release Candidate
npm version 0.9.0-rc.1
```

These will be marked as "pre-release" in GitHub Releases.

## Hotfix Process

For urgent fixes to production:

1. Create a hotfix branch from the release tag:
   ```bash
   git checkout -b hotfix/0.8.1 v0.8.0
   ```

2. Make the fix and commit

3. Run the release script for a patch version:
   ```bash
   ./scripts/release.sh patch
   ```

4. Merge back to master:
   ```bash
   git checkout master
   git merge hotfix/0.8.1
   git push origin master
   ```

## Rollback Process

If a release has critical issues:

### 1. Delete the GitHub Release
- Go to https://github.com/davidjlyoung1985-byte/codeyang/releases
- Delete the problematic release

### 2. Delete the Git Tag
```bash
# Delete local tag
git tag -d v0.9.0

# Delete remote tag
git push origin :refs/tags/v0.9.0
```

### 3. Revert the Version Commit
```bash
git revert HEAD
git push origin master
```

### 4. Communicate
- Post an issue explaining the problem
- Update users via README or announcements

## Post-Release Tasks

After a successful release:

- [ ] Verify the GitHub Release is created
- [ ] Test the release artifacts
- [ ] Update documentation if needed
- [ ] Announce on relevant channels
- [ ] Close related issues/PRs

## Troubleshooting

### "Git working directory not clean"
Commit or stash your changes before releasing.

### "Tests failed"
Fix the failing tests before releasing.

### "Tag already exists"
Either use a different version number or delete the existing tag:
```bash
git tag -d v0.9.0
git push origin :refs/tags/v0.9.0
```

### "Push failed"
Ensure you have push permissions and your SSH/HTTPS credentials are configured.

## Historical Tags

For versions released before this process was established, tags have been retroactively created:

- v0.8.0 - Current release
- v0.7.1 - Previous stable
- v0.7.0 - Feature release
- v0.6.1 - Bug fix release

## References

- [Semantic Versioning](https://semver.org/)
- [Keep a Changelog](https://keepachangelog.com/)
- [GitHub Releases](https://docs.github.com/en/repositories/releasing-projects-on-github)
