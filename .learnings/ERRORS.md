# Errors

Command failures and integration errors.

---

## ✅ P0: Code Injection in QtMathTool (2026-06-14) - FIXED

- **file**: `src/qt/tools/QtMathTool.ts:194`
- **severity**: CRITICAL
- **issue**: Used `new Function()` to evaluate user-controlled math expressions
  ```typescript
  // OLD (VULNERABLE):
  const result = new Function(`"use strict"; return (${mapped})`)();
  ```
- **impact**: Remote code execution - bypassed all sandboxing
- **fix_applied**: Replaced with `mathjs` library (v13.2.2) with sandboxed evaluation
  ```typescript
  // NEW (SECURE):
  import { create, all } from 'mathjs';
  const math = create(all);
  const result = math.evaluate(sanitized, limitedScope);
  ```
- **additional_protections**:
  - Forbidden pattern detection (import, require, eval, Function, arrow functions, constructor, prototype)
  - Expression length limit (500 chars)
  - Limited evaluation scope (no imports, no dangerous functions)
  - mathjs only allows mathematical expressions, no code execution
- **tests_added**: `src/qt/tools/QtMathTool.test.ts` with 24 tests (all passing)
  - 7 functional tests (arithmetic, functions, constants, edge cases)
  - 10 security tests (injection attempts, side effects, forbidden patterns)
  - 7 edge case tests
- **status**: ✅ FIXED (2026-06-14)
- **verified**: Build successful, all 24 tests passing

## 🔴 P0: Code Injection in QtMathTool (2026-06-14)

- **file**: `src/qt/tools/QtMathTool.ts:194`
- **severity**: CRITICAL
- **issue**: Uses `new Function()` to evaluate user-controlled math expressions
  ```typescript
  const result = new Function(`"use strict"; return (${mapped})`)();
  ```
- **impact**: Remote code execution - bypasses all sandboxing
- **current_protection**: Regex validation (lines 180-183) is fragile and incomplete
- **fix**: Replace with `mathjs` library with safe evaluation mode, or implement proper expression parser
- **status**: UNFIXED
- **priority**: IMMEDIATE (P0)

## 🟡 P1: Session Import Deserializes Untrusted Data (2026-06-14)

- **file**: `src/utils/sessionStore.ts`
- **severity**: HIGH
- **issue**: `importSessionFromFile()` parses JSON without validation - could deserialize malicious tool calls that execute on load
- **impact**: Arbitrary code execution via crafted session files
- **fix**: Add JSON schema validation before deserialization; validate tool names against registry
- **status**: UNFIXED
- **priority**: High (P1)
