# Reflexion Module - API Reference

## Table of Contents

- [Core Classes](#core-classes)
  - [ReflexionEngine](#reflexionengine)
  - [ReflexionIntegration](#reflexionintegration)
- [Error Handling](#error-handling)
  - [EnhancedErrorHandler](#enhancederrorhandler)
  - [CircuitBreaker](#circuitbreaker)
  - [RetryHandler](#retryhandler)
  - [ErrorClassifier](#errorclassifier)
- [Performance](#performance)
  - [ReflectionCache](#reflectioncache)
  - [BatchProcessor](#batchprocessor)
  - [QueryOptimizer](#queryoptimizer)
  - [PerformanceMonitor](#performancemonitor)
- [Data Types](#data-types)

---

## Core Classes

### ReflexionEngine

The main engine that coordinates self-reflection based on execution outcomes.

#### Constructor

```typescript
constructor(config: ReflexionConfig)
```

**Parameters:**
- `config`: Configuration object
  - `enabled`: boolean - Enable/disable reflexion
  - `failureThreshold`: number - Number of consecutive failures to trigger reflection
  - `maxReflections`: number - Maximum number of reflections to keep in storage
  - `autoInject`: boolean - Automatically inject learned patterns into prompts

**Example:**
```typescript
const engine = new ReflexionEngine({
  enabled: true,
  failureThreshold: 2,
  maxReflections: 50,
  autoInject: true,
});
```

#### Methods

##### recordExecution

```typescript
recordExecution(record: Omit<ExecutionRecord, 'id'>): string
```

Records an execution outcome for tracking.

**Parameters:**
- `record`: Execution record without ID
  - `task`: string - Task description
  - `toolCalls`: ToolCall[] - Array of tool invocations
  - `results`: ToolResult[] - Array of tool results
  - `success`: boolean - Overall success status
  - `errorMessage?`: string - Error message if failed
  - `durationMs`: number - Execution duration
  - `timestamp`: number - Unix timestamp

**Returns:** Record ID (string)

**Example:**
```typescript
const recordId = engine.recordExecution({
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

##### shouldReflect

```typescript
shouldReflect(): boolean
```

Checks if reflection should be triggered based on consecutive failures.

**Returns:** true if failure threshold is reached

**Example:**
```typescript
if (engine.shouldReflect()) {
  await engine.reflect(client, model, maxTokens);
}
```

##### reflect

```typescript
async reflect(
  client: LLMClient,
  model: string,
  maxTokens: number
): Promise<Reflection | null>
```

Performs reflection using LLM to analyze failures and extract patterns.

**Parameters:**
- `client`: LLM client instance
- `model`: Model identifier (e.g., 'claude-opus-5')
- `maxTokens`: Maximum tokens for LLM response

**Returns:** Reflection object or null if failed

**Example:**
```typescript
const reflection = await engine.reflect(llmClient, 'claude-opus-5', 4096);
if (reflection) {
  console.log('Analysis:', reflection.analysis);
  console.log('Patterns:', reflection.patterns);
}
```

##### getLearnedPatterns

```typescript
async getLearnedPatterns(limit: number = 5): Promise<string>
```

Retrieves learned patterns formatted for injection into prompts.

**Parameters:**
- `limit`: Maximum number of recent patterns to retrieve (default: 5)

**Returns:** Formatted string with patterns and recommendations

**Example:**
```typescript
const patterns = await engine.getLearnedPatterns(5);
// Inject into system prompt
const enhancedPrompt = basePrompt + '\n\n' + patterns;
```

##### searchRelevantReflections

```typescript
async searchRelevantReflections(
  query: string,
  limit: number = 5
): Promise<Reflection[]>
```

Searches for reflections relevant to a query.

**Parameters:**
- `query`: Search query
- `limit`: Maximum results to return

**Returns:** Array of matching reflections

##### getStats

```typescript
getStats(): ExecutionStats
```

Returns execution statistics.

**Returns:** Statistics object
- `total`: number - Total executions
- `successful`: number - Successful executions
- `failed`: number - Failed executions
- `avgDurationMs`: number - Average duration

**Example:**
```typescript
const stats = engine.getStats();
console.log(`Success rate: ${(stats.successful / stats.total * 100).toFixed(1)}%`);
```

##### getRecentExecutions

```typescript
getRecentExecutions(count: number = 10): ExecutionRecord[]
```

Retrieves recent execution records.

**Parameters:**
- `count`: Number of records to retrieve

**Returns:** Array of execution records

##### clearExecutions

```typescript
clearExecutions(): void
```

Clears all execution history.

##### getAllReflections

```typescript
async getAllReflections(): Promise<Reflection[]>
```

Retrieves all stored reflections.

**Returns:** Array of all reflections

##### deleteReflection

```typescript
async deleteReflection(id: string): Promise<void>
```

Deletes a specific reflection.

**Parameters:**
- `id`: Reflection ID to delete

---

### ReflexionIntegration

Enhanced integration layer with task tracking and smart triggering.

#### Constructor

```typescript
constructor(engine: ReflexionEngine, config: ReflexionConfig)
```

**Parameters:**
- `engine`: ReflexionEngine instance
- `config`: Configuration (same as ReflexionEngine)

**Example:**
```typescript
const integration = new ReflexionIntegration(engine, {
  enabled: true,
  failureThreshold: 2,
  maxReflections: 50,
  autoInject: true,
});
```

#### Methods

##### startTask

```typescript
startTask(userPrompt: string): string
```

Starts a new task context.

**Parameters:**
- `userPrompt`: User's task description

**Returns:** Task ID

**Example:**
```typescript
const taskId = integration.startTask('Deploy to production');
```

##### recordToolExecution

```typescript
recordToolExecution(
  toolName: string,
  args: Record<string, unknown>,
  output: string,
  isError: boolean,
  durationMs: number
): void
```

Records a tool execution within the current task.

**Parameters:**
- `toolName`: Name of the tool
- `args`: Tool arguments
- `output`: Tool output/result
- `isError`: Whether execution resulted in error
- `durationMs`: Execution duration

**Example:**
```typescript
integration.recordToolExecution(
  'Bash',
  { command: 'npm build' },
  'Build successful',
  false,
  2000
);
```

##### completeTask

```typescript
completeTask(success: boolean): void
```

Completes the current task and records it.

**Parameters:**
- `success`: Overall task success status

**Example:**
```typescript
integration.completeTask(true);
```

##### shouldReflect

```typescript
shouldReflect(): boolean
```

Smart triggering that considers failure diversity.

**Returns:** true if reflection is recommended

##### reflect

```typescript
async reflect(
  client: LLMClient,
  model: string,
  maxTokens: number
): Promise<ReflectionResult>
```

Performs reflection with error handling.

**Returns:** Reflection result object
- `success`: boolean
- `reflection?`: Reflection object
- `error?`: Error message

##### getLearnedPatterns

```typescript
async getLearnedPatterns(limit?: number): Promise<string>
```

Gets learned patterns (delegates to engine).

##### getStats

```typescript
getStats(): EnhancedStats
```

Returns enhanced statistics including failure categories.

**Returns:** Enhanced stats object
- All properties from ExecutionStats
- `failureCategories`: Record<string, number> - Count by category

**Example:**
```typescript
const stats = integration.getStats();
console.log('Failure categories:', stats.failureCategories);
// { 'file-not-found': 2, 'timeout': 1 }
```

##### clearHistory

```typescript
clearHistory(): void
```

Clears execution history (delegates to engine).

---

## Error Handling

### EnhancedErrorHandler

Combines circuit breaker and retry logic for robust error handling.

#### Constructor

```typescript
constructor(
  retryConfig?: Partial<RetryConfig>,
  circuitBreakerConfig?: Partial<CircuitBreakerConfig>
)
```

**Parameters:**
- `retryConfig`: Retry configuration
  - `maxAttempts`: number (default: 3)
  - `initialDelayMs`: number (default: 1000)
  - `maxDelayMs`: number (default: 10000)
  - `backoffMultiplier`: number (default: 2)
  - `retryableErrors`: string[] (default: ['timeout', 'ECONNRESET', 'ETIMEDOUT', 'rate_limit'])
- `circuitBreakerConfig`: Circuit breaker configuration
  - `failureThreshold`: number (default: 5)
  - `resetTimeoutMs`: number (default: 60000)
  - `halfOpenRequests`: number (default: 1)

**Example:**
```typescript
const errorHandler = new EnhancedErrorHandler(
  {
    maxAttempts: 3,
    initialDelayMs: 1000,
    retryableErrors: ['timeout', 'rate_limit'],
  },
  {
    failureThreshold: 5,
    resetTimeoutMs: 60000,
  }
);
```

#### Methods

##### execute

```typescript
async execute<T>(
  operation: () => Promise<T>,
  operationName: string
): Promise<T>
```

Executes an operation with automatic retry and circuit breaker protection.

**Parameters:**
- `operation`: Async function to execute
- `operationName`: Name for logging/debugging

**Returns:** Operation result

**Throws:** Enhanced error with classification

**Example:**
```typescript
const result = await errorHandler.execute(
  async () => await llmClient.chat(...),
  'LLM reflection'
);
```

##### getCircuitBreakerStats

```typescript
getCircuitBreakerStats(): CircuitBreakerStats
```

Returns circuit breaker status.

**Returns:**
- `state`: 'CLOSED' | 'OPEN' | 'HALF_OPEN'
- `failureCount`: number
- `lastFailureTime`: number | null

##### resetCircuitBreaker

```typescript
resetCircuitBreaker(): void
```

Manually resets the circuit breaker to CLOSED state.

---

### CircuitBreaker

Implements the circuit breaker pattern to prevent cascading failures.

#### Constructor

```typescript
constructor(config?: Partial<CircuitBreakerConfig>)
```

**States:**
- **CLOSED**: Normal operation, requests pass through
- **OPEN**: Too many failures, requests fail immediately
- **HALF_OPEN**: Testing if service recovered, limited requests allowed

#### Methods

##### execute

```typescript
async execute<T>(operation: () => Promise<T>): Promise<T>
```

Executes operation through the circuit breaker.

##### getState

```typescript
getState(): 'CLOSED' | 'OPEN' | 'HALF_OPEN'
```

Returns current circuit breaker state.

##### reset

```typescript
reset(): void
```

Resets to CLOSED state.

---

### RetryHandler

Implements retry logic with exponential backoff.

#### Constructor

```typescript
constructor(config?: Partial<RetryConfig>)
```

#### Methods

##### execute

```typescript
async execute<T>(operation: () => Promise<T>): Promise<T>
```

Executes operation with automatic retry on failure.

**Behavior:**
- Retries on retryable errors
- Exponential backoff between attempts
- Respects max delay cap

---

### ErrorClassifier

Static utility for error classification.

#### Methods

##### classify

```typescript
static classify(error: Error): ErrorClassification
```

Classifies an error into categories.

**Returns:** Classification object
- `category`: 'transient' | 'permanent' | 'client' | 'server' | 'auth' | 'validation' | 'unknown'
- `severity`: 'low' | 'medium' | 'high' | 'critical'
- `retryable`: boolean
- `userMessage`: string

**Example:**
```typescript
try {
  await operation();
} catch (error) {
  const classification = ErrorClassifier.classify(error);
  console.log('Category:', classification.category);
  console.log('Retryable:', classification.retryable);
}
```

##### getRecoverySuggestion

```typescript
static getRecoverySuggestion(error: Error): string
```

Provides user-friendly recovery suggestion.

**Example:**
```typescript
const error = new Error('Connection timeout');
const suggestion = ErrorClassifier.getRecoverySuggestion(error);
console.log(suggestion);
// "This is a temporary issue. The system will retry automatically."
```

---

## Performance

### ReflectionCache

LRU cache with TTL for reflection results.

#### Constructor

```typescript
constructor(config?: Partial<CacheConfig>)
```

**Parameters:**
- `config`:
  - `enabled`: boolean (default: true)
  - `ttlMs`: number (default: 300000 - 5 minutes)
  - `maxSize`: number (default: 100)

#### Methods

##### get

```typescript
get(key: string): Reflection | null
```

Retrieves cached reflection.

##### set

```typescript
set(key: string, value: Reflection): void
```

Stores reflection in cache.

##### has

```typescript
has(key: string): boolean
```

Checks if key exists and is not expired.

##### clearExpired

```typescript
clearExpired(): number
```

Removes expired entries.

**Returns:** Number of entries cleared

##### getStats

```typescript
getStats(): CacheStats
```

Returns cache statistics.

**Returns:**
- `hits`: number
- `misses`: number
- `size`: number
- `hitRate`: number

##### clear

```typescript
clear(): void
```

Clears all cache entries.

**Example:**
```typescript
const cache = new ReflectionCache({ ttlMs: 600000, maxSize: 200 });

// Cache a reflection
cache.set('pattern-123', reflection);

// Retrieve from cache
const cached = cache.get('pattern-123');

// Check stats
const stats = cache.getStats();
console.log(`Hit rate: ${(stats.hitRate * 100).toFixed(1)}%`);
```

---

### BatchProcessor

Async batch processing with automatic flushing.

#### Constructor

```typescript
constructor(
  processFunc: (records: ExecutionRecord[]) => Promise<void>,
  config?: Partial<BatchConfig>
)
```

**Parameters:**
- `processFunc`: Function to process batch
- `config`:
  - `maxBatchSize`: number (default: 50)
  - `flushIntervalMs`: number (default: 5000)

#### Methods

##### add

```typescript
async add(record: ExecutionRecord): Promise<void>
```

Adds record to batch. Triggers flush if batch is full.

##### flush

```typescript
async flush(): Promise<void>
```

Forces immediate flush of pending records.

##### getStats

```typescript
getStats(): BatchStats
```

Returns batch processing statistics.

**Returns:**
- `totalRecords`: number
- `totalBatches`: number
- `avgBatchSize`: number
- `pendingRecords`: number

##### shutdown

```typescript
async shutdown(): Promise<void>
```

Stops the processor and flushes pending records.

**Example:**
```typescript
const processor = new BatchProcessor(
  async (records) => {
    await database.insertMany(records);
  },
  { maxBatchSize: 100, flushIntervalMs: 10000 }
);

// Add records
for (const record of records) {
  await processor.add(record);
}

// Ensure flush on shutdown
await processor.shutdown();
```

---

### QueryOptimizer

Efficient querying with indexing and aggregation.

#### Static Methods

##### createIndex

```typescript
static createIndex(records: ExecutionRecord[]): Map<string, number[]>
```

Creates an index mapping tool names to record positions.

##### queryByTool

```typescript
static queryByTool(
  records: ExecutionRecord[],
  toolName: string,
  index?: Map<string, number[]>
): ExecutionRecord[]
```

Queries records by tool name using optional index.

##### queryByTimeRange

```typescript
static queryByTimeRange(
  records: ExecutionRecord[],
  startTime: number,
  endTime: number
): ExecutionRecord[]
```

Queries records within a time range using binary search.

##### queryBySuccess

```typescript
static queryBySuccess(
  records: ExecutionRecord[],
  success: boolean
): ExecutionRecord[]
```

Filters records by success status.

##### computeAggregates

```typescript
static computeAggregates(records: ExecutionRecord[]): {
  totalDuration: number;
  avgDuration: number;
  successCount: number;
  failureCount: number;
  toolUsage: Map<string, number>;
}
```

Computes aggregate statistics efficiently.

**Example:**
```typescript
const records = engine.getRecentExecutions(100);

// Create index for fast lookups
const index = QueryOptimizer.createIndex(records);

// Query by tool
const bashExecutions = QueryOptimizer.queryByTool(records, 'Bash', index);

// Query by time
const lastHour = QueryOptimizer.queryByTimeRange(
  records,
  Date.now() - 3600000,
  Date.now()
);

// Compute stats
const aggregates = QueryOptimizer.computeAggregates(records);
console.log('Tool usage:', aggregates.toolUsage);
```

---

### PerformanceMonitor

Tracks operation performance metrics.

#### Methods

##### record

```typescript
record(operation: string, durationMs: number): void
```

Records a single operation timing.

##### measure

```typescript
async measure<T>(
  operation: string,
  fn: () => Promise<T>
): Promise<T>
```

Wraps and measures an async operation.

**Example:**
```typescript
const monitor = new PerformanceMonitor();

const result = await monitor.measure('llm-call', async () => {
  return await llmClient.chat(...);
});
```

##### getMetrics

```typescript
getMetrics(operation: string): OperationMetrics | null
```

Gets metrics for a specific operation.

**Returns:**
- `count`: number
- `totalMs`: number
- `avgMs`: number
- `minMs`: number
- `maxMs`: number

##### getAllMetrics

```typescript
getAllMetrics(): Record<string, OperationMetrics>
```

Returns all tracked metrics.

##### clear

```typescript
clear(): void
```

Clears all metrics.

**Example:**
```typescript
const monitor = new PerformanceMonitor();

// Measure operations
await monitor.measure('reflection', async () => {
  return await engine.reflect(client, model, maxTokens);
});

// Get metrics
const metrics = monitor.getMetrics('reflection');
if (metrics) {
  console.log(`Avg: ${metrics.avgMs}ms, Max: ${metrics.maxMs}ms`);
}

// Check all metrics
const all = monitor.getAllMetrics();
for (const [op, metrics] of Object.entries(all)) {
  console.log(`${op}: ${metrics.avgMs}ms avg over ${metrics.count} calls`);
}
```

---

## Data Types

### ExecutionRecord

```typescript
interface ExecutionRecord {
  id: string;
  task: string;
  toolCalls: ToolCall[];
  results: ToolResult[];
  success: boolean;
  errorMessage?: string;
  durationMs: number;
  timestamp: number;
}
```

### ToolCall

```typescript
interface ToolCall {
  name: string;
  args: Record<string, unknown>;
}
```

### ToolResult

```typescript
interface ToolResult {
  tool: string;
  output: string;
  isError: boolean;
}
```

### Reflection

```typescript
interface Reflection {
  id: string;
  trigger: string;
  timestamp: number;
  analysis: string;
  patterns: string[];
  recommendations: string[];
  executionsSinceLastReflection: ExecutionRecord[];
}
```

### ReflexionConfig

```typescript
interface ReflexionConfig {
  enabled: boolean;
  failureThreshold: number;
  maxReflections: number;
  autoInject: boolean;
}
```

### ExecutionStats

```typescript
interface ExecutionStats {
  total: number;
  successful: number;
  failed: number;
  avgDurationMs: number;
}
```

### EnhancedStats

```typescript
interface EnhancedStats extends ExecutionStats {
  failureCategories: Record<string, number>;
}
```

### ErrorClassification

```typescript
interface ErrorClassification {
  category: 'transient' | 'permanent' | 'client' | 'server' | 'auth' | 'validation' | 'unknown';
  severity: 'low' | 'medium' | 'high' | 'critical';
  retryable: boolean;
  userMessage: string;
}
```

### CacheStats

```typescript
interface CacheStats {
  hits: number;
  misses: number;
  size: number;
  hitRate: number;
}
```

### BatchStats

```typescript
interface BatchStats {
  totalRecords: number;
  totalBatches: number;
  avgBatchSize: number;
  pendingRecords: number;
}
```

### OperationMetrics

```typescript
interface OperationMetrics {
  count: number;
  totalMs: number;
  avgMs: number;
  minMs: number;
  maxMs: number;
}
```

---

**Version:** 2.0.0  
**Last Updated:** 2026-09-09
