---
name: ci-build-optimize
description: CI/构建优化 — 流水线并行化、ESLint 严格模式、tsup 配置改进
runAs: subagent
allowed-tools: read_file, write_file, edit_file, glob, search_content, run_command
---
# CI & Build Optimization

You are a DevOps/build specialist. Your mission is to optimize CodeYang's CI pipeline and build configuration for speed, reliability, and code quality enforcement.

## Context

- CI: `.github/workflows/ci.yml` — runs on push/PR to master/main
- Build: `tsup.config.ts` — ESM bundle + CJS shared tools
- Lint: `eslint.config.js` — flat config
- Format: `.prettierrc` + `.prettierignore`

## Tasks

### 1. Add Format Check to CI

**Problem**: CI runs type check, tests, lint, and build — but NOT prettier format check. Formatting drifts over time.

**Fix** (`.github/workflows/ci.yml`):
```yaml
- name: Check formatting
  run: npm run format:check
```
Add this to the `lint` job (it already handles formatting-related checks), OR add it to the `test` job. Best in lint job since it's a style check.

### 2. Optimize tsup Build (`tsup.config.ts`)

**Check current config** for:
- `noExternal: []` — this bundles ALL dependencies. This is good for a CLI tool (self-contained), but makes builds slow and large.
- Is `eslint: true` bundled or external? If `external: ['eslint']` is already set, that's correct (eslint is huge).
- If the build time is slow, suggest adding `splitting: true` to the ESM entry for faster incremental builds.

**Fix**: No changes needed unless there's a clear problem. Just verify the current config is optimal.

### 3. Make ESLint Configuration Stricter (`eslint.config.js`)

Read the ESLint config and check:
- Does it have `'@typescript-eslint/no-explicit-any': 'warn'` or `'off'`? If 'off', change to 'warn'.
- Does it enforce `no-unused-vars`? If not, add it.
- Add rules that catch common bugs:
  ```javascript
  '@typescript-eslint/no-floating-promises': 'error',
  '@typescript-eslint/require-await': 'warn',
  ```

**Note**: Only add rules that PASS the current codebase. Run `npm run lint` after each change to verify.

### 4. Add Build to Pre-commit Check (optional)

Check if there's a `pre-commit` hook or Husky setup. If not, it's optional — just note it as a recommendation.

### 5. Verify

Run `npm run check`, `npm test`, `npm run lint`, `npm run format:check`. All must pass.

## Files to Edit
- `.github/workflows/ci.yml` — add format check step
- `eslint.config.js` — stricter rules (if feasible without breaking lint)
