# Example 3: Code Analysis and Refactoring

Analyze code quality, find issues, and perform intelligent refactoring.

## Scenario

You've inherited a legacy codebase and need to:
1. Analyze code quality and complexity
2. Find potential bugs and code smells
3. Refactor duplicate code
4. Improve naming and structure

## Step-by-Step

### 1. Code Quality Analysis

```
Analyze the code quality of src/ directory. Report:
- Files with high complexity
- Potential bugs
- Code smells
- Unused imports
```

**CodeYang workflow:**
1. `Glob` — Find all source files
2. `Read` — Read each file
3. `CodeAnalysis` — Analyze AST, complexity, patterns
4. Generate report

**Example Output:**
```
Code Quality Report
===================

High Complexity (Cyclomatic > 10):
  src/utils/parser.ts:45 — parseConfig() (complexity: 15)
  src/api/handler.ts:120 — processRequest() (complexity: 12)

Potential Bugs:
  src/database.ts:23 — Missing error handling in async function
  src/api/routes.ts:56 — Unhandled promise rejection

Code Smells:
  src/utils/helpers.ts — 5 functions > 50 lines (consider splitting)
  src/models/user.ts — God class (18 methods, 300 lines)

Unused Imports:
  src/index.ts — 'lodash' imported but not used
  src/config.ts — 'fs' imported but not used

Recommendations:
  1. Split parseConfig() into smaller functions
  2. Add try-catch blocks in async functions
  3. Extract helper functions into separate modules
  4. Refactor User class into smaller services
```

### 2. Find Duplicate Code

```
Find duplicate or similar code blocks in src/.
```

**Tools used:** `Grep`, `CodeAnalysis`, AST comparison

**Example Output:**
```
Duplicate Code Detected
=======================

Block 1 (src/auth/login.ts:15-30) ~ Block 2 (src/auth/register.ts:20-35)
Similarity: 85%

Suggested Refactoring:
  Extract common code into validateCredentials()
  Location: src/auth/validators.ts

Block 3 (src/utils/format.ts:40-50) == Block 4 (src/utils/display.ts:15-25)
Similarity: 100%

Suggested Refactoring:
  Remove duplicate from display.ts
  Import from format.ts instead
```

### 3. Automated Refactoring

#### Rename Symbol Across Files

```
Rename function 'getUserData' to 'fetchUserProfile' everywhere in the codebase.
```

**CodeYang:**
1. `Grep` — Find all occurrences
2. `Edit` — Replace in each file
3. Verify imports and references updated

#### Extract Function

```
In src/api/handler.ts, extract lines 45-70 into a new function called 'validateRequest'.
```

**CodeYang:**
1. `Read` — Read the file
2. Analyze extracted code for parameters and return type
3. `Edit` — Create new function and replace original code
4. Update references

**Before:**
```typescript
async function processRequest(req: Request) {
  // Validation logic (lines 45-70)
  if (!req.body) throw new Error('Missing body');
  if (!req.body.email) throw new Error('Missing email');
  if (!req.body.password) throw new Error('Missing password');
  if (req.body.password.length < 8) throw new Error('Password too short');
  
  // ... rest of function
}
```

**After:**
```typescript
function validateRequest(body: any): void {
  if (!body) throw new Error('Missing body');
  if (!body.email) throw new Error('Missing email');
  if (!body.password) throw new Error('Missing password');
  if (body.password.length < 8) throw new Error('Password too short');
}

async function processRequest(req: Request) {
  validateRequest(req.body);
  
  // ... rest of function
}
```

#### Organize Imports

```
Organize and sort all imports in the project.
```

**Tools used:** `RefactorOrganizeImports` (from recent additions)

**Before:**
```typescript
import { z } from 'zod';
import fs from 'fs';
import { User } from './models/user';
import express from 'express';
import { validateEmail } from './utils/validators';
import path from 'path';
```

**After:**
```typescript
// Node.js built-ins
import fs from 'fs';
import path from 'path';

// External packages
import express from 'express';
import { z } from 'zod';

// Local imports
import { User } from './models/user';
import { validateEmail } from './utils/validators';
```

### 4. Security Analysis

```
Scan the codebase for security vulnerabilities:
- SQL injection risks
- XSS vulnerabilities
- Hardcoded secrets
- Insecure dependencies
```

**Example Output:**
```
Security Issues Found
=====================

🔴 CRITICAL (2):
  src/database.ts:45 — SQL injection risk
    Query: `SELECT * FROM users WHERE id = ${userId}`
    Fix: Use parameterized queries

  src/config.ts:12 — Hardcoded API key
    const API_KEY = 'sk-1234567890'
    Fix: Move to environment variable

🟡 HIGH (3):
  src/api/routes.ts:67 — XSS vulnerability
    Rendering user input without escaping
    Fix: Use template engine with auto-escaping

  package.json — Outdated dependency with known CVE
    lodash@4.17.15 (CVE-2021-23337)
    Fix: Update to lodash@4.17.21

  src/auth/password.ts:23 — Weak password hashing
    Using MD5 instead of bcrypt
    Fix: Migrate to bcrypt or argon2

🟢 MEDIUM (1):
  src/utils/crypto.ts:30 — Insecure random number generation
    Using Math.random() for tokens
    Fix: Use crypto.randomBytes()
```

### 5. Performance Optimization Suggestions

```
Identify performance bottlenecks and suggest optimizations.
```

**Example Output:**
```
Performance Analysis
====================

Slow Operations:
  src/api/handler.ts:90 — Synchronous file read in request handler
    Blocks event loop (15ms avg)
    Fix: Use fs.promises.readFile()

  src/utils/parser.ts:45 — Nested loops O(n²)
    Processing time grows quadratically
    Fix: Use Map for O(n) lookup

Memory Leaks:
  src/cache.ts:30 — Unbounded cache growth
    No size limit or TTL
    Fix: Implement LRU cache with max size

Optimization Opportunities:
  ✓ Add caching to fetchUserProfile() (called 1000+ times)
  ✓ Lazy-load heavy dependencies (reduces startup time)
  ✓ Use connection pooling for database queries
```

## Real-World Scenario: Refactoring Legacy Code

### Initial State
```typescript
// src/legacy/user-handler.ts (200 lines, complexity: 25)
function handleUser(req, res) {
  // 50 lines of validation
  // 30 lines of database logic
  // 40 lines of business logic
  // 30 lines of response formatting
  // 50 lines of error handling
}
```

### User Request
```
Refactor src/legacy/user-handler.ts:
1. Split into smaller functions (< 20 lines each)
2. Extract validation into separate module
3. Move database logic to repository pattern
4. Add TypeScript types
5. Add unit tests
```

### CodeYang's Plan
```
Refactoring Plan
================

Step 1: Extract validation (lines 10-60)
  → src/validators/user-validator.ts

Step 2: Extract database logic (lines 61-90)
  → src/repositories/user-repository.ts

Step 3: Extract business logic (lines 91-130)
  → src/services/user-service.ts

Step 4: Extract response formatting (lines 131-160)
  → src/formatters/user-formatter.ts

Step 5: Convert to TypeScript
  → Add interfaces for User, Request, Response

Step 6: Add tests
  → Create user-handler.test.ts with 10+ test cases

Estimated changes: 6 files created, 1 file refactored
Proceed? (y/n)
```

### After Refactoring
```typescript
// src/api/handlers/user-handler.ts (20 lines, complexity: 3)
import { validateUserRequest } from '@/validators/user-validator';
import { UserRepository } from '@/repositories/user-repository';
import { UserService } from '@/services/user-service';
import { formatUserResponse } from '@/formatters/user-formatter';

export async function handleUser(req: Request, res: Response): Promise<void> {
  try {
    const validatedData = validateUserRequest(req.body);
    const user = await UserRepository.findById(validatedData.id);
    const processedUser = UserService.processUser(user);
    const response = formatUserResponse(processedUser);
    res.json(response);
  } catch (error) {
    handleError(error, res);
  }
}
```

## Try It Yourself

```bash
cd examples/03-code-analysis

# Setup sample codebase
npm install

# Start CodeYang
codeyang

# Try the scenarios above
```

## Tips for Effective Refactoring

### 1. Start Small
❌ "Refactor the entire codebase"
✅ "Refactor the authentication module"

### 2. Test After Each Change
```
After each refactoring step, run tests to ensure nothing broke.
```

### 3. Use Version Control
```
Create a refactoring branch before making changes.
Commit after each successful refactoring step.
```

### 4. Measure Impact
```
Before refactoring:
  - Run benchmark on current code
After refactoring:
  - Run benchmark again
  - Compare performance metrics
```

## Common Refactoring Patterns

1. **Extract Method** — Break down large functions
2. **Rename** — Improve variable/function names
3. **Extract Class** — Split god classes
4. **Inline** — Remove unnecessary abstractions
5. **Replace Magic Numbers** — Use named constants
6. **Introduce Parameter Object** — Group related parameters

---

**Next:** [Example 4: Testing Automation](../04-testing-automation/) (Coming soon)

## Further Reading

- [docs/api-reference.md](../../docs/api-reference.md) — Tool reference
- [CONTRIBUTING.md](../../CONTRIBUTING.md) — Extend CodeYang
- [docs/architecture.md](../../docs/architecture.md) — System design
