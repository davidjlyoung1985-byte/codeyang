# CodeYang Architecture

## Overview

CodeYang is a multi-layered AI coding agent built on Claude, designed for autonomous software development tasks. The architecture follows a **harness-based design** with clear separation of concerns across 6 layers.

```
┌─────────────────────────────────────────────────────────────┐
│  L1: Gateway (入口层)                                        │
│  ├─ Authentication, Rate Limiting, Request Validation       │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│  L2: Agent Core (核心编排层)                                 │
│  ├─ Agent.ts           Main orchestrator                    │
│  ├─ LLMClient.ts       Claude API integration               │
│  ├─ ConversationManager Message history & context           │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│  L3: Planning & Reasoning (规划层)                           │
│  ├─ Planner            Multi-step task decomposition        │
│  ├─ TreeOfThoughts     Parallel solution exploration        │
│  ├─ Reflexion          Self-critique & learning             │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│  L4: Tool Execution (工具层)                                 │
│  ├─ 64+ Tools          File, Git, Bash, Network, etc.       │
│  ├─ Tool Registry      Dynamic tool discovery               │
│  ├─ MCP Client         Model Context Protocol integration   │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│  L5: Observability (可观测层)                                │
│  ├─ Tracer             Distributed tracing (spans)          │
│  ├─ Audit Logs         Security & compliance logging        │
│  ├─ Metrics            Tool usage, latency, errors          │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│  L6: Resilience (约束与恢复层)                               │
│  ├─ CircuitBreaker     Fault isolation & recovery           │
│  ├─ Sandbox            Process isolation for untrusted code │
│  ├─ Permission System  User consent & safety checks         │
└─────────────────────────────────────────────────────────────┘
```

---

## Core Components

### 1. Agent (L2)

**Location:** `src/agent/Agent.ts`

The main orchestrator. Responsibilities:
- Execute conversation turns (user input → LLM → tool calls → response)
- Manage tool execution lifecycle
- Handle errors and retries
- Coordinate with Planner/Reflexion when needed

**Key Methods:**
- `chat(message)` — Main entry point for user messages
- `executeToolBatch(tools)` — Execute multiple tool calls in parallel
- `handleToolError(error)` — Retry logic + circuit breaker integration

**Flow:**
```
User Message → Agent.chat()
    ↓
LLM generates tool calls
    ↓
Agent.executeToolBatch()
    ↓
Tool results fed back to LLM
    ↓
Final response to user
```

### 2. LLMClient (L2)

**Location:** `src/agent/LLMClient.ts`

Abstracts Claude API communication. Features:
- Streaming responses
- Token counting & budget tracking
- Prompt caching (5min TTL)
- Error handling (rate limits, timeouts)

**Usage:**
```typescript
const stream = await llmClient.chat({
  messages: [...],
  tools: [...],
  systemPrompt: '...'
});

for await (const chunk of stream) {
  // Handle streaming response
}
```

### 3. Tool System (L4)

**Location:** `src/tools/`

64+ tools organized by category:
- **Core:** Read, Write, Edit, Grep, Glob
- **Shell:** Bash, PowerShell
- **Git:** Status, Commit, Branch, Diff, Log
- **Network:** WebFetch, WebSearch, NetworkRequest
- **Code:** CodeAnalysis, Refactor, LSP
- **Data:** CSV/JSON parsing, Data transforms
- **Qt:** Qt-specific tools (build, QML, signals, etc.)
- **Agent:** Sub-agent spawning, task delegation

**Tool Registry:**
```typescript
// Registration
registerTool('MyTool', definition, async (args) => {
  return executeMyTool(args.param);
});

// Discovery
const tools = getToolsByCategory('git');
const tool = findTool('Read');
```

**Permission Flow:**
```
Tool invoked
    ↓
Check permission cache (5s TTL)
    ↓
If not cached, call checkPermission()
    ↓
Level: 'allow' | 'ask' | 'deny'
    ↓
Execute or reject
```

### 4. Planner (L3)

**Location:** `src/planner/`

Decomposes complex tasks into steps. Features:
- Step dependency resolution
- Parallel execution when possible
- Progress tracking
- Circular dependency detection (Kahn's algorithm)

**Usage:**
```typescript
const plan = await planner.createPlan('Build a REST API');
// Plan has steps with dependencies
for (const step of plan.steps) {
  await planExecutor.executeStep(step);
}
```

### 5. Reflexion (L3)

**Location:** `src/reflexion/`

Self-critique loop for quality improvement:
1. Agent generates output
2. CritiqueEngine reviews it (bugs, style, security)
3. Agent fixes issues
4. Repeat until quality threshold met

**Components:**
- `CritiqueEngine.ts` — LLM-based code review
- `ExecutionTracker.ts` — Tool failure tracking
- `LearningStore.ts` — Persist lessons learned

### 6. Gateway (L1)

**Location:** `src/gateway/index.ts`

Entry point for all requests. Middleware chain:
1. **Authentication** — API key validation
2. **Rate Limiting** — Token bucket (burst: 30, refill: 10/sec)
3. **Validation** — Schema checks
4. **Audit** — Log all requests
5. **Handler** — Route to Agent

**Onion Model:**
```
Request → Auth → RateLimit → Validate → Audit → Agent → Response
```

### 7. Circuit Breaker (L6)

**Location:** `src/circuit-breaker/index.ts`

Fault isolation using state machine:
```
CLOSED (normal)
    ↓ (5 consecutive failures)
OPEN (reject all)
    ↓ (wait 30s)
HALF_OPEN (test 1 request)
    ↓ (success → CLOSED, failure → OPEN)
```

**Usage:**
```typescript
const cb = new CircuitBreaker('llm-api', {
  failureThreshold: 5,
  resetTimeoutMs: 30_000,
});

const result = await cb.call(async () => {
  return riskyOperation();
}, degradeStrategy);
```

### 8. Sandbox (L6)

**Location:** `src/sandbox/index.ts`

Isolates untrusted code execution:
- Process isolation (`child_process.fork`)
- Resource limits (CPU, memory, timeout)
- File system restrictions
- Network isolation (optional)

**Usage:**
```typescript
const sandbox = new Sandbox({
  timeoutMs: 30_000,
  memoryMb: 512,
});

const result = await sandbox.run('node', ['script.js'], {
  cwd: '/tmp/workspace',
});
```

### 9. Tracer (L5)

**Location:** `src/tracing/index.ts`

Distributed tracing for debugging:
- Span creation (operation + duration)
- Parent-child relationships
- Export to OpenTelemetry

**Usage:**
```typescript
const span = tracer.startSpan('tool-execution', {
  toolName: 'Bash',
  command: 'ls -la',
});

try {
  // Execute
  span.end({ status: 'success' });
} catch (err) {
  span.end({ status: 'error', error: err });
}
```

---

## Data Flow

### Typical Conversation Turn

```
1. User sends message
   ↓
2. Gateway validates & rate limits
   ↓
3. Agent receives message, updates conversation
   ↓
4. Agent calls LLM with system prompt + tools
   ↓
5. LLM returns tool calls (e.g., Read, Bash, Edit)
   ↓
6. Agent executes tools in parallel (with circuit breakers)
   ↓
7. Tool results fed back to LLM
   ↓
8. LLM generates final response
   ↓
9. Agent returns to user
```

### Planning Mode

```
1. User requests complex task
   ↓
2. Agent detects complexity, enters plan mode
   ↓
3. Planner creates multi-step plan
   ↓
4. User approves plan
   ↓
5. PlanExecutor runs steps sequentially/parallel
   ↓
6. Each step = mini conversation turn
   ↓
7. Progress updates streamed to user
```

### Reflexion Loop

```
1. Agent completes task
   ↓
2. CritiqueEngine reviews output
   ↓
3. If issues found:
     ↓
   Agent fixes issues
     ↓
   Re-submit for critique
   ↓
4. Repeat until quality score > 80
```

---

## Extension Points

### Adding a New Tool

See [CONTRIBUTING.md](../CONTRIBUTING.md) for step-by-step guide.

### Adding a New Agent Pattern

1. Create in `src/<pattern-name>/`
2. Implement interface compatible with Agent
3. Register in Agent.ts as optional mode
4. Add tests

**Example patterns:**
- Tree-of-Thoughts (parallel exploration)
- ReAct (reasoning + acting)
- Chain-of-Thought (step-by-step reasoning)

### Adding MCP Server

```typescript
const mcpManager = new McpManager();
await mcpManager.connectServer({
  name: 'my-server',
  command: 'node',
  args: ['server.js'],
});

// Tools auto-discovered and registered
```

---

## Performance Considerations

### Caching

**LLM Prompt Cache:**
- System prompts cached for 5 minutes
- Saves ~90% of input tokens on repeated requests

**Permission Cache:**
- Tool permissions cached for 5 seconds
- Avoids redundant async checks

**Future: Tool Result Cache**
- LRU cache for idempotent tool results
- E.g., `Read('file.txt')` cached for 10s

### Parallelism

**Tool Execution:**
- Independent tools execute concurrently
- Uses `Promise.all()` for batching

**Plan Execution:**
- Steps with no dependencies run in parallel
- PlanValidator ensures safe parallelization

### Streaming

**LLM Responses:**
- Streamed chunk-by-chunk to user
- Reduces perceived latency

**File Operations:**
- Large files (>10MB) should use streaming
- TODO: Implement in ReadTool

---

## Security

### Input Validation

**Tool Arguments:**
- JSON schema validation
- Type checking
- Sanitization (e.g., path traversal checks)

**Shell Commands:**
- Deny list for dangerous commands (rm -rf, sudo, etc.)
- Permission system for user confirmation
- Sandbox for high-risk operations

### SSRF Protection

**NetworkTool:**
- Blocks private IPs (10.x, 192.168.x, 127.x)
- DNS rebinding prevention
- URL scheme whitelist (http/https only)

### Authentication

**Gateway:**
- API key validation
- Rate limiting per key
- Audit logging

---

## Configuration

### Environment Variables

```bash
# LLM
ANTHROPIC_API_KEY=sk-...
CODEYANG_MODEL=claude-opus-4    # Default model

# Security
CODEYANG_DENY_COMMANDS=rm,sudo  # Additional denied commands
CODEYANG_SANDBOX_ENABLED=true   # Enable sandbox

# Observability
CODEYANG_TRACE_ENABLED=true     # Enable tracing
CODEYANG_LOG_LEVEL=info         # debug|info|warn|error

# Rate Limiting
CODEYANG_RATE_LIMIT_RPM=100     # Requests per minute
```

### Agent Config

**Location:** `src/agent/config.ts`

```typescript
export const config = {
  maxTokens: 8192,
  temperature: 0.7,
  maxRetries: 3,
  timeoutMs: 120_000,
};
```

---

## Testing Strategy

### Unit Tests
- Each tool has dedicated test file
- Mock external dependencies (fs, exec, network)
- Use vitest fixtures for temp directories

### Integration Tests
- `Agent-integration.test.ts` — End-to-end flows
- Real Git operations in isolated test repos
- Network tests use test servers

### CI Tests
- Matrix: Node 18/20/22 × Ubuntu/Windows/macOS
- Coverage threshold: 80% overall
- Critical paths (auth, security): 100%

---

## Deployment

### NPM Package

```bash
npm install -g codeyang
codeyang --version
```

### Docker (Future)

```dockerfile
FROM node:20-alpine
COPY . /app
RUN npm ci && npm run build
CMD ["node", "dist/index.js"]
```

### VSCode Extension

Located in `vscode-extension/` (separate build pipeline).

---

## Roadmap

### Short-term (Q2 2026)
- [ ] Tool result caching (LRU)
- [ ] Streaming file reads (>10MB)
- [ ] Docker support
- [ ] GraphQL API (alternative to CLI)

### Medium-term (Q3 2026)
- [ ] Web UI dashboard
- [ ] Plugin marketplace
- [ ] Multi-agent collaboration
- [ ] Fine-tuned tool selection model

### Long-term (Q4 2026+)
- [ ] Self-hosted deployment
- [ ] Enterprise SSO integration
- [ ] Workflow automation engine
- [ ] Code generation from screenshots

---

## FAQ

**Q: How does CodeYang differ from other AI agents?**
A: Harness-based architecture with circuit breakers, sandbox isolation, and comprehensive observability. Built for production, not demos.

**Q: Can I use models other than Claude?**
A: LLMClient abstraction allows swapping. Implementations for OpenAI/Azure in progress.

**Q: How do I debug tool failures?**
A: Enable tracing (`CODEYANG_TRACE_ENABLED=true`) and check audit logs in `.codeyang/audit.jsonl`.

**Q: Is CodeYang safe for production code?**
A: Yes — permission system, sandbox, and deny lists provide multiple safety layers. But always review generated code.

---

## Resources

- [Contributing Guide](../CONTRIBUTING.md)
- [CI/CD Documentation](../.github/CI-CD.md)
- [Tool Development Guide](./tool-development.md) (TODO)
- [API Reference](./api-reference.md) (TODO)

---

**Last Updated:** 2026-06-25
