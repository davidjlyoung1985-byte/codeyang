# External Projects Migration Plan

## Status: Proposal

## Overview
Move peripheral projects out of the main codeyang repository to improve focus and maintainability.

## Projects to Extract

### 1. vscode-extension/ (27 files, 0.27 MB)
**Current**: VS Code extension for CodeYang integration
**Proposal**: Move to separate `codeyang-vscode` repository
**Reason**: Different release cycle, VS Code marketplace publishing

### 2. web/ (8 files, 0.02 MB)
**Current**: Web interface wrapper
**Proposal**: Move to separate `codeyang-web` repository
**Reason**: Different deployment model, web-specific dependencies

### 3. spacey/ (14 files, 0.03 MB)
**Current**: C++ spatial analysis tools
**Proposal**: Move to separate `spacey` repository or archive
**Reason**: Different language/build system, unclear integration status

### 4. wps-addin/ (5 files, 0.01 MB)
**Current**: WPS Office add-in
**Proposal**: Move to separate `codeyang-wps` repository or archive
**Reason**: Niche use case, WPS-specific

## Implementation Options

### Option A: Separate Repositories
```bash
# Create new repos
git subtree split -P vscode-extension -b vscode-extension
git subtree split -P web -b web
git subtree split -P spacey -b spacey
git subtree split -P wps-addin -b wps-addin

# Push to new repos (after creating on GitHub)
# git push <new-repo-url> vscode-extension:master
```

### Option B: Git Submodules
```bash
# After creating separate repos
git rm -r vscode-extension web spacey wps-addin
git submodule add https://github.com/org/codeyang-vscode vscode-extension
git submodule add https://github.com/org/codeyang-web web
```

### Option C: Monorepo with Clear Separation
Keep in same repo but move to `/integrations` or `/clients` directory:
```
codeyang/
  src/               # Core agent code
  integrations/
    vscode/
    web/
    wps/
  experiments/
    spacey/
```

## Recommendation

**Option A (Separate Repositories)** for:
- vscode-extension → Independent release cycle
- web → Different deployment model

**Archive** (move to docs/archive/):
- spacey/ → Experimental, unclear status
- wps-addin/ → Minimal code, niche use case

## Benefits

1. **Cleaner Core**: Main repo focuses on agent logic only
2. **Independent Versioning**: Each project can version independently
3. **Smaller Clone Size**: Users only clone what they need
4. **Clearer CI**: Each repo has relevant CI pipelines
5. **Better Discoverability**: Dedicated repos are easier to find

## Migration Steps

1. Extract history with `git filter-repo` to preserve commit history
2. Create new GitHub repositories
3. Update main README to link to integration repos
4. Remove from main repo or convert to submodules
5. Update CI/CD workflows
6. Communicate changes to users

## Timeline

- Week 1: Extract vscode-extension and web
- Week 2: Archive spacey and wps-addin
- Week 3: Update documentation and CI
- Week 4: Announce changes

## Questions

- Do we want to preserve git history for extracted projects?
- Should archived projects be available as separate branches?
- Do we maintain backward compatibility (keep empty dirs with README redirects)?
