/**
 * Shared types and interfaces for Agent core modules
 */
import type { AgentContextManager } from '../AgentContextManager.js';
import type { AgentToolExecutor } from '../AgentToolExecutor.js';
import type { StateManager } from '../managers/StateManager.js';
import type { ConversationManager } from '../managers/ConversationManager.js';
import type { VerificationPipeline } from '../../closed-loop/VerificationPipeline.js';
import type { FeedbackInjector } from '../../closed-loop/FeedbackInjector.js';
import type { WatcherSystem } from '../../closed-loop/WatcherSystem.js';
import type { ReflexionEngine } from '../../experimental/reflexion/ReflexionEngine.js';
import type { CritiqueEngine } from '../../experimental/reflexion/CritiqueEngine.js';
import type { Planner } from '../../planner/Planner.js';
import type { TreeOfThoughts } from '../../tot/TreeOfThoughts.js';
import type { A2AProtocol } from '../../a2a/A2AProtocol.js';
import type { Tracer } from '../../tracing/index.js';
import type { CircuitBreakerManager } from '../../circuit-breaker/index.js';
import type { Gateway } from '../../gateway/index.js';
import type { LLMClient } from '../LLMClient.js';

// Stream timeout: configurable via env var, default 5 minutes
export const STREAM_TIMEOUT_MS = parseInt(process.env.CODEYANG_STREAM_TIMEOUT || '300000', 10);
export const SIMILARITY_PREFIX_LEN = 100;

export type AssistantContentBlock =
  { type: 'text'; text: string } | { type: 'tool_use'; id: string; name: string; input: unknown };

export type ToolResultBlock = {
  type: 'tool_result';
  tool_use_id: string;
  content: string;
  is_error: boolean;
};

export interface AgentCallbacks {
  onUserMessage?: (text: string) => void;
  onAgentText?: (text: string) => void;
  onAgentDelta?: (text: string) => void;
  /** Reasoning-model chain-of-thought. Displayed separately from the answer. */
  onThinkingDelta?: (text: string) => void;
  onToolBatch?: (total: number) => void;
  onToolStart?: (name: string, args: Record<string, unknown>) => void;
  onToolResult?: (name: string, output: string, isError: boolean) => void;
  onQuestion?: (question: string, options?: Array<{ label: string; description: string }>) => void;
  onError?: (err: string) => void;
}

/**
 * Agent internal state - shared across core modules
 */
export interface AgentState {
  // Core
  client: LLMClient;
  cbs: AgentCallbacks;
  maxRetries: number;
  abortController: AbortController | null;

  // Managers
  ctxManager: AgentContextManager;
  toolExecutor: AgentToolExecutor;
  stateManager: StateManager;
  conversationManager: ConversationManager;

  // Closed-loop
  verificationPipeline: VerificationPipeline | null;
  feedbackInjector: FeedbackInjector;
  watcher: WatcherSystem | null;

  // Reflexion & Critique
  reflexionEngine: ReflexionEngine;
  critiqueEngine: CritiqueEngine;

  // Planner & Tree-of-Thoughts
  planner: Planner;
  treeOfThoughts: TreeOfThoughts;

  // A2A
  a2aProtocol: A2AProtocol;

  // Continual Learning
  consolidationCounter: number;

  // Harness
  tracer: Tracer;
  currentTraceId: string;
  circuitBreakerManager: CircuitBreakerManager;
  gateway: Gateway;
}
