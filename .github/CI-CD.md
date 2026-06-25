# CI/CD Configuration

This project uses GitHub Actions for continuous integration and deployment.

## Workflows

### CI (`.github/workflows/ci.yml`)

Runs on every push and pull request to `master`, `main`, or `dev` branches.

**Jobs:**
- **Lint & Format Check** — ESLint + Prettier validation
- **Type Check** — TypeScript type checking
- **Test** — Run tests on 3 Node versions (18, 20, 22) × 3 platforms (Ubuntu, Windows, macOS) = 9 combinations
  - Generates code coverage report (Node 20 on Ubuntu)
  - Uploads to Codecov
- **Build** — Build the project and verify artifacts
- **All Checks Passed** — Final status gate

### Release (`.github/workflows/release.yml`)

Runs when you push a tag matching `v*` (e.g., `v0.7.1`).

**Steps:**
1. Run tests
2. Build the project
3. Publish to npm (requires `NPM_TOKEN` secret)
4. Create GitHub Release with auto-generated notes

### Dependency Review (`.github/workflows/dependency-review.yml`)

Runs on pull requests to `master` or `main`.

**Purpose:**
- Reviews dependency changes
- Fails on moderate+ severity vulnerabilities
- Posts summary comment in PR

## Setup

### Required Secrets

Add these in GitHub repository settings → Secrets and variables → Actions:

1. **`NPM_TOKEN`** (for release workflow)
   - Get from [npmjs.com](https://www.npmjs.com/settings/~/tokens)
   - Must have "Automation" or "Publish" scope

2. **`CODECOV_TOKEN`** (optional, for coverage)
   - Get from [codecov.io](https://about.codecov.io/) after linking your repo
   - Improves upload reliability (not strictly required for public repos)

### Release Process

```bash
# Bump version in package.json
npm version patch  # or minor/major

# Push tag to trigger release
git push --follow-tags

# Or manually create and push tag
git tag v0.7.1
git push origin v0.7.1
```

The release workflow will automatically:
- Test & build
- Publish to npm
- Create GitHub release

## Status Badges

The README includes these badges:
- **CI** — Build status
- **Codecov** — Test coverage percentage
- **npm version** — Latest published version
- **License** — MIT

## Local Checks

Before pushing, run locally:

```bash
npm run lint        # ESLint
npm run format:check # Prettier
npm run check       # TypeScript
npm test            # Tests
npm run build       # Build
```

Or use the pre-commit hook (husky + lint-staged is already configured).
