# Reflexion Module - Usage Examples

## Table of Contents

1. [Basic Usage](#basic-usage)
2. [Integration Examples](#integration-examples)
3. [Error Handling Examples](#error-handling-examples)
4. [Performance Optimization Examples](#performance-optimization-examples)
5. [Real-World Scenarios](#real-world-scenarios)
6. [Testing Examples](#testing-examples)

---

## Basic Usage

### Example 1: Simple Reflexion Setup

```typescript
import { ReflexionEngine } from './experimental/reflexion';

// Initialize engine
const engine = new ReflexionEngine({
  enabled: true,
  failureThreshold: 2,
  maxReflections: 50,
  autoInject: true,
});

// Record a successful execution
engine.recordExecution({
  task: 'Read configuration file',
  toolCalls: [
    { name: 'Read', args: { file_path: '/config.json' } }
  ],
  results: [
    { tool: 'Read', output: '{"port": 3000}', isError: false }
  ],
  success: true,
  durationMs: 50,
  timestamp: Date.now(),
});

// Record a failure
engine.recordExecution({
  task: 'Write log file',
  toolCalls: [
    { name: 'Write', args: { file_path: '/logs/app.log', content: 'Log entry' } }
  ],
  results: [
    { tool: 'Write', output: 'EACCES: permission denied', isError: true }
  ],
  success: false,
  errorMessage: 'Permission denied',
  durationMs: 30,
  timestamp: Date.now(),
});

// Check if reflection is needed
if (engine.shouldReflect()) {
  console.log('⚠️ Multiple failures detected - reflection recommended');
}
```

### Example 2: Performing Reflection

```typescript
import { ReflexionEngine } from './experimental/reflexion';

const engine = new ReflexionEngine({
  enabled: true,
  failureThreshold: 2,
  maxReflections: 50,
  autoInject: true,
});

// Simulate failures
for (let i = 0; i < 3; i++) {
  engine.recordExecution({
    task: `Attempt ${i + 1}: Deploy application`,
    toolCalls: [
      { name: 'Bash', args: { command: 'npm run deploy' } }
    ],
    results: [
      { tool: 'Bash', output: 'Error: Authentication failed', isError: true }
    ],
    success: false,
    errorMessage: 'Authentication failed',
    durationMs: 1000,
    timestamp: Date.now(),
  });
}

// Trigger reflection
if (engine.shouldReflect()) {
  const reflection = await engine.reflect(llmClient, 'claude-opus-5', 4096);
  
  if (reflection) {
    console.log('📊 Reflection Analysis:');
    console.log(reflection.analysis);
    
    console.log('\n🔍 Identified Patterns:');
    reflection.patterns.forEach((pattern, i) => {
      console.log(`  ${i + 1}. ${pattern}`);
    });
    
    console.log('\n💡 Recommendations:');
    reflection.recommendations.forEach((rec, i) => {
      console.log(`  ${i + 1}. ${rec}`);
    });
  }
}
```

### Example 3: Using Learned Patterns

```typescript
import { ReflexionEngine } from './experimental/reflexion';

const engine = new ReflexionEngine({
  enabled: true,
  failureThreshold: 2,
  maxReflections: 50,
  autoInject: true,
});

// After several reflections have been performed...

// Get learned patterns for injection
const learnedPatterns = await engine.getLearnedPatterns(5);

// Inject into system prompt
const systemPrompt = `
You are a helpful AI assistant.

${learnedPatterns}

Now help the user with their task.
`;

console.log(systemPrompt);
// Output includes learned patterns like:
// ## Learned Patterns (from past reflections):
// 
// **Pattern 1:**
// - Authentication tokens expire after 1 hour
// - Always refresh tokens before operations
// ...
```

---

## Integration Examples

### Example 4: Task-Based Tracking

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
});

// Start a task
const taskId = integration.startTask('Deploy application to staging');

// Record multiple tool executions within the task
integration.recordToolExecution(
  'Bash',
  { command: 'npm run build' },
  'Build successful',
  false,
  5000
);

integration.recordToolExecution(
  'Bash',
  { command: 'npm run test' },
  'All tests passed',
  false,
  10000
);

integration.recordToolExecution(
  'Bash',
  { command: 'kubectl apply -f deployment.yml' },
  'deployment.apps/myapp configured',
  false,
  2000
);

// Complete the task
integration.completeTask(true);

console.log('✅ Task completed successfully');
```

### Example 5: Handling Task Failures

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
});

// Start deployment task
integration.startTask('Deploy to production');

// Build succeeds
integration.recordToolExecution(
  'Bash',
  { command: 'npm run build' },
  'Build successful',
  false,
  5000
);

// Deployment fails
integration.recordToolExecution(
  'Bash',
  { command: 'kubectl apply -f deployment.yml' },
  'Error: connection timed out',
  true,
  30000
);

// Complete task as failed
integration.completeTask(false);

// Check if reflection is needed
if (integration.shouldReflect()) {
  const result = await integration.reflect(llmClient, 'claude-opus-5', 4096);
  
  if (result.success && result.reflection) {
    console.log('🔄 Reflection completed');
    console.log('Learned patterns:', result.reflection.patterns);
  } else if (result.error) {
    console.error('❌ Reflection failed:', result.error);
  }
}

// Get enhanced stats with failure categories
const stats = integration.getStats();
console.log('📊 Statistics:');
console.log(`  Total: ${stats.total}`);
console.log(`  Success rate: ${(stats.successful / stats.total * 100).toFixed(1)}%`);
console.log('  Failure categories:', stats.failureCategories);
// { 'timeout': 1 }
```

### Example 6: Smart Triggering

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
});

// Same error multiple times - won't trigger smart reflection
for (let i = 0; i < 3; i++) {
  integration.startTask('Read missing file');
  integration.recordToolExecution(
    'Read',
    { file_path: '/missing.txt' },
    'ENOENT: no such file or directory',
    true,
    10
  );
  integration.completeTask(false);
}

console.log('Should reflect (same error):', integration.shouldReflect());
// false - same error repeated, not diverse enough

// Different errors - will trigger smart reflection
integration.startTask('Read protected file');
integration.recordToolExecution(
  'Read',
  { file_path: '/etc/shadow' },
  'EACCES: permission denied',
  true,
  10
);
integration.completeTask(false);

integration.startTask('Network request');
integration.recordToolExecution(
  'Bash',
  { command: 'curl https://api.example.com' },
  'Error: connection timeout',
  true,
  30000
);
integration.completeTask(false);

console.log('Should reflect (diverse errors):', integration.shouldReflect());
// true - diverse error patterns detected
```

---

## Error Handling Examples

### Example 7: Using EnhancedErrorHandler

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
try {
  const reflection = await errorHandler.execute(
    async () => {
      return await engine.reflect(llmClient, 'claude-opus-5', 4096);
    },
    'LLM reflection'
  );
  
  console.log('✅ Reflection successful:', reflection.id);
} catch (error: any) {
  console.error('❌ Reflection failed after retries');
  
  if (error.classification) {
    console.log('Category:', error.classification.category);
    console.log('Severity:', error.classification.severity);
    console.log('Retryable:', error.classification.retryable);
  }
}
```

### Example 8: Circuit Breaker Pattern

```typescript
import { EnhancedErrorHandler } from './experimental/reflexion';

const errorHandler = new EnhancedErrorHandler();

// Simulate multiple failures
for (let i = 0; i < 10; i++) {
  try {
    await errorHandler.execute(
      async () => {
        // Simulate unstable API
        if (Math.random() < 0.8) {
          throw new Error('Service unavailable');
        }
        return 'Success';
      },
      `operation-${i}`
    );
  } catch (error) {
    console.log(`Attempt ${i + 1} failed`);
  }
  
  // Check circuit breaker state
  const stats = errorHandler.getCircuitBreakerStats();
  console.log(`Circuit breaker state: ${stats.state}`);
  
  if (stats.state === 'OPEN') {
    console.log('⚠️ Circuit breaker is OPEN - preventing further calls');
    break;
  }
}

// Wait for reset timeout, then manually reset
setTimeout(() => {
  errorHandler.resetCircuitBreaker();
  console.log('Circuit breaker manually reset');
}, 60000);
```

### Example 9: Error Classification

```typescript
import { ErrorClassifier } from './experimental/reflexion';

// Classify different types of errors
const errors = [
  new Error('ENOENT: no such file or directory'),
  new Error('EACCES: permission denied'),
  new Error('Connection timeout'),
  new Error('401 Unauthorized'),
  new Error('Invalid input format'),
];

for (const error of errors) {
  const classification = ErrorClassifier.classify(error);
  const suggestion = ErrorClassifier.getRecoverySuggestion(error);
  
  console.log(`\nError: ${error.message}`);
  console.log(`  Category: ${classification.category}`);
  console.log(`  Severity: ${classification.severity}`);
  console.log(`  Retryable: ${classification.retryable}`);
  console.log(`  Suggestion: ${suggestion}`);
}

// Output:
// Error: ENOENT: no such file or directory
//   Category: permanent
//   Severity: medium
//   Retryable: false
//   Suggestion: Check the file path and try again.
//
// Error: EACCES: permission denied
//   Category: permanent
//   Severity: high
//   Retryable: false
//   Suggestion: Check file permissions and user access rights.
//
// Error: Connection timeout
//   Category: transient
//   Severity: medium
//   Retryable: true
//   Suggestion: This is a temporary issue. The system will retry automatically.
// ...
```

---

## Performance Optimization Examples

### Example 10: Caching Reflections

```typescript
import { ReflectionCache } from './experimental/reflexion';

const cache = new ReflectionCache({
  enabled: true,
  ttlMs: 600000,  // 10 minutes
  maxSize: 100,
});

// Generate cache key from failure pattern
function getCacheKey(executionRecords: ExecutionRecord[]): string {
  const errorMessages = executionRecords
    .filter(r => !r.success)
    .map(r => r.errorMessage)
    .join('|');
  return `pattern:${hashString(errorMessages)}`;
}

// Check cache before reflecting
const cacheKey = getCacheKey(recentFailures);
let reflection = cache.get(cacheKey);

if (reflection) {
  console.log('✅ Using cached reflection');
} else {
  console.log('🔄 Performing new reflection');
  reflection = await engine.reflect(llmClient, 'claude-opus-5', 4096);
  
  if (reflection) {
    cache.set(cacheKey, reflection);
  }
}

// Check cache stats
const stats = cache.getStats();
console.log(`Cache hit rate: ${(stats.hitRate * 100).toFixed(1)}%`);
console.log(`Cache size: ${stats.size}/${cache['config'].maxSize}`);

// Periodically clear expired entries
setInterval(() => {
  const cleared = cache.clearExpired();
  if (cleared > 0) {
    console.log(`Cleared ${cleared} expired cache entries`);
  }
}, 60000);
```

### Example 11: Batch Processing

```typescript
import { BatchProcessor } from './experimental/reflexion';

// Create batch processor for database writes
const processor = new BatchProcessor(
  async (records: ExecutionRecord[]) => {
    console.log(`📦 Processing batch of ${records.length} records`);
    await database.insertMany('executions', records);
    console.log('✅ Batch saved to database');
  },
  {
    maxBatchSize: 100,
    flushIntervalMs: 10000,  // Flush every 10 seconds
  }
);

// Records are automatically batched
for (let i = 0; i < 250; i++) {
  const record = {
    id: `record-${i}`,
    task: `Task ${i}`,
    toolCalls: [{ name: 'Bash', args: { command: 'echo test' } }],
    results: [{ tool: 'Bash', output: 'test', isError: false }],
    success: true,
    durationMs: 10,
    timestamp: Date.now(),
  };
  
  await processor.add(record);
  
  // Batches are flushed automatically when full
}

// Get batch stats
const stats = processor.getStats();
console.log(`Total batches: ${stats.totalBatches}`);
console.log(`Average batch size: ${stats.avgBatchSize.toFixed(1)}`);
console.log(`Pending records: ${stats.pendingRecords}`);

// Ensure everything is flushed on shutdown
process.on('SIGTERM', async () => {
  await processor.shutdown();
  console.log('Batch processor shut down gracefully');
});
```

### Example 12: Query Optimization

```typescript
import { QueryOptimizer } from './experimental/reflexion';

// Get execution records
const allRecords = engine.getRecentExecutions(1000);

// Create index for fast tool-based queries
console.log('Creating index...');
const index = QueryOptimizer.createIndex(allRecords);
console.log(`Index created with ${index.size} tool names`);

// Query by tool (with index)
console.time('Query with index');
const bashRecords = QueryOptimizer.queryByTool(allRecords, 'Bash', index);
console.timeEnd('Query with index');
console.log(`Found ${bashRecords.length} Bash executions`);

// Query by time range (binary search)
const oneHourAgo = Date.now() - 3600000;
console.time('Time range query');
const recentRecords = QueryOptimizer.queryByTimeRange(
  allRecords,
  oneHourAgo,
  Date.now()
);
console.timeEnd('Time range query');
console.log(`Found ${recentRecords.length} records in last hour`);

// Compute aggregates
const aggregates = QueryOptimizer.computeAggregates(allRecords);
console.log('\n📊 Aggregates:');
console.log(`  Total duration: ${aggregates.totalDuration}ms`);
console.log(`  Average duration: ${aggregates.avgDuration.toFixed(1)}ms`);
console.log(`  Success rate: ${(aggregates.successCount / allRecords.length * 100).toFixed(1)}%`);
console.log('  Tool usage:');
for (const [tool, count] of aggregates.toolUsage.entries()) {
  console.log(`    ${tool}: ${count}`);
}
```

### Example 13: Performance Monitoring

```typescript
import { PerformanceMonitor } from './experimental/reflexion';

const monitor = new PerformanceMonitor();

// Measure different operations
async function deployApplication() {
  // Measure build
  await monitor.measure('build', async () => {
    await exec('npm run build');
  });
  
  // Measure tests
  await monitor.measure('test', async () => {
    await exec('npm test');
  });
  
  // Measure deployment
  await monitor.measure('deploy', async () => {
    await exec('kubectl apply -f deployment.yml');
  });
  
  // Measure reflection
  if (engine.shouldReflect()) {
    await monitor.measure('reflection', async () => {
      return await engine.reflect(llmClient, 'claude-opus-5', 4096);
    });
  }
}

// Run multiple deployments
for (let i = 0; i < 5; i++) {
  await deployApplication();
}

// Analyze performance
console.log('\n⚡ Performance Report:');
const allMetrics = monitor.getAllMetrics();

for (const [operation, metrics] of Object.entries(allMetrics)) {
  console.log(`\n${operation}:`);
  console.log(`  Count: ${metrics.count}`);
  console.log(`  Average: ${metrics.avgMs.toFixed(0)}ms`);
  console.log(`  Min: ${metrics.minMs}ms`);
  console.log(`  Max: ${metrics.maxMs}ms`);
  console.log(`  Total: ${metrics.totalMs}ms`);
}

// Identify slow operations
const slowOps = Object.entries(allMetrics)
  .filter(([_, metrics]) => metrics.avgMs > 5000)
  .sort((a, b) => b[1].avgMs - a[1].avgMs);

if (slowOps.length > 0) {
  console.log('\n⚠️ Slow operations detected:');
  for (const [op, metrics] of slowOps) {
    console.log(`  ${op}: ${metrics.avgMs.toFixed(0)}ms average`);
  }
}
```

---

## Real-World Scenarios

### Example 14: CI/CD Pipeline with Reflexion

```typescript
import { ReflexionIntegration, ReflexionEngine, EnhancedErrorHandler } from './experimental/reflexion';

class CIPipeline {
  private integration: ReflexionIntegration;
  private errorHandler: EnhancedErrorHandler;
  
  constructor() {
    const engine = new ReflexionEngine({
      enabled: true,
      failureThreshold: 2,
      maxReflections: 100,
      autoInject: true,
    });
    
    this.integration = new ReflexionIntegration(engine, {
      enabled: true,
      failureThreshold: 2,
      maxReflections: 100,
      autoInject: true,
    });
    
    this.errorHandler = new EnhancedErrorHandler();
  }
  
  async runPipeline() {
    this.integration.startTask('CI/CD Pipeline');
    
    try {
      await this.build();
      await this.test();
      await this.deploy();
      
      this.integration.completeTask(true);
      console.log('✅ Pipeline completed successfully');
    } catch (error: any) {
      this.integration.completeTask(false);
      console.error('❌ Pipeline failed:', error.message);
      
      // Check if reflection is needed
      if (this.integration.shouldReflect()) {
        await this.performReflection();
      }
      
      throw error;
    }
  }
  
  private async build() {
    const result = await this.errorHandler.execute(
      async () => {
        console.log('🔨 Building...');
        const output = await exec('npm run build');
        return output;
      },
      'build'
    );
    
    this.integration.recordToolExecution(
      'Bash',
      { command: 'npm run build' },
      result,
      false,
      5000
    );
  }
  
  private async test() {
    const result = await this.errorHandler.execute(
      async () => {
        console.log('🧪 Testing...');
        const output = await exec('npm test');
        return output;
      },
      'test'
    );
    
    this.integration.recordToolExecution(
      'Bash',
      { command: 'npm test' },
      result,
      false,
      10000
    );
  }
  
  private async deploy() {
    const result = await this.errorHandler.execute(
      async () => {
        console.log('🚀 Deploying...');
        const output = await exec('kubectl apply -f deployment.yml');
        return output;
      },
      'deploy'
    );
    
    this.integration.recordToolExecution(
      'Bash',
      { command: 'kubectl apply -f deployment.yml' },
      result,
      false,
      2000
    );
  }
  
  private async performReflection() {
    console.log('🔄 Performing reflection on pipeline failures...');
    
    const result = await this.integration.reflect(
      llmClient,
      'claude-opus-5',
      4096
    );
    
    if (result.success && result.reflection) {
      console.log('\n📊 Reflection Analysis:');
      console.log(result.reflection.analysis);
      
      console.log('\n💡 Recommendations for next run:');
      result.reflection.recommendations.forEach((rec, i) => {
        console.log(`  ${i + 1}. ${rec}`);
      });
      
      // Store recommendations for display in CI dashboard
      await storePipelineRecommendations(result.reflection);
    }
  }
}

// Usage
const pipeline = new CIPipeline();
await pipeline.runPipeline();
```

### Example 15: Debugging Assistant

```typescript
import { ReflexionEngine } from './experimental/reflexion';

class DebuggingAssistant {
  private engine: ReflexionEngine;
  
  constructor() {
    this.engine = new ReflexionEngine({
      enabled: true,
      failureThreshold: 1,  // Trigger quickly for debugging
      maxReflections: 20,
      autoInject: true,
    });
  }
  
  async debugIssue(userDescription: string) {
    console.log(`🔍 Debugging: ${userDescription}\n`);
    
    // Try different debugging approaches
    const approaches = [
      () => this.checkLogs(),
      () => this.checkConfiguration(),
      () => this.checkDependencies(),
      () => this.checkEnvironment(),
    ];
    
    for (const approach of approaches) {
      try {
        const result = await approach();
        if (result.found) {
          console.log('✅ Issue identified:', result.message);
          return result;
        }
      } catch (error: any) {
        // Record failure
        this.engine.recordExecution({
          task: `Debug: ${userDescription}`,
          toolCalls: [{ name: approach.name, args: {} }],
          results: [{ tool: approach.name, output: error.message, isError: true }],
          success: false,
          errorMessage: error.message,
          durationMs: 100,
          timestamp: Date.now(),
        });
      }
    }
    
    // If all approaches failed, perform reflection
    if (this.engine.shouldReflect()) {
      console.log('\n🧠 All standard approaches failed. Reflecting...\n');
      
      const reflection = await this.engine.reflect(
        llmClient,
        'claude-opus-5',
        4096
      );
      
      if (reflection) {
        console.log('💡 Suggested debugging strategies:');
        reflection.recommendations.forEach((rec, i) => {
          console.log(`  ${i + 1}. ${rec}`);
        });
      }
    }
  }
  
  private async checkLogs() {
    // Implementation
    return { found: false, message: '' };
  }
  
  private async checkConfiguration() {
    // Implementation
    return { found: false, message: '' };
  }
  
  private async checkDependencies() {
    // Implementation
    return { found: false, message: '' };
  }
  
  private async checkEnvironment() {
    // Implementation
    return { found: false, message: '' };
  }
}

// Usage
const assistant = new DebuggingAssistant();
await assistant.debugIssue('Application crashes on startup');
```

---

## Testing Examples

### Example 16: Testing Reflexion Engine

```typescript
import { ReflexionEngine } from './experimental/reflexion';
import { describe, it, expect, beforeEach } from 'vitest';

describe('ReflexionEngine', () => {
  let engine: ReflexionEngine;
  
  beforeEach(() => {
    engine = new ReflexionEngine({
      enabled: true,
      failureThreshold: 2,
      maxReflections: 50,
      autoInject: true,
    });
  });
  
  it('should record executions', () => {
    const recordId = engine.recordExecution({
      task: 'Test task',
      toolCalls: [{ name: 'Bash', args: { command: 'echo test' } }],
      results: [{ tool: 'Bash', output: 'test', isError: false }],
      success: true,
      durationMs: 10,
      timestamp: Date.now(),
    });
    
    expect(recordId).toBeDefined();
    
    const stats = engine.getStats();
    expect(stats.total).toBe(1);
    expect(stats.successful).toBe(1);
  });
  
  it('should trigger reflection after threshold failures', () => {
    // Record failures
    for (let i = 0; i < 2; i++) {
      engine.recordExecution({
        task: `Failed task ${i}`,
        toolCalls: [{ name: 'Bash', args: { command: 'false' } }],
        results: [{ tool: 'Bash', output: 'Error', isError: true }],
        success: false,
        errorMessage: 'Command failed',
        durationMs: 10,
        timestamp: Date.now(),
      });
    }
    
    expect(engine.shouldReflect()).toBe(true);
  });
  
  it('should reset trigger after success', () => {
    // Record failure
    engine.recordExecution({
      task: 'Failed task',
      toolCalls: [{ name: 'Bash', args: { command: 'false' } }],
      results: [{ tool: 'Bash', output: 'Error', isError: true }],
      success: false,
      errorMessage: 'Command failed',
      durationMs: 10,
      timestamp: Date.now(),
    });
    
    // Record success
    engine.recordExecution({
      task: 'Success task',
      toolCalls: [{ name: 'Bash', args: { command: 'true' } }],
      results: [{ tool: 'Bash', output: 'OK', isError: false }],
      success: true,
      durationMs: 10,
      timestamp: Date.now(),
    });
    
    expect(engine.shouldReflect()).toBe(false);
  });
});
```

### Example 17: Mocking LLM for Tests

```typescript
import { ReflexionEngine } from './experimental/reflexion';
import { describe, it, expect, beforeEach } from 'vitest';

describe('Reflection with mocked LLM', () => {
  let engine: ReflexionEngine;
  let mockLLMClient: any;
  
  beforeEach(() => {
    engine = new ReflexionEngine({
      enabled: true,
      failureThreshold: 2,
      maxReflections: 50,
      autoInject: true,
    });
    
    // Mock LLM client
    mockLLMClient = {
      chat: async (messages: any[]) => {
        return {
          content: `
## Analysis
Multiple file access failures detected due to missing files.

## Patterns
- File paths are not validated before access
- No fallback mechanism for missing files

## Recommendations
- Add file existence checks before operations
- Implement default configuration files
- Add better error messages
          `.trim(),
        };
      },
    };
  });
  
  it('should perform reflection with LLM', async () => {
    // Record failures
    for (let i = 0; i < 2; i++) {
      engine.recordExecution({
        task: `Read file ${i}`,
        toolCalls: [{ name: 'Read', args: { file_path: `/missing${i}.txt` } }],
        results: [{ tool: 'Read', output: 'ENOENT: not found', isError: true }],
        success: false,
        errorMessage: 'File not found',
        durationMs: 10,
        timestamp: Date.now(),
      });
    }
    
    // Perform reflection
    const reflection = await engine.reflect(mockLLMClient, 'claude-opus-5', 4096);
    
    expect(reflection).toBeDefined();
    expect(reflection!.analysis).toContain('file access failures');
    expect(reflection!.patterns.length).toBeGreaterThan(0);
    expect(reflection!.recommendations.length).toBeGreaterThan(0);
  });
});
```

---

**More examples available in the test files:**
- [reflexion.test.ts](./reflexion.test.ts)
- [reflexion.enhanced.test.ts](./reflexion.enhanced.test.ts)
- [ReflexionIntegration.test.ts](./ReflexionIntegration.test.ts)
- [ErrorHandler.test.ts](./ErrorHandler.test.ts)
- [PerformanceOptimizer.test.ts](./PerformanceOptimizer.test.ts)

**Version:** 2.0.0  
**Last Updated:** 2026-09-09
