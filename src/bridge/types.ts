/**
 * Bridge Types — shared types for CodeYang ↔ Claude Code communication.
 */

export type AgentId = 'codeyang' | 'claude-code';

export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

export type TaskPriority = 'low' | 'medium' | 'high' | 'critical';

export interface BridgeTask {
  id: string;
  /** Who sent this task */
  from: AgentId;
  /** Who should execute this task */
  to: AgentId;
  title: string;
  description: string;
  priority: TaskPriority;
  status: TaskStatus;
  /** Optional: files this task is related to */
  files?: string[];
  /** Output / result from the executing agent */
  result?: string;
  /** Error message if failed */
  error?: string;
  createdAt: string;
  updatedAt: string;
  /** Parent task ID for subtask tracking */
  parentId?: string;
  /** Tags for categorization */
  tags?: string[];
}

export interface BridgeMessage {
  id: string;
  from: AgentId;
  to: AgentId;
  type: 'text' | 'task_assignment' | 'task_result' | 'question' | 'answer' | 'status' | 'file_change';
  content: string;
  /** If this is a response to a specific message */
  inReplyTo?: string;
  /** For task-related messages */
  taskId?: string;
  /** For file change notifications */
  filePath?: string;
  timestamp: string;
}

export interface BridgeConfig {
  port: number;
  host: string;
  /** Directory for shared file context */
  sharedDir: string;
  /** Auto-start Claude Code when tasks are queued for it */
  autoStartClaude: boolean;
  /** Claude Code CLI command (e.g., 'claude', 'npx claude') */
  claudeCommand: string;
}

export const DEFAULT_BRIDGE_CONFIG: BridgeConfig = {
  port: 9876,
  host: '127.0.0.1',
  sharedDir: '',
  autoStartClaude: false,
  claudeCommand: 'claude',
};

/** WebSocket event types */
export type WsEventType =
  | 'new_task'
  | 'task_update'
  | 'new_message'
  | 'agent_connected'
  | 'agent_disconnected'
  | 'ping'
  | 'pong';

export interface WsEvent {
  type: WsEventType;
  payload: unknown;
  timestamp: string;
}
