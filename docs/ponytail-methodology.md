# Ponytail Methodology — Lazy Senior Developer Pattern

## Overview

Ponytail is a coding methodology that embodies the "lazy senior developer" philosophy: **the best code is the code never written**. It's not about cutting corners — it's about reaching for the simplest solution that actually works.

This methodology originated from [DietrichGebert/ponytail](https://github.com/DietrichGebert/ponytail) and has been integrated into CodeYang as a reusable skill system.

## Core Philosophy

**Lazy means efficient, not careless.** A lazy senior developer has:
- Seen every over-engineered codebase
- Been paged at 3am to debug unnecessary abstractions
- Learned that deletion beats addition
- Knows that boring code is maintainable code

## The Ladder

Before writing any code, climb this ladder and stop at the first rung that holds:

1. **Does this need to exist at all?** (YAGNI)
   - Speculative features = skip it
   - Future-proofing = probably won't need it
   - "Might be useful" = definitely won't be

2. **Already in this codebase?**
   - Look for existing helpers, utils, patterns
   - Re-implementing what's a few files over is the most common slop
   - Grep before you write

3. **Stdlib does it?**
   - Python: `functools`, `itertools`, `collections`
   - JavaScript: Array methods, `Set`, `Map`, `Intl`
   - Don't reinvent `groupBy`, `debounce`, `memoize`

4. **Native platform feature covers it?**
   - `<input type="date">` over a date picker library
   - CSS over JavaScript animations
   - Database constraints over application validation

5. **Already-installed dependency solves it?**
   - Use what's in `package.json` / `requirements.txt`
   - Never add a new dependency for what 5 lines can do

6. **Can it be one line?**
   - One line of code is always better than fifty

7. **Only then: write the minimum code that works**

## Key Principles

### Bug Fixes = Root Cause, Not Symptom

A bug report names a **symptom**. Before editing:

```bash
# Find all callers
grep -rn "functionName" src/

# Fix the shared function ONCE
# Not every individual caller
```

One guard in the shared function is smaller than guards in every caller.

### No Unrequested Abstractions

❌ **Don't do this:**
```typescript
interface UserRepository {
  findById(id: string): User;
}

class DatabaseUserRepository implements UserRepository {
  findById(id: string): User { /* ... */ }
}

// Only one implementation exists
```

✅ **Do this:**
```typescript
function findUserById(id: string): User {
  return db.users.findOne({ id });
}

// Add interface when second implementation appears
```

### Mark Deliberate Shortcuts

When you cut a real corner with a known ceiling, document it:

```typescript
// ponytail: global lock, per-account locks if throughput matters
const lock = new Mutex();

async function processPayment(payment: Payment) {
  await lock.acquire();
  try {
    // ...
  } finally {
    lock.release();
  }
}
```

```python
# ponytail: O(n²) scan, index if dataset grows past 1000 items
def find_duplicates(items):
    return [x for x in items if items.count(x) > 1]
```

The format: `ponytail: <ceiling>, <upgrade trigger>`

## Three Intensity Levels

### Lite Mode
Build what's asked, but name the lazier alternative:

```
User: "Add a cache for API responses"
You: "Done, cache added. FYI: functools.lru_cache covers this 
     in one line if you'd rather not own a cache class."
```

### Full Mode (Default)
Enforce the ladder. Stdlib and native first. Shortest diff:

```
User: "Add a cache for API responses"
You: "@lru_cache(maxsize=1000) on the fetch function. 
     Skipped custom cache class, add when lru_cache falls short."
```

### Ultra Mode
YAGNI extremist. Challenge the requirement:

```
User: "Add a cache for API responses"
You: "No cache until a profiler says so. When it does: @lru_cache. 
     A hand-rolled TTL cache class is a bug farm with a hit rate."
```

## Output Format

Code first, then at most **three short lines**:

```python
@lru_cache(maxsize=1000)
def fetch_user(user_id: str) -> User:
    return db.query("SELECT * FROM users WHERE id = ?", user_id)

# Skipped: custom cache class with TTL
# Add when: lru_cache measurably falls short
```

**No essays**. If the explanation is longer than the code, delete the explanation.

## When NOT to Be Lazy

Never simplify away:
- Input validation at trust boundaries
- Error handling that prevents data loss
- Security measures
- Accessibility basics
- Anything explicitly requested

Never lazy about **understanding the problem**:
- Read the code fully first
- Trace the real flow end-to-end
- Then apply the ladder
- Laziness that skips comprehension is just shipping bugs

## Testing Philosophy

**Lazy code without its check is unfinished.**

Non-trivial logic (branches, loops, parsers, money/security paths) needs **ONE** runnable check:

```python
def parse_amount(s: str) -> float:
    """Parse currency string like '$1,234.56' to float."""
    return float(s.replace('$', '').replace(',', ''))

if __name__ == '__main__':
    assert parse_amount('$1,234.56') == 1234.56
    assert parse_amount('$0.01') == 0.01
    print('✓ parse_amount')
```

No frameworks, no fixtures, no per-function test suites unless asked. Trivial one-liners need no test.

## Related Skills

CodeYang provides three ponytail skills:

### `/ponytail [lite|full|ultra]`
Main skill. Activates lazy mode for all coding tasks.

### `/ponytail-debt`
Scans codebase for `ponytail:` comments and generates a debt ledger:

```bash
grep -rnE '(#|//|<!--) ?ponytail:' . --exclude-dir=node_modules
```

Output:
```
src/cache.ts:42, global lock. ceiling: single-threaded. 
  upgrade: per-account locks if throughput matters.

src/parser.ts:88, O(n²) scan. ceiling: <1000 items. 
  upgrade: index if dataset grows. ⚠ no-trigger

2 markers, 1 with no trigger.
```

### `/ponytail-review`
Code review focused on over-engineering. One-line findings:

```
L12-38: stdlib: 27-line validator. use email.includes('@'), 1 line.
L4: native: moment.js for one format call. use Intl.DateTimeFormat.
L88: yagni: AbstractRepository with one impl. inline until second exists.
L52-71: delete: retry wrapper on idempotent local call.

net: -82 lines possible.
```

## Examples

### Example 1: Date Formatting

❌ **Over-engineered:**
```typescript
import moment from 'moment';

function formatDate(date: Date): string {
  return moment(date).format('YYYY-MM-DD');
}
```

✅ **Ponytail:**
```typescript
function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}
```

### Example 2: Array Deduplication

❌ **Over-engineered:**
```typescript
function deduplicate<T>(items: T[]): T[] {
  const seen = new Map<string, T>();
  for (const item of items) {
    const key = JSON.stringify(item);
    if (!seen.has(key)) {
      seen.set(key, item);
    }
  }
  return Array.from(seen.values());
}
```

✅ **Ponytail:**
```typescript
const unique = [...new Set(items)];
```

### Example 3: Retry Logic

❌ **Over-engineered:**
```typescript
class RetryStrategy {
  constructor(
    private maxAttempts: number,
    private backoffMs: number,
    private maxBackoffMs: number
  ) {}

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    let lastError: Error;
    for (let i = 0; i < this.maxAttempts; i++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error as Error;
        const delay = Math.min(
          this.backoffMs * Math.pow(2, i),
          this.maxBackoffMs
        );
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    throw lastError!;
  }
}
```

✅ **Ponytail (if retries are actually needed):**
```typescript
// ponytail: fixed 3 retries with 1s delay, add backoff if needed
async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  for (let i = 0; i < 3; i++) {
    try { return await fn(); }
    catch (e) { if (i === 2) throw e; await sleep(1000); }
  }
}
```

✅ **Ponytail ultra (question if retries needed):**
```typescript
// Most APIs are idempotent. Add retry when logs show transient failures.
await fetch('/api/data');
```

## Integration with CodeYang

Ponytail skills are located in:
```
.agents/skills/ponytail/
.agents/skills/ponytail-debt/
.agents/skills/ponytail-review/
```

Invoke them with:
```
/ponytail           # Activate full mode
/ponytail lite      # Activate lite mode
/ponytail ultra     # Activate ultra mode
/ponytail-debt      # Generate debt ledger
/ponytail-review    # Review for over-engineering
```

## Credits

Original methodology by [@DietrichGebert](https://github.com/DietrichGebert/ponytail).  
Adapted for CodeYang by the community.  
License: MIT

## Further Reading

- [YAGNI Principle](https://martinfowler.com/bliki/Yagni.html) — Martin Fowler
- [Worse is Better](https://dreamsongs.com/RiseOfWorseIsBetter.html) — Richard Gabriel
- [The Art of Unix Programming](http://www.catb.org/~esr/writings/taoup/) — Eric Raymond
