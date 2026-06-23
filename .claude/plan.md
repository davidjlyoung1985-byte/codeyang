# Implementation Plan: Reflexion & Plan-and-Solve Patterns

## Overview
Add two advanced AI agent patterns to CodeYang:
1. **Reflexion**: Self-reflection and learning from execution outcomes
2. **Plan-and-Solve**: Structured planning before execution with dynamic adjustment

## Architecture Analysis

### Existing Foundation
- **Closed-loop system** (`src/closed-loop/`): Already has VerificationPipeline and FeedbackInjector
- **Memory system** (`src/utils/memoryStore.ts`): Persistent key-value storage with search
- **Task system** (`src/tools/TaskTool.ts`): Sub-agent delegation with isolated execution
- **Agent core** (`src/agent/Agent.ts`): Message history, callbacks, checkpoints

### Integration Points
1. **Reflexion** → Extend FeedbackInjector + Memory system
2. **Plan-and-Solve** → New planning module + TodoWrite integration

## Design

### 1. Reflexion Module (`src/reflexion/`)

**Core Components:**

```
src/reflexion/
├── ReflexionEngine.ts      # Main reflection engine
├── ExecutionTracker.ts     # Track tool calls and outcomes
├── LearningStore.ts        # Persist learned patterns
├── ReflectionPrompt.ts     # Generate reflection prompts
└── index.ts
```

**Data Flow:**
```
Tool Execution → ExecutionTracker.record()
                 ↓
After N failures → ReflexionEngine.reflect()
                 ↓
Generate reflection → LLM analyzes what went wrong
                 ↓
Extract patterns → LearningStore.save()
                 ↓
Next execution → Inject learned patterns into system prompt
```

**Key Features:**
- Track execution outcomes (success/failure/error)
- Trigger reflection after repeated failures (threshold: 2-3 failures)
- Store reflections in memory system with type='reflection'
- Auto-inject relevant reflections into context based on current task
- Support manual reflection via `/reflect` command

**Storage Schema:**
```typescript
interface ExecutionRecord {
  id: string;
  timestamp: number;
  task: string;              // User request
  toolCalls: ToolCall[];     // What was executed
  results: ToolResult[];     // Outcomes
  success: boolean;
  errorMessage?: string;
}

interface Reflection {
  id: string;
  timestamp: number;
  trigger: string;           // What caused reflection
  executionIds: string[];    // Related executions
  analysis: string;          // LLM's reflection
  patterns: string[];        // Extracted patterns
  recommendations: string[]; // What to do differently
}
```

### 2. Plan-and-Solve Module (`src/planner/`)

**Core Components:**

```
src/planner/
├── Planner.ts              # Main planning engine
├── PlanExecutor.ts         # Execute plans with monitoring
├── PlanStore.ts            # Persist plans
├── PlanValidator.ts        # Validate plan feasibility
└── index.ts
```

**Data Flow:**
```
Complex task detected → Planner.shouldPlan()
                        ↓
                   Generate plan → LLM creates structured plan
                        ↓
                   Validate plan → Check tool availability, feasibility
                        ↓
                   User approval → Present plan, wait for confirmation
                        ↓
                  Execute steps → PlanExecutor.run() with checkpoints
                        ↓
               Monitor progress → Track completion, detect failures
                        ↓
            Adjust dynamically → Re-plan if step fails
```

**Key Features:**
- Auto-detect complex tasks (multi-step, ambiguous, high-risk)
- Generate structured plans with dependencies
- Validate plans before execution
- Checkpoint system for rollback
- Dynamic re-planning on failure
- Progress tracking via TodoWrite
- Support manual planning via `/plan` command

**Plan Schema:**
```typescript
interface Plan {
  id: string;
  task: string;              // Original task
  createdAt: number;
  steps: PlanStep[];
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  currentStep: number;
}

interface PlanStep {
  id: string;
  description: string;
  tools: string[];           // Tools needed
  dependencies: string[];    // Step IDs that must complete first
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'skipped';
  result?: string;
  retries: number;
  maxRetries: number;
}
```

## Implementation Steps

### Phase 1: Reflexion Foundation
1. ✓ Create `src/reflexion/` directory structure
2. ✓ Implement ExecutionTracker with circular buffer (limit: 100 records)
3. ✓ Implement LearningStore (extend memoryStore with 'reflection' type)
4. ✓ Build ReflexionEngine with LLM-based reflection
5. ✓ Add reflection trigger logic in Agent.ts (after tool execution)
6. ✓ Inject learned patterns into system prompt
7. ✓ Add `/reflect` command to CLI

### Phase 2: Plan-and-Solve Foundation
1. ✓ Create `src/planner/` directory structure
2. ✓ Implement Planner with task complexity detection
3. ✓ Build plan generation using LLM (structured output)
4. ✓ Implement PlanValidator (check tool availability)
5. ✓ Build PlanExecutor with checkpoint system
6. ✓ Add plan monitoring and dynamic adjustment
7. ✓ Integrate with TodoWrite for progress display
8. ✓ Add `/plan` command to CLI

### Phase 3: Integration
1. ✓ Wire Reflexion into Agent.runTurn()
2. ✓ Wire Plan-and-Solve into Agent.chat()
3. ✓ Add configuration flags (enable/disable features)
4. ✓ Update system prompt with new capabilities
5. ✓ Add tests for both modules

### Phase 4: Polish
1. ✓ Add metrics (reflection count, plan success rate)
2. ✓ Optimize LLM calls (cache, batch)
3. ✓ Add user controls (thresholds, auto-mode)
4. ✓ Update documentation
5. ✓ Add examples to README

## Configuration

Add to `config.ts`:
```typescript
reflexion: {
  enabled: boolean;              // default: true
  failureThreshold: number;      // default: 2
  maxReflections: number;        // default: 50
  autoInject: boolean;           // default: true
}

planner: {
  enabled: boolean;              // default: true
  autoDetect: boolean;           // default: true
  complexityThreshold: number;   // default: 3 (steps)
  requireApproval: boolean;      // default: true
  maxRetries: number;            // default: 2
}
```

## Testing Strategy

1. **Unit tests**: Each module independently
2. **Integration tests**: End-to-end with mock LLM
3. **Scenario tests**: Real-world complex tasks
4. **Performance tests**: Memory usage, latency

## Success Metrics

- Reflexion reduces repeated failures by 40%+
- Plan-and-Solve improves multi-step task success by 30%+
- User satisfaction improves (measure via feedback)
- No performance regression (< 100ms overhead per turn)

## Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| Too many LLM calls | Cache reflections, batch plan generation |
| Memory bloat | Circular buffers, LRU cache, TTL |
| User friction | Make optional, good defaults, clear feedback |
| Plan rigidity | Dynamic re-planning on failure |
| False reflections | Validate patterns before storing |

## Timeline

- Phase 1: 2 days
- Phase 2: 2 days  
- Phase 3: 1 day
- Phase 4: 1 day
- **Total: ~6 days**
