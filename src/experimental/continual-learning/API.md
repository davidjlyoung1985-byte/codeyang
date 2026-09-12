# Continual Learning Module API Documentation

**Version**: 1.0.0-beta  
**Stability**: 2 (Unstable - API may change in minor versions)  
**Status**: Fully integrated, runs automatically every 10 iterations

---

## Overview

The Continual Learning module provides automatic memory management and optimization. It runs every 10 agent iterations to classify, compress, and consolidate memories for optimal performance.

### Key Features

- 🏷️ **Auto-classification** - Automatically categorize memories
- 🗜️ **Compression** - Compress old, infrequently accessed memories
- 🧹 **Garbage collection** - Remove stale, unused memories
- 📊 **Health monitoring** - Track memory system health
- 🔄 **Consolidation** - Periodic memory optimization

---

## Installation

```typescript
import {
  autoClassify,
  trackAccess,
  findCompressibleMemories,
  compressMemories,
  findStaleMemories,
  forgetStaleMemories,
  runConsolidation,
  getMemoryHealth,
  CONTINUAL_LEARNING_API_VERSION,
} from './experimental/continual-learning/index.js';
```

---

## Core API

### autoClassify(memoryPath)

Automatically classify a memory based on its content.

```typescript
const category = await autoClassify('/path/to/memory.md');
console.log('Category:', category); // 'user' | 'feedback' | 'project' | 'reference'
```

**Parameters**:
- `memoryPath: string` - Path to memory file

**Returns**: `Promise<MemoryCategory>`

```typescript
type MemoryCategory = 'user' | 'feedback' | 'project' | 'reference';
```

**Classification Logic**:
- `user` - User preferences, role, expertise
- `feedback` - Guidance from user, corrections
- `project` - Ongoing work, goals, constraints
- `reference` - External resources, URLs, tickets

**Example**:
```typescript
// Classify all memories
const memories = await glob('memory/*.md');
for (const memory of memories) {
  const category = await autoClassify(memory);
  console.log(`${memory}: ${category}`);
}
```

---

### trackAccess(memoryPath)

Track when a memory was last accessed.

```typescript
await trackAccess('/path/to/memory.md');
```

**Parameters**:
- `memoryPath: string` - Path to memory file

**Returns**: `Promise<void>`

**Behavior**:
- Updates metadata with current timestamp
- Creates access tracking file if needed
- Used to identify unused memories

**Example**:
```typescript
// Track access when memory is loaded
const memory = await loadMemory('important-fact.md');
await trackAccess('memory/important-fact.md');
```

---

### findCompressibleMemories(memoryDir, options)

Find memories eligible for compression.

```typescript
const compressible = await findCompressibleMemories('memory/', {
  minAge: 30,          // Days old
  maxAccessAge: 7,     // Not accessed in 7 days
  minSize: 1024,       // Minimum 1KB
});

console.log(`Found ${compressible.length} compressible memories`);
```

**Parameters**:
- `memoryDir: string` - Memory directory path
- `options`: 
  - `minAge?: number` - Minimum age in days (default: 30)
  - `maxAccessAge?: number` - Max days since last access (default: 7)
  - `minSize?: number` - Minimum size in bytes (default: 1024)

**Returns**: `Promise<string[]>` - Paths to compressible memories

---

### compressMemories(memoryPaths)

Compress selected memories.

```typescript
const compressed = await compressMemories(memoryPaths);
console.log(`Compressed ${compressed.length} memories`);
```

**Parameters**:
- `memoryPaths: string[]` - Paths to memories to compress

**Returns**: `Promise<string[]>` - Paths to successfully compressed memories

**Compression Strategy**:
- Remove verbose explanations
- Keep core facts
- Add "[compressed]" marker
- Reduce file size by ~60-80%

**Example Before**:
```markdown
---
name: authentication-approach
type: feedback
---

The user prefers JWT tokens for authentication because they are stateless 
and work well with microservices. They mentioned this multiple times and 
want to avoid session-based auth due to scaling concerns.

**Why**: Stateless auth scales better
**How to apply**: Use JWT for all new API endpoints
```

**Example After**:
```markdown
---
name: authentication-approach
type: feedback
---

[compressed] User prefers JWT auth (stateless, scalable). Use JWT for APIs.
```

---

### findStaleMemories(memoryDir, options)

Find stale memories that can be removed.

```typescript
const stale = await findStaleMemories('memory/', {
  maxAge: 90,          // Older than 90 days
  notAccessedFor: 60,  // Not accessed in 60 days
});

console.log(`Found ${stale.length} stale memories`);
```

**Parameters**:
- `memoryDir: string` - Memory directory path
- `options`:
  - `maxAge?: number` - Max age in days (default: 90)
  - `notAccessedFor?: number` - Days without access (default: 60)

**Returns**: `Promise<string[]>` - Paths to stale memories

---

### forgetStaleMemories(memoryPaths)

Remove stale memories permanently.

```typescript
const forgotten = await forgetStaleMemories(staleMemories);
console.log(`Removed ${forgotten.length} stale memories`);
```

**Parameters**:
- `memoryPaths: string[]` - Paths to memories to remove

**Returns**: `Promise<string[]>` - Paths to successfully removed memories

**Safety**:
- Creates backup before deletion
- Skips memories modified in last 7 days
- Logs all deletions

---

### runConsolidation(memoryDir, options)

Run full consolidation cycle (classify, compress, forget).

```typescript
const report = await runConsolidation('memory/', {
  compress: true,
  forget: true,
  minAge: 30,
  verbose: true,
});

console.log('Consolidation Report:', report);
```

**Parameters**:
- `memoryDir: string` - Memory directory path
- `options`:
  - `compress?: boolean` - Enable compression (default: true)
  - `forget?: boolean` - Enable forgetting (default: true)
  - `minAge?: number` - Minimum age for compression (default: 30)
  - `maxAge?: number` - Maximum age for forgetting (default: 90)
  - `verbose?: boolean` - Verbose logging (default: false)

**Returns**: `Promise<ConsolidationReport>`

```typescript
interface ConsolidationReport {
  timestamp: number;
  totalMemories: number;
  classified: number;
  compressed: number;
  forgotten: number;
  spaceSaved: number;     // Bytes
  duration: number;       // Milliseconds
  errors: string[];
}
```

**Example Report**:
```json
{
  "timestamp": 1694520000000,
  "totalMemories": 150,
  "classified": 150,
  "compressed": 45,
  "forgotten": 12,
  "spaceSaved": 245760,
  "duration": 1250,
  "errors": []
}
```

---

### getMemoryHealth(memoryDir)

Get memory system health metrics.

```typescript
const health = await getMemoryHealth('memory/');

console.log('Health Score:', health.score);
console.log('Total Memories:', health.total);
console.log('Needs Attention:', health.needsAttention);
```

**Returns**: `Promise<MemoryHealth>`

```typescript
interface MemoryHealth {
  score: number;              // 0-100 health score
  total: number;              // Total memories
  byCategory: {
    user: number;
    feedback: number;
    project: number;
    reference: number;
  };
  compressed: number;
  stale: number;
  totalSize: number;          // Bytes
  averageAge: number;         // Days
  needsAttention: boolean;    // Needs consolidation?
  recommendations: string[];
}
```

**Health Score Calculation**:
- 100 = Perfect (all classified, no stale, optimal size)
- 80-99 = Good (minor issues)
- 60-79 = Fair (needs consolidation soon)
- <60 = Poor (needs immediate consolidation)

**Example**:
```typescript
const health = await getMemoryHealth('memory/');

if (health.needsAttention) {
  console.log('Recommendations:');
  health.recommendations.forEach(r => console.log(`- ${r}`));
  
  // Run consolidation
  await runConsolidation('memory/');
}
```

---

## Integration with Agent

The module runs automatically every 10 iterations:

```typescript
// In Agent.ts
import { runConsolidation } from './experimental/continual-learning/MemoryManager.js';

class Agent {
  private iterationCount = 0;

  async run(userMessage: string) {
    this.iterationCount++;

    // Run consolidation every 10 iterations
    if (this.iterationCount % 10 === 0) {
      await this.runMemoryConsolidation();
    }

    // ... rest of agent logic
  }

  private async runMemoryConsolidation() {
    try {
      const report = await runConsolidation(this.memoryDir, {
        compress: true,
        forget: true,
        verbose: false,
      });

      if (report.compressed > 0 || report.forgotten > 0) {
        console.log(`Memory consolidation: compressed ${report.compressed}, ` +
                    `forgot ${report.forgotten}, saved ${report.spaceSaved} bytes`);
      }
    } catch (err) {
      console.error('Memory consolidation failed:', err);
    }
  }
}
```

---

## Usage Examples

### Example 1: Manual Consolidation

```typescript
import { runConsolidation, getMemoryHealth } from './experimental/continual-learning/index.js';

async function manualConsolidation() {
  // Check health first
  const health = await getMemoryHealth('memory/');
  console.log('Memory health:', health.score);

  if (health.needsAttention) {
    // Run consolidation
    const report = await runConsolidation('memory/', {
      compress: true,
      forget: true,
      verbose: true,
    });

    console.log('Consolidation complete:');
    console.log(`- Compressed: ${report.compressed}`);
    console.log(`- Forgotten: ${report.forgotten}`);
    console.log(`- Space saved: ${(report.spaceSaved / 1024).toFixed(2)} KB`);
  }
}
```

### Example 2: Selective Compression

```typescript
import { findCompressibleMemories, compressMemories } from './experimental/continual-learning/index.js';

async function compressOldMemories() {
  // Find compressible memories (older than 60 days, not accessed in 30 days)
  const compressible = await findCompressibleMemories('memory/', {
    minAge: 60,
    maxAccessAge: 30,
    minSize: 2048, // Only compress files > 2KB
  });

  console.log(`Found ${compressible.length} compressible memories`);

  if (compressible.length > 0) {
    // Compress them
    const compressed = await compressMemories(compressible);
    console.log(`Compressed ${compressed.length} memories`);
  }
}
```

### Example 3: Health Monitoring

```typescript
import { getMemoryHealth } from './experimental/continual-learning/index.js';

async function monitorMemoryHealth() {
  const health = await getMemoryHealth('memory/');

  console.log(`Memory Health Score: ${health.score}/100`);
  console.log(`Total Memories: ${health.total}`);
  console.log(`Size: ${(health.totalSize / 1024).toFixed(2)} KB`);
  console.log(`Average Age: ${health.averageAge.toFixed(1)} days`);

  console.log('\nBy Category:');
  console.log(`- User: ${health.byCategory.user}`);
  console.log(`- Feedback: ${health.byCategory.feedback}`);
  console.log(`- Project: ${health.byCategory.project}`);
  console.log(`- Reference: ${health.byCategory.reference}`);

  if (health.needsAttention) {
    console.log('\nRecommendations:');
    health.recommendations.forEach(r => console.log(`⚠️  ${r}`));
  }
}
```

### Example 4: Scheduled Consolidation

```typescript
import { runConsolidation } from './experimental/continual-learning/index.js';

// Run consolidation every hour
setInterval(async () => {
  try {
    const report = await runConsolidation('memory/', {
      compress: true,
      forget: false, // Don't auto-delete, be cautious
      minAge: 30,
    });

    if (report.compressed > 0) {
      console.log(`[${new Date().toISOString()}] Compressed ${report.compressed} memories`);
    }
  } catch (err) {
    console.error('Consolidation error:', err);
  }
}, 3600000); // 1 hour
```

---

## Best Practices

### 1. Run Consolidation Regularly

```typescript
// Every 10 iterations (automatic)
// OR manually after major operations
if (majorOperationCompleted) {
  await runConsolidation(memoryDir);
}
```

### 2. Monitor Health

```typescript
// Check health before heavy operations
const health = await getMemoryHealth(memoryDir);
if (health.score < 60) {
  await runConsolidation(memoryDir);
}
```

### 3. Be Conservative with Forgetting

```typescript
// Start with high thresholds
await runConsolidation(memoryDir, {
  compress: true,
  forget: true,
  minAge: 30,
  maxAge: 180, // 6 months
});
```

### 4. Track Important Memories

```typescript
// Mark important memories as recently accessed
await trackAccess('memory/critical-info.md');
```

### 5. Review Before Bulk Operations

```typescript
// Preview what will be forgotten
const stale = await findStaleMemories(memoryDir);
console.log('Will forget:', stale);
// Review, then:
await forgetStaleMemories(stale);
```

---

## Configuration

### Consolidation Options

```typescript
const options = {
  // Compression settings
  compress: true,
  minAge: 30,           // Compress memories older than 30 days
  maxAccessAge: 7,      // Not accessed in 7 days
  minSize: 1024,        // Minimum 1KB

  // Forgetting settings
  forget: true,
  maxAge: 90,           // Forget memories older than 90 days
  notAccessedFor: 60,   // Not accessed in 60 days

  // Logging
  verbose: false,
};
```

### Recommended Thresholds

| Environment | minAge | maxAge | maxAccessAge | notAccessedFor |
|-------------|--------|--------|--------------|----------------|
| Development | 14     | 60     | 3            | 14             |
| Production  | 30     | 90     | 7            | 60             |
| Long-term   | 60     | 180    | 14           | 90             |

---

## API Stability Roadmap

### Current (v1.0.0-beta)
- Stability Level: 2 (Unstable)
- All APIs functional, may change

### v1.0.0 (Target)
- Core APIs become stable
- Classification algorithm finalized
- Stability Level: 3 (Stable)

### v1.1.0+
- ML-based classification
- Smart compression strategies
- Memory deduplication

---

## Troubleshooting

### Consolidation takes too long
- Reduce `minAge` threshold
- Process fewer memories at once
- Check disk I/O performance

### Too many memories compressed
- Increase `minAge`
- Increase `maxAccessAge`
- Track access more frequently

### Memories wrongly classified
- Review classification logic
- Provide explicit category in frontmatter
- File issue for improvement

### Important memories forgotten
- Lower `maxAge` threshold
- Track access regularly
- Mark as `type: user` (never auto-deleted)

---

## Safety Features

1. **Backup before deletion** - Stale memories backed up before removal
2. **Recent modification protection** - Won't delete recently modified files
3. **Dry-run mode** - Preview operations before execution
4. **Error recovery** - Partial failures don't corrupt memory system
5. **Logging** - All operations logged for audit

---

## Support

- **Issues**: https://github.com/davidjlyoung1985-byte/codeyang/issues
- **Docs**: See `src/experimental/README.md`

---

**Last Updated**: 2026-09-12  
**Next Review**: v1.0.0 release
