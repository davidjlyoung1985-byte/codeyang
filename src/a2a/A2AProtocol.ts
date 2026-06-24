/**
 * A2A (Agent-to-Agent) — direct inter-agent communication channel.
 *
 * Inspired by Google's Agent-to-Agent protocol, this enables agents to
 * communicate directly instead of through indirect Task tool calls.
 *
 * Key concepts:
 * - **AgentCard**: Each agent advertises its capabilities (tools, skills, context)
 * - **Message**: Structured message with content, context, and references
 * - **Channel**: A communication channel between agents (in-process, not HTTP)
 * - **Stream**: Real-time streaming of partial results between agents
 *
 * This builds on the existing TaskTool sub-agent system but adds:
 * 1. Rich capability negotiation (agents can ask "who can do X?")
 * 2. Structured message format (not just text strings)
 * 3. Context sharing (shared memory, file handles, references)
 * 4. Result streaming (partial results before completion)
 */

import type { LLMClient, LLMMessage } from '../agent/LLMClient.js';
import { consumeStream } from '../agent/LLMClient.js';

// ── Core Types ────────────────────────────────────────────────────────

export type AgentCapability =
  | 'file_ops' // Read, Write, Edit
  | 'shell_exec' // Bash
  | 'code_search' // Grep, Glob, Search
  | 'code_analysis' // AST, Refactor, LSP
  | 'network' // WebFetch, HTTP
  | 'git_ops' // Git commands
  | 'task_management' // TaskCreate, TaskList, etc.
  | 'memory' // Remember, Recall
  | 'data_processing' // CSV, JSON, XML parsing
  | 'image_processing' // ImageInfo, ImageToBase64
  | 'math' // MathSolve, MathPlot
  | 'planning' // Planner, TodoWrite
  | 'verification' // Auto-verify, lint, test
  | 'custom'; // User-defined

export interface AgentCard {
  agentId: string;
  name: string;
  version: string;
  capabilities: AgentCapability[];
  tools: string[];
  context: string;
  maxConcurrentTasks: number;
}

export interface A2AMessage {
  id: string;
  type: 'request' | 'response' | 'stream' | 'error' | 'ping' | 'pong';
  sender: string;
  target: string;
  conversationId: string;
  timestamp: number;
  payload: A2APayload;
  metadata?: Record<string, unknown>;
}

export interface A2APayload {
  /** Natural language task description */
  task?: string;
  /** Structured data */
  data?: unknown;
  /** Tool calls to execute */
  toolCalls?: Array<{ name: string; args: Record<string, unknown> }>;
  /** Tool results */
  toolResults?: Array<{ name: string; output: string; isError: boolean }>;
  /** Shared context */
  context?: string;
  /** File references (paths the agent can read/write) */
  fileRefs?: string[];
  /** Memory references (memory IDs) */
  memoryRefs?: string[];
  /** Result content */
  content?: string;
  /** Error information */
  error?: { code: string; message: string; recoverable: boolean };
  /** Status update */
  status?: 'pending' | 'in_progress' | 'completed' | 'failed' | 'cancelled';
}

export interface A2AChannel {
  send(message: A2AMessage): Promise<void>;
  receive(): AsyncIterable<A2AMessage>;
  close(): void;
}

export interface A2AConfig {
  enabled: boolean;
  agentId: string;
  agentName: string;
  maxConcurrentConversations: number;
  messageTimeoutMs: number;
}

const DEFAULT_CONFIG: A2AConfig = {
  enabled: true,
  agentId: `codeyang-${Date.now().toString(36)}`,
  agentName: 'CodeYang',
  maxConcurrentConversations: 3,
  messageTimeoutMs: 120_000,
};

// ── In-Process Channel ────────────────────────────────────────────────

/**
 * In-process implementation of A2A channel.
 * Both agents live in the same Node process. For distributed agents,
 * this would be replaced with WebSocket/HTTP transport.
 */
export class InProcessChannel implements A2AChannel {
  private inbox: A2AMessage[] = [];
  private resolvers: Array<(msg: A2AMessage) => void> = [];
  private _closed = false;

  async send(message: A2AMessage): Promise<void> {
    if (this._closed) throw new Error('Channel closed');
    this.inbox.push(message);

    // Resolve any pending receive
    const resolver = this.resolvers.shift();
    if (resolver) {
      resolver(message);
    }
  }

  async *receive(): AsyncIterable<A2AMessage> {
    while (!this._closed) {
      if (this.inbox.length > 0) {
        yield this.inbox.shift()!;
      } else {
        // Wait for next message
        const msg = await new Promise<A2AMessage>((resolve) => {
          this.resolvers.push(resolve);
        });
        yield msg;
      }
    }
  }

  close(): void {
    this._closed = true;
    // Resolve all pending with close signal
    for (const resolver of this.resolvers) {
      resolver({
        id: '',
        type: 'error',
        sender: '',
        target: '',
        conversationId: '',
        timestamp: Date.now(),
        payload: { error: { code: 'CHANNEL_CLOSED', message: 'Channel closed', recoverable: false } },
      });
    }
    this.resolvers = [];
    this.inbox = [];
  }

  get closed(): boolean {
    return this._closed;
  }
}

// ── Agent Registry ────────────────────────────────────────────────────

/**
 * Registry of available agents and their capabilities.
 */
export class AgentRegistry {
  private agents = new Map<string, AgentCard>();
  private channels = new Map<string, InProcessChannel>();

  register(card: AgentCard): InProcessChannel {
    this.agents.set(card.agentId, card);
    const channel = new InProcessChannel();
    this.channels.set(card.agentId, channel);
    return channel;
  }

  unregister(agentId: string): void {
    this.agents.delete(agentId);
    const channel = this.channels.get(agentId);
    if (channel) {
      channel.close();
      this.channels.delete(agentId);
    }
  }

  getCard(agentId: string): AgentCard | undefined {
    return this.agents.get(agentId);
  }

  getChannel(agentId: string): InProcessChannel | undefined {
    return this.channels.get(agentId);
  }

  /**
   * Find agents matching a capability.
   */
  findAgentsByCapability(capability: AgentCapability): AgentCard[] {
    return [...this.agents.values()].filter((a) => a.capabilities.includes(capability));
  }

  /**
   * Find the best agent for a task based on capability overlap.
   */
  findBestAgent(task: string, requiredCaps: AgentCapability[]): AgentCard | null {
    // Score agents by how many required capabilities they have
    const scored = [...this.agents.values()]
      .map((agent) => {
        const matchCount = requiredCaps.filter((c) => agent.capabilities.includes(c)).length;
        return { agent, score: matchCount / requiredCaps.length };
      })
      .sort((a, b) => b.score - a.score);

    return scored.length > 0 && scored[0].score > 0 ? scored[0].agent : null;
  }

  /**
   * List all registered agents.
   */
  listAgents(): AgentCard[] {
    return [...this.agents.values()];
  }

  /**
   * Get total number of registered agents.
   */
  get count(): number {
    return this.agents.size;
  }
}

// ── A2A Message Builder ──────────────────────────────────────────────

let msgCounter = 0;

export function buildA2AMessage(
  type: A2AMessage['type'],
  sender: string,
  target: string,
  conversationId: string,
  payload: A2APayload,
  metadata?: Record<string, unknown>,
): A2AMessage {
  return {
    id: `a2a-${Date.now().toString(36)}-${(++msgCounter).toString(36)}`,
    type,
    sender,
    target,
    conversationId,
    timestamp: Date.now(),
    payload,
    metadata,
  };
}

// ── A2A Protocol Handler ──────────────────────────────────────────────

/**
 * High-level A2A protocol handler for agent communication.
 */
export class A2AProtocol {
  private config: A2AConfig;
  private registry: AgentRegistry;
  private conversations = new Map<string, A2AMessage[]>();
  private llmClient: LLMClient | null = null;
  private _model = '';
  private _maxTokens = 0;

  constructor(config: Partial<A2AConfig> = {}, registry?: AgentRegistry) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.registry = registry || new AgentRegistry();
  }

  /** Set LLM client (needed for agent-to-agent negotiation). */
  setLLMClient(client: LLMClient, model: string, maxTokens: number): void {
    this.llmClient = client;
    this._model = model;
    this._maxTokens = maxTokens;
  }

  /** Get the registry (for registering this agent). */
  getRegistry(): AgentRegistry {
    return this.registry;
  }

  /** Get own agent card. */
  getMyCard(): AgentCard {
    return {
      agentId: this.config.agentId,
      name: this.config.agentName,
      version: '0.7.0',
      capabilities: [
        'file_ops',
        'shell_exec',
        'code_search',
        'code_analysis',
        'network',
        'git_ops',
        'task_management',
        'memory',
        'data_processing',
        'image_processing',
        'planning',
        'verification',
      ],
      tools: [],
      context: 'AI coding agent with file operations, shell execution, and code analysis',
      maxConcurrentTasks: this.config.maxConcurrentConversations,
    };
  }

  /**
   * Send a task to another agent and wait for response.
   */
  async sendTask(targetAgentId: string, task: string, context?: string, fileRefs?: string[]): Promise<A2AMessage> {
    const channel = this.registry.getChannel(targetAgentId);
    if (!channel) throw new Error(`Agent ${targetAgentId} not found or not connected`);

    const conversationId = `conv-${Date.now().toString(36)}-${(++msgCounter).toString(36)}`;
    const request = buildA2AMessage('request', this.config.agentId, targetAgentId, conversationId, {
      task,
      context,
      fileRefs,
      status: 'pending',
    });

    this.conversations.set(conversationId, [request]);
    await channel.send(request);

    // Wait for response with timeout
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(
        () =>
          reject(new Error(`A2A timeout: ${targetAgentId} did not respond in ${this.config.messageTimeoutMs / 1000}s`)),
        this.config.messageTimeoutMs,
      ),
    );

    const responsePromise = new Promise<A2AMessage>(async (resolve) => {
      for await (const msg of channel.receive()) {
        if (msg.conversationId === conversationId) {
          const conv = this.conversations.get(conversationId);
          if (conv) conv.push(msg);

          if (msg.type === 'response' || msg.type === 'error') {
            resolve(msg);
            return;
          }
        }
      }
    });

    return Promise.race([responsePromise, timeoutPromise]);
  }

  /**
   * Handle incoming requests from other agents.
   * This is called by the agent's main loop when it receives an A2A message.
   */
  async handleIncoming(
    message: A2AMessage,
    executeToolFn: (name: string, args: Record<string, unknown>) => Promise<string>,
  ): Promise<A2AMessage | null> {
    const channel = this.registry.getChannel(this.config.agentId);
    if (!channel) return null;

    switch (message.type) {
      case 'ping':
        return buildA2AMessage('pong', this.config.agentId, message.sender, message.conversationId, {});

      case 'request': {
        // Record conversation
        if (!this.conversations.has(message.conversationId)) {
          this.conversations.set(message.conversationId, []);
        }
        this.conversations.get(message.conversationId)!.push(message);

        // Check if we have the LLM client to process this
        if (!this.llmClient) {
          return buildA2AMessage('error', this.config.agentId, message.sender, message.conversationId, {
            status: 'failed',
            error: { code: 'NO_LLM', message: 'Agent has no LLM configured for task processing', recoverable: false },
          });
        }

        try {
          // Process the task
          const result = await this.processTask(message, executeToolFn);

          const response = buildA2AMessage('response', this.config.agentId, message.sender, message.conversationId, {
            status: result.error ? 'failed' : 'completed',
            content: result.content,
            data: result.data,
            ...(result.error ? { error: result.error } : {}),
          });

          this.conversations.get(message.conversationId)!.push(response);
          return response;
        } catch (err) {
          const errorMsg = buildA2AMessage('error', this.config.agentId, message.sender, message.conversationId, {
            status: 'failed',
            error: {
              code: 'PROCESSING_ERROR',
              message: err instanceof Error ? err.message : String(err),
              recoverable: true,
            },
          });
          return errorMsg;
        }
      }

      case 'stream': {
        // Forward stream data to conversation
        const conv = this.conversations.get(message.conversationId);
        if (conv) conv.push(message);
        return null; // No response needed for stream updates
      }

      default:
        return null;
    }
  }

  /**
   * Get conversation history for debugging.
   */
  getConversation(conversationId: string): A2AMessage[] | undefined {
    return this.conversations.get(conversationId);
  }

  /**
   * Get all active conversations.
   */
  getActiveConversations(): number {
    return this.conversations.size;
  }

  // ── Private: Task Processing ────────────────────────────────

  private async processTask(
    message: A2AMessage,
    executeToolFn: (name: string, args: Record<string, unknown>) => Promise<string>,
  ): Promise<{ content?: string; data?: unknown; error?: { code: string; message: string; recoverable: boolean } }> {
    if (!this.llmClient || !message.payload.task) {
      return { error: { code: 'INVALID_REQUEST', message: 'Missing task or LLM client', recoverable: false } };
    }

    const MAX_TURNS = 10;
    const systemPrompt = `You are a sub-agent helping another agent with a specific task.
Be concise. Use tools only when necessary. Report results clearly.

${message.payload.context ? `## Context from requesting agent\n${message.payload.context}\n` : ''}
${message.payload.fileRefs ? `## Available files\n${message.payload.fileRefs.join('\n')}\n` : ''}`;

    const messages: LLMMessage[] = [{ role: 'user', content: message.payload.task }];

    let finalContent = '';

    for (let turn = 0; turn < MAX_TURNS; turn++) {
      const streamResult = await consumeStream(this.llmClient, {
        model: this._model,
        maxTokens: Math.min(this._maxTokens, 4000),
        temperature: 0.3,
        system: systemPrompt,
        messages,
        tools: [],
      });

      const { text: assistantText, toolCalls } = streamResult;

      if (assistantText) {
        finalContent += assistantText + '\n';
      }

      // Check if the agent responded directly (no tool calls)
      if (!toolCalls || toolCalls.length === 0) {
        messages.push({ role: 'assistant', content: assistantText || '' });
        break;
      }

      // Build assistant message with tool calls
      const assistantContent: Array<{ type: string; text?: string; id?: string; name?: string; input?: unknown }> = [];
      if (assistantText) assistantContent.push({ type: 'text', text: assistantText });
      for (const tc of toolCalls) {
        assistantContent.push({ type: 'tool_use', id: tc.id, name: tc.name, input: tc.input });
        finalContent += `\n[Using ${tc.name}...]`;
      }
      messages.push({ role: 'assistant', content: assistantContent as LLMMessage['content'] });

      // Execute tools
      const toolResultBlocks: Array<{ type: string; tool_use_id: string; content: string; is_error: boolean }> = [];
      for (const tc of toolCalls) {
        try {
          const output = await executeToolFn(tc.name, tc.input);
          toolResultBlocks.push({
            type: 'tool_result',
            tool_use_id: tc.id,
            content: output.slice(0, 5000),
            is_error: false,
          });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          toolResultBlocks.push({ type: 'tool_result', tool_use_id: tc.id, content: msg, is_error: true });
        }
      }
      messages.push({ role: 'user', content: toolResultBlocks as unknown as LLMMessage['content'] });
    }

    return { content: finalContent || 'Task completed (no output).' };
  }
}

// ── Global singleton ──────────────────────────────────────────────────

/** Global agent registry shared across the process. */
export const globalAgentRegistry = new AgentRegistry();

/** Create a default A2A protocol instance. */
export function createA2AProtocol(config?: Partial<A2AConfig>): A2AProtocol {
  return new A2AProtocol(config, globalAgentRegistry);
}
