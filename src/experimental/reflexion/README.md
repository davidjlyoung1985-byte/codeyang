# Reflexion Module - Complete Documentation

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Installation & Setup](#installation--setup)
4. [Quick Start](#quick-start)
5. [Core Components](#core-components)
6. [Advanced Usage](#advanced-usage)
7. [CLI Commands](#cli-commands)
8. [Best Practices](#best-practices)
9. [Performance Tuning](#performance-tuning)
10. [Troubleshooting](#troubleshooting)
11. [API Reference](#api-reference)

## Overview

The Reflexion module implements a self-reflection system that learns from execution failures and improves over time. It automatically detects patterns in failures, generates insights using LLM analysis, and injects learned knowledge back into the system to prevent repeated mistakes.

### Key Features

- **Automatic Failure Detection**: Tracks execution outcomes and detects failure patterns
- **LLM-Powered Reflection**: Uses AI to analyze failures and extract insights
- **Smart Triggering**: Context-aware reflection triggering based on failure diversity
- **Persistent Learning**: Stores learned patterns and recommendations
- **Error Resilience**: Circuit breaker and retry mechanisms for robust operation
- **Performance Optimization**: Caching, batching, and query optimization
- **Rich CLI**: 7 commands for inspecting and managing reflections

### Status

**Production Ready** - 106 tests, 100% pass rate

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    User / Agent                          │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│              ReflexionIntegration                        │
│  • Task context tracking                                 │
│  • Smart triggering                                      │
│  • Failure classification                                │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│               ReflexionEngine (Core)                     │
│  • Failure threshold detection                           │
│  • LLM reflection coordination                           │
│  • Pattern injection                                     │
└─────┬───────────────┬─────────────────┬─────────────────┘
      │               │                 │
      ▼               ▼                 ▼
┌──────────┐  ┌──────────────┐  ┌─────────────┐
│Execution │  │ Learning     │  │ Reflection  │
│Tracker   │  │ Store        │  │ Prompt      │
└──────────┘  └──────────────┘  └─────────────┘
      │               │                 │
      ▼               ▼                 ▼
┌─────────────────────────────────────────────────────────┐
│               Support Modules                            │
│  • ErrorHandler (Circuit Breaker, Retry)                │
│  • PerformanceOptimizer (Cache, Batch, Query)           │
└─────────────────────────────────────────────────────────┘
```

## Installation & Setup

### Basic Setup

```typescript
import { ReflexionEngine } from './experimental/reflexion';

const engine = new ReflexionEngine({
  enabled: true,
  failureThreshold: 2,      // Trigger after 2 consecutive failures
  maxReflections: 50,        // Keep max 50 reflections
  autoInject: true,          // Auto-inject patterns into prompts
});
```

### Advanced Setup with Integration

```typescript
import { ReflexionIntegration, ReflexionEngine } from './experimental/reflexion';

const engine = new ReflexionEngine({
  enabled: true,
  failureThreshold: 2,
  maxReflections: 50,
  autoInject: true,
});

const integration = new ReflexionIntegration(engine, {
  enabled: true,
  failureThreshold: 2,
  maxReflections: 50,
  autoInject: true,
  smartTrigger: true,        // Enable context-aware triggering
  batchRecording: true,      // Enable batch processing
});
```

## Quick Start

### 1. Record Executions

```typescript
// Basic recording
engine.recordExecution({
  task: 'Deploy application',
  toolCalls: [
    { name: 'Bash', args: { command: 'npm build' } }
  ],
  results: [
    { tool: 'Bash', output: 'Error: Module not found', isError: true }
  ],
  success: false,
  errorMessage: 'Build failed',
  durationMs: 1500,
  timestamp: Date.now(),
});
```

### 2. Check if Reflection is Needed

```typescript
if (engine.shouldReflect()) {
  console.log('Consecutive failures detected - reflection recommended');
}
```

### 3. Perform Reflection

```typescript
const reflection = await engine.reflect(llmClient, model, maxTokens);

if (reflection) {
  console.log('Analysis:', reflection.analysis);
  console.log('Patterns:', reflection.patterns);
  console.log('Recommendations:', reflection.recommendations);
}
```

### 4. Get Learned Patterns

```typescript
const patterns = await engine.getLearnedPatterns(5);
// Inject into system prompt or display to user
```

## Core Components

### 1. ReflexionEngine

The main engine that coordinates reflection.

**Key Methods:**
- `recordExecution(record)` - Record an execution outcome
- `shouldReflect()` - Check if reflection should be triggered
- `reflect(client, model, maxTokens)` - Perform LLM reflection
- `getLearnedPatterns(limit)` - Get patterns for injection
- `getStats()` - Get execution statistics

**Example:**

```typescript
// Record a failure
engine.recordExecution({
  task: 'Read configuration',
  toolCalls: [{ name: 'Read', args: { file_path: '/config.json' } }],
  results: [{ tool: 'Read', output: 'ENOENT: file not found', isError: true }],
  success: false,
  errorMessage: 'Configuration file not found',
  durationMs: 50,
  timestamp: Date.now(),
});

// Check and trigger reflection
if (engine.shouldReflect()) {
  const reflection = await engine.reflect(client, 'claude-opus-5', 4096);
  console.log('Learned:', reflection.patterns);
}
```

### 2. ReflexionIntegration

Enhanced integration layer with task tracking and smart triggering.

**Key Features:**
- Task context management
- Failure classification (7 categories)
- Batch recording optimization
- Smart triggering based on failure diversity

**Example:**

```typescript
// Start a task
const taskId = integration.startTask('Deploy to production');

// Record tool executions
integration.recordToolExecution(
  'Bash',
  { command: 'npm build' },
  'Build successful',
  false,
  2000
);

// Complete task
integration.completeTask(true);

// Get stats with failure categories
const stats = integration.getStats();
console.log('Failure categories:', stats.failureCategories);
// { 'file-not-found': 2, 'permission-denied': 1, 'timeout': 1 }
```

### 3. ErrorHandler

Robust error handling with circuit breaker and retry logic.

**Components:**
- **CircuitBreaker**: Prevents cascading failures
- **RetryHandler**: Smart retry with exponential backoff
- **ErrorClassifier**: Categorizes errors
- **EnhancedErrorHandler**: Combined error handling

**Example:**

```typescript
import { EnhancedErrorHandler } from './experimental/reflexion';

const errorHandler = new EnhancedErrorHandler(
  {
    maxAttempts: 3,
    initialDelayMs: 1000,
    backoffMultiplier: 2,
    retryableErrors: ['timeout', 'ECONNRESET', 'rate_limit'],
  },
  {
    failureThreshold: 5,
    resetTimeoutMs: 60000,
  }
);

// Automatic retry and circuit breaker
const result = await errorHandler.execute(
  async () => await llmClient.chat(...),
  'LLM reflection'
);
```

### 4. PerformanceOptimizer

Performance enhancements for high-throughput scenarios.

**Components:**
- **ReflectionCache**: LRU cache with TTL
- **BatchProcessor**: Async batch processing
- **QueryOptimizer**: Efficient queries
- **PerformanceMonitor**: Performance tracking

**Example:**

```typescript
import { ReflectionCache, BatchProcessor } from './experimental/reflexion';

// Cache reflections
const cache = new ReflectionCache({
  enabled: true,
  ttlMs: 300000,  // 5 minutes
  maxSize: 100,
});

cache.set('task-pattern', reflection);
const cached = cache.get('task-pattern');

// Batch processing
const processor = new BatchProcessor(
  async (records) => {
    // Process batch
    await saveToDatabase(records);
  },
  { maxBatchSize: 50, flushIntervalMs: 5000 }
);

await processor.add(record);
```

## Advanced Usage

### Task-Based Tracking

```typescript
// Group executions by task for better context
integration.startTask('API Integration Test');

// Record multiple tool calls
integration.recordToolExecution('Bash', { command: 'curl api' }, 'OK', false, 100);
integration.recordToolExecution('Read', { file_path: '/response.json' }, 'OK', false, 50);

// Complete with overall success status
integration.completeTask(true);
```

### Custom Failure Classification

```typescript
import { ErrorClassifier } from './experimental/reflexion';

const error = new Error('Connection timeout after 30s');
const classification = ErrorClassifier.classify(error);

console.log(classification);
// {
//   category: 'transient',
//   severity: 'medium',
//   retryable: true,
//   userMessage: 'Network issue detected. Retrying...'
// }

const suggestion = ErrorClassifier.getRecoverySuggestion(error);
console.log(suggestion);
// "This is a temporary issue. The system will retry automatically."
```

### Performance Monitoring

```typescript
import { PerformanceMonitor } from './experimental/reflexion';

const monitor = new PerformanceMonitor();

// Measure operation
await monitor.measure('llm-reflection', async () => {
  return await engine.reflect(client, model, maxTokens);
});

// Get metrics
const metrics = monitor.getMetrics('llm-reflection');
console.log(`Avg: ${metrics.avgMs}ms, Min: ${metrics.minMs}ms, Max: ${metrics.maxMs}ms`);
```

### Query Optimization

```typescript
import { QueryOptimizer } from './experimental/reflexion';

const records = engine.getRecentExecutions(100);

// Create index for fast lookups
const index = QueryOptimizer.createIndex(records);

// Query by tool
const bashExecutions = QueryOptimizer.queryByTool(records, 'Bash', index);

// Query by time range
const recentHour = QueryOptimizer.queryByTimeRange(
  records,
  Date.now() - 3600000,
  Date.now()
);

// Compute aggregates
const aggregates = QueryOptimizer.computeAggregates(records);
console.log(`Success rate: ${(aggregates.successCount / records.length * 100).toFixed(1)}%`);
```

## CLI Commands

### `/reflect` - Show Status (Default)

```bash
/reflect
```

**Output:**
```
🔄 Reflexion Status

Recent executions (5):
  ✓ Bash (250ms) — OK
  ✗ Read (150ms) — Error: ENOENT: not found
  ✓ Write (300ms) — OK
  
Total executions: 15 | Success: 12 | Failed: 3
Success rate: 80.0% | Avg duration: 200ms
```

### `/reflect stats` - Detailed Statistics

```bash
/reflect stats
```

**Output:**
```
📊 Reflexion Statistics

Execution Summary:
  Total: 25
  Successful: 20
  Failed: 5
  Success Rate: 80.0%
  Avg Duration: 180ms
```

### `/reflect history [N]` - Execution History

```bash
/reflect history 10
```

**Output:**
```
📜 Execution History (last 10)

  ✓ [10:30:15] Bash (100ms)
  ✗ [10:30:20] Read (50ms)
     Error: File not found
  ✓ [10:30:25] Write (200ms)
```

### `/reflect learned [N]` - Learned Patterns

```bash
/reflect learned 5
```

**Output:**
```
🧠 Learned Patterns (last 5)

## Learned Patterns (from past reflections):

**2 consecutive failures detected:**
- Commands need validation before execution
- File paths should be checked for existence

**Recommendations:**
- Add error handling for file operations
- Implement retry logic for network calls
```

### `/reflect list` - All Reflections

```bash
/reflect list
```

**Output:**
```
📋 Saved Reflections (3)

  [reflection_1234_abc]
    Trigger: 2 consecutive failures
    Time: 2026-09-09 10:30:00
    Patterns: 2 | Recommendations: 3
```

### `/reflect run` - Force Reflection

```bash
/reflect run
```

**Output:**
```
🔄 Running reflection...

Analysis:
  The recent failures show a pattern of file access issues...

Identified Patterns:
  • File paths are not validated before access
  • Missing error handling for ENOENT errors

Recommendations:
  • Add path validation before file operations
  • Implement proper error handling

✓ Reflection complete and saved
```

### `/reflect clear` - Clear History

```bash
/reflect clear
```

**Output:**
```
✓ Execution history cleared
```

## Best Practices

### 1. Configure Appropriate Thresholds

```typescript
// For rapid iteration (development)
const devConfig = {
  failureThreshold: 2,  // Trigger quickly
  maxReflections: 20,   // Keep recent only
};

// For production stability
const prodConfig = {
  failureThreshold: 3,  // Be more patient
  maxReflections: 100,  // Keep more history
};
```

### 2. Use Task Context for Better Insights

```typescript
// Good: Group related operations
integration.startTask('Deploy application');
integration.recordToolExecution('Bash', {...}, ...);
integration.recordToolExecution('Git', {...}, ...);
integration.completeTask(success);

// Avoid: Recording individual operations without context
engine.recordExecution({...});  // Missing task context
```

### 3. Enable Smart Triggering in Production

```typescript
const integration = new ReflexionIntegration(engine, {
  smartTrigger: true,  // Only trigger on diverse failures
  batchRecording: true, // Optimize performance
});
```

### 4. Monitor Performance

```typescript
const monitor = new PerformanceMonitor();

// Wrap critical operations
await monitor.measure('reflection', async () => {
  return await engine.reflect(client, model, maxTokens);
});

// Check metrics periodically
const metrics = monitor.getAllMetrics();
if (metrics['reflection']?.avgMs > 5000) {
  console.warn('Reflection is slow, consider optimization');
}
```

### 5. Handle Errors Gracefully

```typescript
const errorHandler = new EnhancedErrorHandler();

try {
  const result = await errorHandler.execute(
    async () => await engine.reflect(client, model, maxTokens),
    'reflection'
  );
} catch (error: any) {
  if (error.classification) {
    console.log('Error category:', error.classification.category);
    console.log('Recovery suggestion:', ErrorClassifier.getRecoverySuggestion(error));
  }
}
```

### 6. Clear Old Data Periodically

```typescript
// In production, periodically clean up
setInterval(() => {
  const cache = new ReflectionCache();
  const cleared = cache.clearExpired();
  console.log(`Cleared ${cleared} expired cache entries`);
}, 3600000); // Every hour
```

### 7. Use Batch Processing for High Volume

```typescript
const processor = new BatchProcessor(
  async (records) => {
    await persistToDatabase(records);
  },
  {
    maxBatchSize: 100,
    flushIntervalMs: 10000,
  }
);

// Records are automatically batched
for (const record of records) {
  await processor.add(record);
}

// Ensure flush on shutdown
await processor.shutdown();
```

## Performance Tuning

### Cache Configuration

```typescript
// High-performance cache
const cache = new ReflectionCache({
  enabled: true,
  ttlMs: 600000,     // 10 minutes
  maxSize: 500,      // Larger cache
});

// Memory-constrained cache
const smallCache = new ReflectionCache({
  enabled: true,
  ttlMs: 60000,      // 1 minute
  maxSize: 50,       // Smaller cache
});
```

### Batch Processing Tuning

```typescript
// High-throughput setup
const processor = new BatchProcessor(handler, {
  maxBatchSize: 200,    // Larger batches
  flushIntervalMs: 1000, // Flush frequently
});

// Low-latency setup
const realtime = new BatchProcessor(handler, {
  maxBatchSize: 10,     // Small batches
  flushIntervalMs: 100, // Very frequent
});
```

### Circuit Breaker Tuning

```typescript
// Aggressive protection
const strictBreaker = new CircuitBreaker({
  failureThreshold: 3,
  resetTimeoutMs: 30000,
  halfOpenRequests: 1,
});

// Lenient protection
const lenientBreaker = new CircuitBreaker({
  failureThreshold: 10,
  resetTimeoutMs: 120000,
  halfOpenRequests: 5,
});
```

### Retry Strategy Tuning

```typescript
// Fast retry
const quickRetry = new RetryHandler({
  maxAttempts: 2,
  initialDelayMs: 500,
  maxDelayMs: 2000,
  backoffMultiplier: 1.5,
});

// Patient retry
const patientRetry = new RetryHandler({
  maxAttempts: 5,
  initialDelayMs: 2000,
  maxDelayMs: 30000,
  backoffMultiplier: 3,
});
```

## Troubleshooting

### Problem: Reflection Not Triggering

**Symptoms:** `shouldReflect()` always returns false

**Solutions:**
1. Check failure threshold: Lower `failureThreshold` in config
2. Verify failures are being recorded: Use `engine.getStats()` to check `failed` count
3. Check smart trigger: If enabled, ensure failure diversity
4. Verify enabled: Check `config.enabled === true`

```typescript
// Debug
const stats = engine.getStats();
console.log('Failed:', stats.failed);
console.log('Threshold:', config.failureThreshold);
console.log('Should reflect:', engine.shouldReflect());
```

### Problem: Slow Reflection

**Symptoms:** `reflect()` takes > 10 seconds

**Solutions:**
1. Reduce `maxTokens` for LLM calls
2. Enable caching to avoid redundant reflections
3. Check LLM API latency
4. Use batch processing to reduce overhead

```typescript
// Enable caching
const cache = new ReflectionCache({ enabled: true });

// Check if already reflected on similar pattern
const cacheKey = `pattern_${failureHash}`;
const cached = cache.get(cacheKey);
if (cached) {
  return cached;
}
```

### Problem: Memory Growth

**Symptoms:** Memory usage increases over time

**Solutions:**
1. Reduce `maxRecords` in ExecutionTracker
2. Reduce `maxReflections` in LearningStore
3. Enable cache expiration
4. Periodically clear old data

```typescript
// Limit memory usage
const tracker = new ExecutionTracker(100);  // Max 100 records

// Clear old data
engine.clearExecutions();
await learningStore.pruneOld();
```

### Problem: Circuit Breaker Always Open

**Symptoms:** All operations fail with "Circuit breaker is OPEN"

**Solutions:**
1. Check failure threshold: Increase threshold
2. Verify reset timeout: Reduce timeout
3. Check root cause: Fix underlying failures
4. Reset circuit breaker manually

```typescript
// Debug circuit breaker
const stats = handler.getCircuitBreakerStats();
console.log('State:', stats.state);
console.log('Failures:', stats.failureCount);

// Manual reset
handler.resetCircuitBreaker();
```

### Problem: High Error Rate

**Symptoms:** Most executions fail

**Solutions:**
1. Check error classification: Verify retryable errors
2. Review learned patterns: Check if recommendations are being applied
3. Increase retry attempts
4. Check LLM availability

```typescript
// Analyze error patterns
const stats = integration.getStats();
console.log('Failure categories:', stats.failureCategories);

// Review recommendations
const reflections = await engine.getAllReflections();
for (const r of reflections.slice(0, 3)) {
  console.log('Recommendations:', r.recommendations);
}
```

## API Reference

### ReflexionEngine

#### Constructor

```typescript
constructor(config: ReflexionConfig)
```

#### Methods

- `recordExecution(record: Omit<ExecutionRecord, 'id'>): string`
- `shouldReflect(): boolean`
- `reflect(client: LLMClient, model: string, maxTokens: number): Promise<Reflection | null>`
- `getLearnedPatterns(limit: number): Promise<string>`
- `searchRelevantReflections(query: string, limit: number): Promise<Reflection[]>`
- `getStats(): ExecutionStats`
- `getRecentExecutions(count: number): ExecutionRecord[]`
- `clearExecutions(): void`
- `getAllReflections(): Promise<Reflection[]>`
- `deleteReflection(id: string): Promise<void>`

### ReflexionIntegration

#### Constructor

```typescript
constructor(engine: ReflexionEngine, config: ReflexionConfig)
```

#### Methods

- `startTask(userPrompt: string): string`
- `recordToolExecution(toolName: string, args: Record<string, unknown>, output: string, isError: boolean, durationMs: number): void`
- `completeTask(success: boolean): void`
- `shouldReflect(): boolean`
- `reflect(client: LLMClient, model: string, maxTokens: number): Promise<ReflectionResult>`
- `getLearnedPatterns(limit: number): Promise<string>`
- `getStats(): EnhancedStats`
- `clearHistory(): void`

### ErrorHandler Components

#### EnhancedErrorHandler

```typescript
constructor(retryConfig?: Partial<RetryConfig>, circuitBreakerConfig?: Partial<CircuitBreakerConfig>)

execute<T>(operation: () => Promise<T>, operationName: string): Promise<T>
getCircuitBreakerStats(): CircuitBreakerStats
resetCircuitBreaker(): void
```

#### ErrorClassifier

```typescript
static classify(error: Error): ErrorClassification
static getRecoverySuggestion(error: Error): string
```

### Performance Components

#### ReflectionCache

```typescript
constructor(config?: Partial<CacheConfig>)

get(key: string): Reflection | null
set(key: string, value: Reflection): void
clearExpired(): number
getStats(): CacheStats
clear(): void
```

#### BatchProcessor

```typescript
constructor(processFunc: (records: ExecutionRecord[]) => Promise<void>, config?: Partial<BatchConfig>)

add(record: ExecutionRecord): Promise<void>
flush(): Promise<void>
getStats(): BatchStats
shutdown(): Promise<void>
```

#### PerformanceMonitor

```typescript
record(operation: string, durationMs: number): void
measure<T>(operation: string, fn: () => Promise<T>): Promise<T>
getMetrics(operation: string): OperationMetrics | null
getAllMetrics(): Record<string, OperationMetrics>
clear(): void
```

---

**Version:** 2.0.0  
**Last Updated:** 2026-09-09  
**License:** MIT
