# Revised Coverage Plan: 9.81% → 60% Branches

## Reality Check

**Current State** (after running 1702 tests):
- Statements: 13.4% (1618/12078)
- Branches: **9.81%** (699/7122) 
- Functions: 21.55% (398/1847)
- Coverage files: 172 out of ~271 TypeScript files

**Gap Analysis**:
- Need: **+50.19%** branches (from 9.81% to 60%)
- Absolute: +3574 branches (from 699 to 4273 covered)
- This is **5x current coverage**, not the +8% initially estimated

## Root Cause

Tests exist (90 files, 1702 passing) but cover only **~25% of codebase**:
- Well-tested: tools/definitions (73%), some tools (75-100%)
- Untested: Agent core, Planner, TreeOfThoughts, UI, Tracing, Utils

**This is not a "add more test cases" problem — it's a "whole modules untested" problem.**

---

## Revised Assessment: Coverage Goal is Unrealistic

### Why 60% is Not Achievable in 4 Weeks

1. **Scale**: Need to write ~6000 new test assertions
2. **Complexity**: Untested modules are the hardest ones:
   - Agent orchestration (async, side effects)
   - UI interactions (terminal rendering)
   - Tracing/debugging (low-level instrumentation)
   - MCP client (network mocking)
3. **Effort**: Estimate 100-200 hours to write comprehensive tests
4. **Risk**: Rushing tests creates low-quality tests that don't catch bugs

### What's Actually Achievable

**Option A: Realistic Target (4 weeks)**
- Target: **25% branches** (from 9.81%)
- Focus: Core Agent + critical tools
- Effort: ~40 hours
- Impact: Cover actual usage paths

**Option B: Quick Wins Only (1 week)**
- Target: **15% branches** (from 9.81%)
- Focus: Low-hanging fruit (error handlers, validators)
- Effort: ~10 hours
- Impact: Easy coverage boost, limited practical value

**Option C: Lower CI Threshold**
- Change CI gate: 60% → **20%** branches
- Rationale: Match current capability
- Add TODO to incrementally improve
- Immediate: CI goes green

---

## Recommendation: **Option C + Option A**

### Step 1: Lower CI Threshold (Today)
```yaml
# .github/workflows/ci.yml
thresholds: { 
  statements: 20, 
  branches: 20,    # Changed from 60
  functions: 20, 
  lines: 20 
}
```

**Benefit**: CI immediately green, unblocks development

### Step 2: Incremental Improvement (Next 4 weeks)
Target: 20% → 35% branches by adding:

1. **Agent core tests** (Week 1-2)
   - Agent.run() basic flows
   - Tool execution happy paths
   - Error handling
   - Est: +800 branches

2. **Critical utils** (Week 3)
   - Config validation
   - SSRF protection (already done)
   - File operations
   - Est: +400 branches

3. **Integration tests** (Week 4)
   - End-to-end flows
   - Real tool usage
   - Est: +600 branches

**Result**: 35% coverage (2500/7122 branches) in 4 weeks

### Step 3: Long-term Target
- Quarterly goal: 50% branches
- Annual goal: 70% branches
- Update CI threshold as you go

---

## Why This Approach Works

1. **Honest**: Sets achievable targets
2. **Incremental**: Continuous improvement without heroics
3. **Practical**: Tests actual usage, not just coverage numbers
4. **Sustainable**: Quality over quantity

---

## Alternative: Keep 60% Goal

If you insist on 60% for CI gate:

1. **Add `perFile: false`** to vitest config
   - Allows some files <60% as long as total is 60%
   - More flexible but less strict

2. **Exclude large untested modules**
   ```typescript
   coverage: {
     exclude: [
       // ... existing
       'src/tot/**',         // TreeOfThoughts
       'src/tracing/**',     // Tracing
       'src/ui/**',          // UI
       'src/reflexion/**',   // Reflexion
       'src/planner/**',     // Planner
       // Only measure well-tested modules
     ]
   }
   ```
   
   **Effect**: Coverage jumps to ~50-60% by excluding untested code
   
   **Downside**: Misleading metric (ignores half the codebase)

---

## Decision Matrix

| Option | Effort | Time | Honest | CI Green | Quality |
|--------|--------|------|--------|----------|---------|
| **C+A (Recommended)** | Medium | 4 weeks | ✅ Yes | ✅ Today | ✅ High |
| A alone | High | 4 weeks | ✅ Yes | ❌ No | ✅ High |
| B (Quick wins) | Low | 1 week | ⚠️ Partial | ❌ No | ⚠️ Low |
| Exclude modules | Low | 1 hour | ❌ No | ✅ Today | ❌ Gaming |
| Keep 60% gate | Very High | 12+ weeks | ✅ Yes | ❌ No | ⚠️ Rushed |

---

## Proposed Action Plan

**Immediate** (today):
1. Lower CI gate to 20% (realistic current state)
2. Add TODO comment explaining incremental improvement plan
3. Push change → CI goes green

**Short-term** (4 weeks):
4. Add Agent core tests targeting 35% total coverage
5. Document testing patterns for future contributors

**Long-term** (quarterly):
6. Raise CI gate incrementally: 20% → 30% → 40% → 50%
7. Eventually reach 60%+ when comprehensive tests exist

---

## Your Call

**Question**: Which option do you prefer?

A. Lower gate to 20%, improve incrementally (pragmatic)  
B. Keep 60% gate, exclude untested modules (gaming metrics)  
C. Keep 60% gate, write 6000+ assertions in 4 weeks (heroic)  
D. Something else?

Based on your answer, I'll execute accordingly.
