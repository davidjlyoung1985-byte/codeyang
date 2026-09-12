# Reflexion Module API Documentation

**Version**: 1.0.0-beta  
**Stability**: 2 (Unstable - API may change in minor versions)  
**Status**: Fully integrated and tested

---

## Overview

The Reflexion module provides reflection, self-critique, and error handling capabilities for AI agents. It implements the Reflexion pattern: learning from execution failures and improving over time.

### Key Features

- 🔄 **Reflexion Engine** - Learn from execution failures
- 🔍 **Critique Engine** - Self-evaluate output quality
- ⚡ **Error Handling** - Circuit breaker and retry mechanisms
- 📊 **Performance Optimization** - Caching and batch processing
- 📚 **Learning Store** - Persistent learning from mistakes

---

## Installation

```typescript
import {
  ReflexionEngine,
  CritiqueEngine,
  CircuitBreaker,
  RetryHandler,
} from './experimental/reflexion/index.js';
```

---

## Core APIs (Stable)

These APIs are likely to graduate to stable in v1.0+.

### ReflexionEngine

**Purpose**: Track execution failures and learn from mistakes.

#### Configuration

```typescript
interface ReflexionConfig {
  enabled: boolean;           // Enable/disable reflexion
  failureThreshold: number;   // Consecutive failures before reflection
  maxReflections: number;     // Max stored reflections
  autoInject: boolean;        // Auto-inject learned patterns
}
```

**Defaults**:
```typescript
{
  enabled: true,
  failureThreshold: 2,
  maxReflections: 10,
  autoInject: true
}
```

#### Methods

##### `recordExecution(record)`

Record an execution outcome (success or failure).

```typescript
const recordId = engine.recordExecution({
  timestamp: Date.now(),
  action: 'git_commit',
  input: { message: 'feat: add feature' },
  output: 'Committed successfully',
  success: true,
  duration: 150,
});
```

**Parameters**:
- `record.timestamp`: Execution time
- `record.action`: Action name
- `record.input`: Input data
- `record.output`: Output or error message
- `record.success`: Success/failure status
- `record.duration`: Execution time in ms

**Returns**: `string` - Record ID

##### `shouldReflect()`

Check if reflection should be triggered based on failure threshold.

```typescript
if (engine.shouldReflect()) {
  const reflection = await engine.reflect(client, model, maxTokens);
}
```

**Returns**: `boolean`

##### `reflect(client, model, maxTokens)`

Perform reflection using LLM to analyze failures.

```typescript
const reflection = await engine.reflect(
  llmClient,
  'claude-opus-5',
  1000
);

if (reflection) {
  console.log('Analysis:', reflection.analysis);
  console.log('Strategy:', reflection.strategy);
}
```

**Returns**: `Promise<Reflection | null>`

```typescript
interface Reflection {
  trigger: string;           // What triggered reflection
  failurePatterns: string[]; // Identified patterns
  analysis: string;          // LLM analysis
  strategy: string;          // Suggested strategy
  timestamp: number;
}
```

##### `getRelevantLearnings(context)`

Get applicable learnings for current context.

```typescript
const learnings = engine.getRelevantLearnings('git operations');
// Inject into agent context
```

**Returns**: `Reflection[]`

---

### CritiqueEngine

**Purpose**: Self-evaluate output quality (code review).

#### Configuration

```typescript
interface CritiqueConfig {
  enabled: boolean;
  qualityThreshold: number;  // 0-100 score threshold
  maxIterations: number;     // Max critique-fix iterations
  categories: CritiqueCategory[];
  critiqueCodeOnly: boolean;
}

type CritiqueCategory = 
  | 'bug' 
  | 'style' 
  | 'completeness' 
  | 'performance' 
  | 'security' 
  | 'maintainability' 
  | 'correctness';
```

**Defaults**:
```typescript
{
  enabled: true,
  qualityThreshold: 80,
  maxIterations: 2,
  categories: ['bug', 'correctness', 'completeness', 'performance', 'security'],
  critiqueCodeOnly: true
}
```

#### Methods

##### `critique(output, context, client, model, maxTokens)`

Evaluate output quality.

```typescript
const result = await engine.critique(
  generatedCode,
  'Implement user authentication',
  llmClient,
  'claude-opus-5',
  1000
);

console.log('Score:', result.score);
console.log('Passed:', result.passed);
console.log('Issues:', result.issues);
```

**Returns**: `Promise<CritiqueResult>`

```typescript
interface CritiqueResult {
  score: number;              // 0-100 quality score
  issues: CritiqueIssue[];    // Found issues
  passed: boolean;            // Passed threshold?
  summary: string;            // Summary
  raw: string;                // Raw LLM response
}

interface CritiqueIssue {
  category: CritiqueCategory;
  severity: 'critical' | 'major' | 'minor' | 'suggestion';
  description: string;
  lineRef?: string;           // Line reference
  suggestion?: string;        // Fix suggestion
}
```

**Example Usage**:

```typescript
const engine = new CritiqueEngine({
  enabled: true,
  qualityThreshold: 80,
  maxIterations: 2,
});

// Critique generated code
const result = await engine.critique(
  code,
  'Implement API endpoint',
  llmClient,
  model,
  maxTokens
);

if (!result.passed) {
  // Fix issues
  for (const issue of result.issues) {
    if (issue.severity === 'critical') {
      console.error('Critical:', issue.description);
    }
  }
}
```

---

### ExecutionTracker

**Purpose**: Track execution history for pattern detection.

#### Methods

```typescript
const tracker = new ExecutionTracker(maxSize = 100);

// Record execution
const id = tracker.record({
  timestamp: Date.now(),
  action: 'file_write',
  input: { path: 'test.ts' },
  output: 'Written successfully',
  success: true,
  duration: 50,
});

// Check failure patterns
const hasFailures = tracker.hasConsecutiveFailures(2);

// Get recent failures
const failures = tracker.getRecentFailures(5);

// Get success rate
const stats = tracker.getStats();
// { total: 100, successes: 95, failures: 5, successRate: 0.95 }
```

---

### LearningStore

**Purpose**: Store and retrieve learned reflections.

#### Methods

```typescript
const store = new LearningStore(maxReflections = 10);

// Store reflection
store.store(reflection);

// Get all reflections
const all = store.getAll();

// Find relevant reflections
const relevant = store.findRelevant('git', 5);

// Clear old reflections
store.clear();
```

---

## Enhanced Features (API May Change)

These features are fully functional but their APIs may evolve.

### CircuitBreaker

**Purpose**: Prevent cascading failures by opening circuit after threshold.

```typescript
const breaker = new CircuitBreaker({
  failureThreshold: 3,      // Open after 3 failures
  resetTimeout: 60000,      // Reset after 1 minute
  halfOpenRequests: 1,      // Test with 1 request
});

// Execute with circuit breaker protection
try {
  const result = await breaker.execute(async () => {
    return await riskyOperation();
  });
} catch (err) {
  if (breaker.isOpen()) {
    console.log('Circuit is open, service unavailable');
  }
}

// Check state
console.log('State:', breaker.getState()); // 'closed' | 'open' | 'half-open'

// Reset manually
breaker.reset();
```

**Configuration**:
```typescript
interface CircuitBreakerConfig {
  failureThreshold: number;  // Failures before opening
  resetTimeout: number;      // Time before half-open (ms)
  halfOpenRequests: number;  // Requests to test in half-open
}
```

---

### RetryHandler

**Purpose**: Retry failed operations with exponential backoff.

```typescript
const retryHandler = new RetryHandler({
  maxRetries: 3,
  initialDelay: 1000,        // 1 second
  maxDelay: 30000,           // 30 seconds
  backoffMultiplier: 2,
  retryableErrors: ['ETIMEDOUT', 'ECONNRESET'],
});

// Execute with retry
const result = await retryHandler.execute(async () => {
  return await unreliableOperation();
});
```

**Configuration**:
```typescript
interface RetryConfig {
  maxRetries: number;
  initialDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
  retryableErrors?: string[];
}
```

---

### ErrorClassifier

**Purpose**: Classify errors for intelligent handling.

```typescript
const classifier = new ErrorClassifier();

const classification = classifier.classify(error);
console.log(classification);
// {
//   category: 'transient' | 'client' | 'server' | 'unknown',
//   severity: 'low' | 'medium' | 'high' | 'critical',
//   retryable: boolean,
//   message: string
// }
```

---

### EnhancedErrorHandler

**Purpose**: Combines circuit breaker, retry, and error classification.

```typescript
const handler = new EnhancedErrorHandler({
  circuitBreaker: {
    failureThreshold: 3,
    resetTimeout: 60000,
  },
  retry: {
    maxRetries: 3,
    initialDelay: 1000,
  },
});

// Execute with full error handling
try {
  const result = await handler.execute(async () => {
    return await complexOperation();
  });
} catch (err) {
  // Already retried and circuit breaker applied
  console.error('Operation failed after all retries');
}
```

---

## Performance Optimizations (API May Change)

### ReflectionCache

**Purpose**: Cache reflection results to avoid redundant LLM calls.

```typescript
const cache = new ReflectionCache({
  maxSize: 100,
  ttl: 3600000, // 1 hour
});

// Get or compute reflection
const reflection = await cache.getOrCompute(
  'git_commit_failure',
  async () => {
    return await engine.reflect(client, model, maxTokens);
  }
);
```

---

### BatchProcessor

**Purpose**: Process items in batches for efficiency.

```typescript
const processor = new BatchProcessor({
  batchSize: 10,
  flushInterval: 1000,
  concurrency: 3,
});

// Add items
processor.add(item1);
processor.add(item2);

// Process batch
await processor.flush();
```

---

### PerformanceMonitor

**Purpose**: Track performance metrics.

```typescript
const monitor = new PerformanceMonitor();

// Track operation
const startId = monitor.start('reflection');
// ... do work ...
monitor.end(startId);

// Get metrics
const metrics = monitor.getMetrics('reflection');
// { count, avg, min, max, p50, p95, p99 }
```

---

## Integration Example

```typescript
import {
  ReflexionEngine,
  CritiqueEngine,
  EnhancedErrorHandler,
  REFLEXION_API_VERSION,
} from './experimental/reflexion/index.js';

// Check API version
console.log('Reflexion API:', REFLEXION_API_VERSION);

// Setup reflexion
const reflexion = new ReflexionEngine({
  enabled: true,
  failureThreshold: 2,
  maxReflections: 10,
  autoInject: true,
});

// Setup critique
const critique = new CritiqueEngine({
  enabled: true,
  qualityThreshold: 80,
  maxIterations: 2,
});

// Setup error handling
const errorHandler = new EnhancedErrorHandler({
  circuitBreaker: {
    failureThreshold: 3,
    resetTimeout: 60000,
  },
  retry: {
    maxRetries: 3,
    initialDelay: 1000,
  },
});

// Use in agent loop
async function agentStep() {
  try {
    // Execute with error handling
    const result = await errorHandler.execute(async () => {
      return await toolExecution();
    });

    // Record success
    reflexion.recordExecution({
      timestamp: Date.now(),
      action: 'tool_call',
      input: toolInput,
      output: result,
      success: true,
      duration: 100,
    });

    // Critique output
    if (result.includes('```')) {
      const critiqueResult = await critique.critique(
        result,
        context,
        llmClient,
        model,
        maxTokens
      );

      if (!critiqueResult.passed) {
        console.log('Quality issues found:', critiqueResult.issues);
      }
    }

  } catch (error) {
    // Record failure
    reflexion.recordExecution({
      timestamp: Date.now(),
      action: 'tool_call',
      input: toolInput,
      output: error.message,
      success: false,
      duration: 50,
    });

    // Check if reflection needed
    if (reflexion.shouldReflect()) {
      const reflection = await reflexion.reflect(
        llmClient,
        model,
        maxTokens
      );
      console.log('Reflection:', reflection);
    }
  }
}
```

---

## API Stability Roadmap

### Current (v1.0.0-beta)
- Stability Level: 2 (Unstable)
- All APIs are functional but may change

### v1.0.0 (Target)
- Core APIs become stable:
  - `ReflexionEngine`
  - `CritiqueEngine`
  - `ExecutionTracker`
  - `LearningStore`
- Stability Level: 3 (Stable)

### v1.1.0+
- Enhanced features stabilize
- Performance APIs finalize

---

## Migration Guide

When APIs change, we will provide:
1. Deprecation warnings (one version before removal)
2. Migration examples
3. Backward compatibility helpers

Example deprecation:
```typescript
/**
 * @deprecated Use newMethod() instead. Will be removed in v1.1.0
 */
oldMethod() {
  console.warn('oldMethod is deprecated, use newMethod');
  return this.newMethod();
}
```

---

## Best Practices

1. **Check API version before using**:
   ```typescript
   import { REFLEXION_API_VERSION } from './experimental/reflexion/index.js';
   if (REFLEXION_API_VERSION !== '1.0.0-beta') {
     console.warn('API version mismatch');
   }
   ```

2. **Handle reflection asynchronously**:
   ```typescript
   // Don't block on reflection
   if (reflexion.shouldReflect()) {
     reflexion.reflect(client, model, maxTokens).then(r => {
       if (r) console.log('Learned:', r.strategy);
     });
   }
   ```

3. **Use critique selectively**:
   ```typescript
   // Only critique code outputs
   if (config.critiqueCodeOnly && !output.includes('```')) {
     return; // Skip critique for non-code
   }
   ```

4. **Configure thresholds appropriately**:
   ```typescript
   // Lower threshold for experimental features
   failureThreshold: 1, // Reflect quickly
   qualityThreshold: 70, // Less strict
   ```

---

## Troubleshooting

### Reflection not triggering
- Check `enabled: true` in config
- Verify `failureThreshold` is reached
- Ensure `shouldReflect()` returns true

### Critique returning low scores
- Check if output contains code
- Verify `critiqueCodeOnly` setting
- Review `categories` configuration

### Circuit breaker always open
- Increase `failureThreshold`
- Reduce `resetTimeout`
- Check underlying service health

---

## Support

- **Issues**: https://github.com/davidjlyoung1985-byte/codeyang/issues
- **Discussions**: https://github.com/davidjlyoung1985-byte/codeyang/discussions
- **Docs**: See `src/experimental/README.md`

---

**Last Updated**: 2026-09-12  
**Next Review**: v1.0.0 release
