// Database type definitions

export interface SessionRow {
  id: string;
  user_id: string;
  created_at: number;
  updated_at: number;
  status: string;
  metadata: string;
}

export interface MessageRow {
  id: string;
  session_id: string;
  role: string;
  content: string;
  timestamp: number;
  tokens?: number;
  metadata?: string;
}

export interface ToolExecutionRow {
  id: string;
  session_id: string;
  tool_name: string;
  input: string;
  output: string;
  timestamp: number;
  duration_ms: number;
  status: string;
  error?: string;
}

export interface SearchResultRow {
  id: string;
  session_id: string;
  message_id: string;
  role: string;
  content: string;
  timestamp: number;
  rank: number;
}
