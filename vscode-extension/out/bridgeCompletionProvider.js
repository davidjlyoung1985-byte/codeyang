"use strict";
/**
 * Bridge Completion Provider
 *
 * Uses CodeYang Agent through Bridge for intelligent completion
 * with full tool access, RL optimization, and semantic understanding
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.BridgeCompletionProvider = void 0;
const vscode = __importStar(require("vscode"));
class BridgeCompletionProvider {
    constructor(bridgeClient) {
        this.bridgeClient = bridgeClient;
        this.completionCount = 0;
        this.successCount = 0;
    }
    async provideInlineCompletionItems(document, position, context, token) {
        try {
            // Check if Bridge is connected
            if (!this.bridgeClient.isConnected()) {
                console.log('[BridgeCompletion] Bridge not connected, skipping');
                return null;
            }
            this.completionCount++;
            // Get code context
            const textBeforeCursor = document.getText(new vscode.Range(new vscode.Position(Math.max(0, position.line - 10), 0), position));
            const textAfterCursor = document.getText(new vscode.Range(position, new vscode.Position(Math.min(document.lineCount - 1, position.line + 5), 0)));
            // Get file context
            const filePath = document.uri.fsPath;
            const language = document.languageId;
            // Request completion from Agent through Bridge
            const response = await this.bridgeClient.complete({
                code: textBeforeCursor,
                language,
                filePath,
                cursorPosition: {
                    line: position.line,
                    character: position.character,
                },
                context: textAfterCursor,
                useTools: true, // Agent can use Read, Grep, etc.
                useRL: true, // Use RL weights for optimal completion
            });
            if (!response.completion || token.isCancellationRequested) {
                return null;
            }
            this.successCount++;
            // Show which tools were used (optional)
            if (response.toolsUsed && response.toolsUsed.length > 0) {
                console.log(`[BridgeCompletion] Tools used: ${response.toolsUsed.join(', ')}`);
            }
            // Create inline completion item
            const completionItem = new vscode.InlineCompletionItem(response.completion, new vscode.Range(position, position));
            return [completionItem];
        }
        catch (error) {
            console.error('[BridgeCompletion] Error:', error);
            return null;
        }
    }
    /**
     * Get statistics
     */
    getStats() {
        return {
            totalRequests: this.completionCount,
            successful: this.successCount,
            successRate: this.completionCount > 0
                ? (this.successCount / this.completionCount) * 100
                : 0,
        };
    }
}
exports.BridgeCompletionProvider = BridgeCompletionProvider;
//# sourceMappingURL=bridgeCompletionProvider.js.map