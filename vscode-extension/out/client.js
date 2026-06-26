"use strict";
/**
 * CodeYang API Client
 *
 * Communicates with CodeYang agent for completions and refactoring.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CodeYangClient = void 0;
const axios_1 = __importDefault(require("axios"));
class CodeYangClient {
    constructor(apiKey) {
        this.apiKey = apiKey;
        this.baseURL = 'https://api.anthropic.com/v1';
        this.axiosInstance = axios_1.default.create({
            baseURL: this.baseURL,
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01',
            },
            timeout: 10000,
        });
    }
    updateApiKey(apiKey) {
        this.apiKey = apiKey;
        this.axiosInstance.defaults.headers['x-api-key'] = apiKey;
    }
    async getCompletion(request, token) {
        const cancelTokenSource = axios_1.default.CancelToken.source();
        // Cancel axios request when VS Code cancels
        token.onCancellationRequested(() => {
            cancelTokenSource.cancel('User cancelled');
        });
        try {
            const prompt = this.buildCompletionPrompt(request);
            const response = await this.axiosInstance.post('/messages', {
                model: 'claude-3-5-sonnet-20241022',
                max_tokens: request.isMultiLine ? 2000 : 500,
                temperature: 0.2, // Lower temperature for more deterministic completions
                messages: [
                    {
                        role: 'user',
                        content: prompt,
                    },
                ],
            }, {
                cancelToken: cancelTokenSource.token,
            });
            const completion = response.data.content[0]?.text || '';
            return this.extractCompletion(completion);
        }
        catch (error) {
            if (axios_1.default.isCancel(error)) {
                return null;
            }
            console.error('CodeYang API error:', error);
            return null;
        }
    }
    async refactor(code, action, token) {
        const cancelTokenSource = axios_1.default.CancelToken.source();
        token.onCancellationRequested(() => cancelTokenSource.cancel());
        try {
            const prompt = `Refactor the following code: ${action}

\`\`\`
${code}
\`\`\`

Output ONLY the refactored code, no explanation.`;
            const response = await this.axiosInstance.post('/messages', {
                model: 'claude-3-5-sonnet-20241022',
                max_tokens: 2000,
                messages: [{ role: 'user', content: prompt }],
            }, { cancelToken: cancelTokenSource.token });
            return response.data.content[0]?.text || null;
        }
        catch (error) {
            if (axios_1.default.isCancel(error))
                return null;
            throw error;
        }
    }
    async generateTests(code, fileName, token) {
        const cancelTokenSource = axios_1.default.CancelToken.source();
        token.onCancellationRequested(() => cancelTokenSource.cancel());
        try {
            const prompt = `Generate comprehensive unit tests for the following code from ${fileName}:

\`\`\`
${code}
\`\`\`

Use appropriate testing framework (Jest/Vitest for TS/JS, pytest for Python, etc.).
Output ONLY the test code, no explanation.`;
            const response = await this.axiosInstance.post('/messages', {
                model: 'claude-3-5-sonnet-20241022',
                max_tokens: 4000,
                messages: [{ role: 'user', content: prompt }],
            }, { cancelToken: cancelTokenSource.token });
            return response.data.content[0]?.text || null;
        }
        catch (error) {
            if (axios_1.default.isCancel(error))
                return null;
            throw error;
        }
    }
    buildCompletionPrompt(request) {
        const intentHint = request.isMultiLine
            ? `This appears to be a ${request.intent || 'multi-line'} completion. Provide a complete implementation.`
            : 'Provide a concise single-line or short completion.';
        const maxLines = request.isMultiLine ? 20 : 3;
        return `You are an AI code completion assistant. Complete the code at the cursor position.

File: ${request.fileName}
Language: ${request.language}
Intent: ${intentHint}

Context (surrounding code):
\`\`\`
${request.context}
\`\`\`

Current line (cursor at |):
${request.prefix}|${request.suffix}

Instructions:
1. Provide ONLY the completion text that should appear after the cursor
2. Match the code style and indentation
3. For multi-line completions: provide complete implementation (max ${maxLines} lines)
4. For single-line completions: keep it concise (1-3 lines)
5. Do NOT repeat the prefix
6. Do NOT include explanations or markdown formatting
7. Ensure proper syntax and type safety

Completion:`;
    }
    extractCompletion(response) {
        // Remove markdown code blocks if present
        let cleaned = response.trim();
        // Remove ```language\n and trailing ```
        cleaned = cleaned.replace(/^```\w*\n?/, '').replace(/\n?```$/, '');
        // Remove leading/trailing whitespace from each line but preserve indentation
        const lines = cleaned.split('\n');
        const trimmedLines = lines.map((line) => line.trimEnd());
        cleaned = trimmedLines.join('\n');
        return cleaned;
    }
}
exports.CodeYangClient = CodeYangClient;
//# sourceMappingURL=client.js.map