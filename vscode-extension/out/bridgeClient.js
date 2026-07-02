"use strict";
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
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BridgeClient = void 0;
const axios_1 = __importDefault(require("axios"));
const vscode = __importStar(require("vscode"));
class BridgeClient {
    constructor(config) {
        this.config = config;
        this.connected = false;
        this.wsConnection = null; // Use any for WebSocket compatibility
        this.client = axios_1.default.create({
            baseURL: config.url,
            timeout: config.timeout || 30000,
            headers: {
                'Content-Type': 'application/json',
                ...(config.apiKey && { 'Authorization': `Bearer ${config.apiKey}` }),
            },
        });
    }
    /**
     * Check if Bridge Server is available
     */
    async checkConnection() {
        try {
            const response = await this.client.get('/health');
            this.connected = response.status === 200;
            return this.connected;
        }
        catch (error) {
            this.connected = false;
            return false;
        }
    }
    /**
     * Connect WebSocket for real-time updates
     */
    async connectWebSocket() {
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
            }
            catch (error) {
                reject(error);
            }
        });
    }
    /**
     * Handle WebSocket messages
     */
    handleWebSocketMessage(data) {
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
        }
        catch (error) {
            console.error('[BridgeClient] Failed to parse WebSocket message:', error);
        }
    }
    /**
     * Get intelligent code completion using full Agent
     */
    async complete(request) {
        try {
            const response = await this.client.post('/api/complete', request);
            return response.data;
        }
        catch (error) {
            throw new Error(`Bridge completion failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    /**
     * Refactor code using Agent + tools
     */
    async refactor(request) {
        try {
            const response = await this.client.post('/api/refactor', request);
            return response.data;
        }
        catch (error) {
            throw new Error(`Bridge refactor failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    /**
     * Generate tests using Agent
     */
    async generateTests(request) {
        try {
            const response = await this.client.post('/api/generate-tests', request, { timeout: 60000 } // Tests may take longer
            );
            return response.data;
        }
        catch (error) {
            throw new Error(`Bridge test generation failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    /**
     * Execute arbitrary Agent task
     */
    async executeTask(task) {
        try {
            const response = await this.client.post('/api/task', task, {
                timeout: 120000, // Complex tasks may take time
            });
            return response.data;
        }
        catch (error) {
            throw new Error(`Bridge task execution failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    /**
     * Get Agent statistics
     */
    async getStats() {
        try {
            const response = await this.client.get('/api/stats');
            return response.data;
        }
        catch (error) {
            throw new Error(`Failed to get stats: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    /**
     * Disconnect
     */
    disconnect() {
        if (this.wsConnection) {
            this.wsConnection.close();
            this.wsConnection = null;
        }
        this.connected = false;
    }
    /**
     * Check if connected
     */
    isConnected() {
        return this.connected;
    }
}
exports.BridgeClient = BridgeClient;
//# sourceMappingURL=bridgeClient.js.map