# Testing Best Practices

## Avoiding Test Pollution

Tests should **never** write to `~/.codeyang/` or other user directories. Use temporary directories instead.

### Use Test Helpers

```typescript
import { createTestDir, cleanupTestDir } from '../utils/testHelpers.js';
import { afterEach } from 'vitest';

describe('MyFeature', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = await createTestDir('myfeature');
    // Override environment to use test directory
    process.env.CODEYANG_HOME = testDir;
  });

  afterEach(async () => {
    await cleanupTestDir(testDir);
    delete process.env.CODEYANG_HOME;
  });

  it('should not pollute user directory', async () => {
    // Your test code here
    // All file operations will use testDir instead of ~/.codeyang/
  });
});
```

### Global Setup/Teardown

The `vitest.setup.ts` file handles global cleanup:
- **Before tests**: Cleans up any leftover test files
- **After tests**: Removes temporary test directories

### Checklist

Before committing tests, verify:
- ✅ Uses `createTestDir()` for file operations
- ✅ Has `afterEach()` cleanup
- ✅ Doesn't hardcode `~/.codeyang/` paths
- ✅ Restores environment variables after test
- ✅ Runs `npm test` without leaving files in `~/.codeyang/`

### Verifying No Pollution

```bash
# Before running tests
ls -la ~/.codeyang/

# Run tests
npm test

# After tests - should be unchanged
ls -la ~/.codeyang/
```

If you see new files in `~/.codeyang/` after testing, the test needs fixing.

## Coverage Goals

- Statements: 75%+
- Branches: 65%+
- Functions: 75%+

Run coverage report:
```bash
npm run test:coverage
```
