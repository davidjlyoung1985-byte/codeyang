# Example 2: Git Workflow Automation

Automate common Git workflows with natural language.

## Scenario

You're working on a feature branch and need to:
1. Create a new branch
2. Make changes across multiple files
3. Review changes
4. Commit with a descriptive message
5. Handle merge conflicts

## Step-by-Step

### 1. Create Feature Branch

```
Create a new branch called 'feature/add-authentication' from main.
```

**CodeYang executes:**
```bash
git checkout main
git pull
git checkout -b feature/add-authentication
```

**Tools used:** `GitBranch`, `GitCheckout`

### 2. Make Changes

```
Add authentication middleware:
1. Create src/middleware/auth.ts with JWT validation
2. Update src/index.ts to use the middleware
3. Add authentication section to README.md
```

**Tools used:** `Write`, `Edit`, `Read`

### 3. Review Changes

```
Show me all changes I've made since branching.
```

**CodeYang executes:**
```bash
git diff main..HEAD
```

**Output:**
```diff
diff --git a/src/middleware/auth.ts b/src/middleware/auth.ts
new file mode 100644
index 0000000..abcd123
--- /dev/null
+++ b/src/middleware/auth.ts
@@ -0,0 +1,20 @@
+import jwt from 'jsonwebtoken';
+
+export function authenticate(req, res, next) {
+  const token = req.headers.authorization?.split(' ')[1];
+  ...
```

**Tools used:** `GitDiff`

### 4. Stage and Commit

```
Stage all changes and commit with message:
"feat: add JWT authentication middleware

- Add auth.ts with token validation
- Integrate middleware in main app
- Update documentation"
```

**CodeYang executes:**
```bash
git add .
git commit -m "feat: add JWT authentication middleware..."
```

**Tools used:** `GitAdd`, `GitCommit`

### 5. Handle Merge Conflicts (Advanced)

```
Merge main branch into my feature branch. If there are conflicts in package.json, keep both dependency versions.
```

**CodeYang:**
1. Runs `git merge main`
2. Detects conflicts with `GitStatus`
3. Reads conflicted files with `Read`
4. Resolves conflicts with `Edit`
5. Stages resolved files with `GitAdd`
6. Completes merge with `GitCommit`

## Real-World Workflow

### Typical Development Cycle

```
User: "Start work on issue #123: Add user profile page"

CodeYang:
1. Creates branch: feature/user-profile-123
2. Creates component files
3. Adds tests
4. Updates routing
5. Shows preview of changes
6. Commits with proper message

User: "Push and create PR"

CodeYang:
1. Pushes branch to origin
2. Uses GitHub CLI to create PR
3. Links to issue #123
4. Adds PR description
```

### Git History Exploration

```
User: "Show me who last edited the authentication code and why"

CodeYang:
$ git log --follow -p src/middleware/auth.ts

Author: Alice <alice@example.com>
Date: 2025-01-15

feat: improve token validation

- Add expiry check
- Handle refresh tokens
- Add tests for edge cases
```

**Tools used:** `GitLog`

## Best Practices

### Commit Messages

✅ **Good:**
```
feat: add user authentication with JWT

- Implement login/logout endpoints
- Add middleware for protected routes
- Include unit tests

Closes #123
```

❌ **Bad:**
```
fixed stuff
```

### Branch Naming

✅ **Good:**
- `feature/user-authentication`
- `bugfix/fix-login-redirect`
- `refactor/improve-error-handling`

❌ **Bad:**
- `my-branch`
- `test`
- `asdf`

## Common Scenarios

### 1. Undo Last Commit

```
User: "I committed too early, undo the last commit but keep the changes"

CodeYang: git reset --soft HEAD~1
```

### 2. Cherry-Pick Commit

```
User: "Apply commit abc123 from main to this branch"

CodeYang: git cherry-pick abc123
```

### 3. Interactive Rebase (Clean History)

```
User: "Squash my last 3 commits into one"

CodeYang:
1. Creates backup branch
2. Runs git rebase -i HEAD~3
3. Squashes commits
4. Updates commit message
```

### 4. Stash Work in Progress

```
User: "Save my current work, I need to switch branches urgently"

CodeYang: git stash push -m "WIP: authentication feature"
```

## Try It Yourself

```bash
cd examples/02-git-workflow

# Initialize a test repo
git init
git config user.name "Test User"
git config user.email "test@example.com"

# Start CodeYang
codeyang

# Try the scenarios above
```

## Safety Features

CodeYang includes safety checks:
- ⚠️ Warns before destructive operations (reset, force push)
- ✅ Creates backup branches before rebases
- 🔍 Shows diffs before committing
- 🚫 Blocks commits with no staged changes

---

**Next:** [Example 3: Code Analysis](../03-code-analysis/)
