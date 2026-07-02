/**
 * Bridge Client - Connect VS Code extension to CodeYang Agent
 *
 * Enables VS Code extension to use full Agent capabilities:
 * - 64+ tools
 * - RL weights optimization
 * - Semantic understanding
 * - Reflexion self-improvement
 * - Project memory
 */

import axios, { AxiosInstance } from 'axios';
import * as vscode from 'vscode';

export interface BridgeConfig {
  url: string;
  timeout?: number;
  apiKey?: string;
}

export interface CompletionRequest {
  code: string;
  language: string;
  filePath?: string;
  cursorPosition?: { line: number; character: number };
  context?: string;
  useTools?: boolean;
  useRL?: boolean;
}

export interface CompletionResponse {
  completion: string;
  confidence: number;
  model: string;
  toolsUsed?: string[];
}

export interface RefactorRequest {
  code: string;
  action: string;
  filePath?: string;
}

export interface RefactorResponse {
  refactoredCode: string;
  explanation: string;
  filesChanged?: string[];
}

export interface TestGenerationRequest {
  filePath: string;
  code?: string;
}

export interface TestGenerationResponse {
  testCode: string;
  testFilePath: string;
  passed: boolean;
}

export class BridgeClient {
  private client: AxiosInstance;
  private connected: boolean = false;
  private wsConnection: any = null; // Use any for WebSocket compatibility

  constructor(private config: BridgeConfig) {
    this.client = axios.create({
      baseURL: config.url,
      timeout: config.timeout || 30000,
      headers: {
        'Content-Type': 'application/json',
        ...(config.apiKey && { Authorization: `Bearer ${config.apiKey}` }),
      },
    });
  }

  /**
   * Check if Bridge Server is available
   */
  async checkConnection(): Promise<boolean> {
    try {
      const response = await this.client.get('/health');
      this.connected = response.status === 200;
      return this.connected;
    } catch (error) {
      this.connected = false;
      return false;
    }
  }

  /**
   * Connect WebSocket for real-time updates
   */
  async connectWebSocket(): Promise<void> {
    return new Promise((resolve, reject) => {
      const wsUrl = this.config.url.replace('http', 'ws') + '/ws';

      try {
        // Note: WebSocket not available in Node.js context
        // This would work in browser-based VS Code web extensions
        console.log('[BridgeClient] WebSocket not supported in Node.js extension context');
        resolve();
        return;

        /* Browser-based WebSocket code (commented out for Node.js)
        this.wsConnection = new WebSocket(wsUrl);

        this.wsConnection.onopen = () => {
          console.log('[BridgeClient] WebSocket connected');
          resolve();
        };

        this.wsConnection.onerror = (error: any) => {
          console.error('[BridgeClient] WebSocket error:', error);
          reject(error);
        };

        this.wsConnection.onmessage = (event: any) => {
          this.handleWebSocketMessage(event.data);
        };

        this.wsConnection.onclose = () => {
          console.log('[BridgeClient] WebSocket disconnected');
          this.wsConnection = null;
        };
        */
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Handle WebSocket messages
   */
  private handleWebSocketMessage(data: string): void {
    try {
      const message = JSON.parse(data);

      switch (message.type) {
        case 'agent_progress':
          // Show progress in VS Code
          vscode.window.setStatusBarMessage(`🤖 CodeYang: ${message.message}`, 2000);
          break;

        case 'tool_execution':
          console.log(`[Agent] Tool executed: ${message.tool}`);
          break;

        case 'error':
          vscode.window.showErrorMessage(`CodeYang Agent: ${message.error}`);
          break;
      }
    } catch (error) {
      console.error('[BridgeClient] Failed to parse WebSocket message:', error);
    }
  }

  /**
   * Get intelligent code completion using full Agent
   */
  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    try {
      const response = await this.client.post<CompletionResponse>('/api/complete', request);

      return response.data;
    } catch (error) {
      throw new Error(`Bridge completion failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Refactor code using Agent + tools
   */
  async refactor(request: RefactorRequest): Promise<RefactorResponse> {
    try {
      const response = await this.client.post<RefactorResponse>('/api/refactor', request);

      return response.data;
    } catch (error) {
      throw new Error(`Bridge refactor failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Generate tests using Agent
   */
  async generateTests(request: TestGenerationRequest): Promise<TestGenerationResponse> {
    try {
      const response = await this.client.post<TestGenerationResponse>(
        '/api/generate-tests',
        request,
        { timeout: 60000 }, // Tests may take longer
      );

      return response.data;
    } catch (error) {
      throw new Error(`Bridge test generation failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Execute arbitrary Agent task
   */
  async executeTask(task: {
    type: string;
    description: string;
    context?: Record<string, unknown>;
  }): Promise<{ result: string; success: boolean }> {
    try {
      const response = await this.client.post('/api/task', task, {
        timeout: 120000, // Complex tasks may take time
      });

      return response.data;
    } catch (error) {
      throw new Error(`Bridge task execution failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get Agent statistics
   */
  async getStats(): Promise<{
    toolsUsed: Record<string, number>;
    rlWeights: Array<{ name: string; weight: number }>;
    memorySize: number;
  }> {
    try {
      const response = await this.client.get('/api/stats');
      return response.data;
    } catch (error) {
      throw new Error(`Failed to get stats: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Disconnect
   */
  disconnect(): void {
    if (this.wsConnection) {
      this.wsConnection.close();
      this.wsConnection = null;
    }
    this.connected = false;
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.connected;
  }
}
