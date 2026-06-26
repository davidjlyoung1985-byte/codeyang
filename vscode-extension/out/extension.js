"use strict";
/**
 * CodeYang VS Code Extension
 *
 * Provides inline code completion powered by CodeYang agent.
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
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const completionProvider_1 = require("./completionProvider");
const client_1 = require("./client");
let completionProvider;
let client;
function activate(context) {
    console.log('CodeYang extension activated');
    // Initialize CodeYang client
    const config = vscode.workspace.getConfiguration('codeyang');
    const apiKey = config.get('apiKey') || process.env.ANTHROPIC_API_KEY || '';
    if (!apiKey) {
        vscode.window.showWarningMessage('CodeYang: No API key configured. Please set codeyang.apiKey in settings.');
    }
    client = new client_1.CodeYangClient(apiKey);
    // Register inline completion provider
    if (config.get('enableInlineCompletion')) {
        completionProvider = vscode.languages.registerInlineCompletionItemProvider({ pattern: '**' }, new completionProvider_1.CodeYangCompletionProvider(client));
        context.subscriptions.push(completionProvider);
    }
    // Register commands
    context.subscriptions.push(vscode.commands.registerCommand('codeyang.inlineCompletion', async () => {
        await triggerInlineCompletion();
    }));
    context.subscriptions.push(vscode.commands.registerCommand('codeyang.refactor', async () => {
        await refactorSelection();
    }));
    context.subscriptions.push(vscode.commands.registerCommand('codeyang.generateTests', async () => {
        await generateTests();
    }));
    // Watch for configuration changes
    context.subscriptions.push(vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration('codeyang.apiKey')) {
            const newApiKey = vscode.workspace.getConfiguration('codeyang').get('apiKey') || '';
            client.updateApiKey(newApiKey);
        }
    }));
}
async function triggerInlineCompletion() {
    const editor = vscode.window.activeTextEditor;
    if (!editor)
        return;
    // Trigger VS Code's inline suggestion
    await vscode.commands.executeCommand('editor.action.inlineSuggest.trigger');
}
async function refactorSelection() {
    const editor = vscode.window.activeTextEditor;
    if (!editor)
        return;
    const selection = editor.selection;
    const selectedText = editor.document.getText(selection);
    if (!selectedText) {
        vscode.window.showWarningMessage('Please select code to refactor');
        return;
    }
    const action = await vscode.window.showQuickPick(['Extract Function', 'Rename Variable', 'Optimize Code', 'Add Comments', 'Convert to Async/Await'], { placeHolder: 'Select refactoring action' });
    if (!action)
        return;
    vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: `CodeYang: ${action}...`,
        cancellable: true,
    }, async (progress, token) => {
        try {
            const result = await client.refactor(selectedText, action, token);
            if (result) {
                await editor.edit((editBuilder) => {
                    editBuilder.replace(selection, result);
                });
                vscode.window.showInformationMessage('Refactoring completed');
            }
        }
        catch (error) {
            vscode.window.showErrorMessage(`Refactoring failed: ${error}`);
        }
    });
}
async function generateTests() {
    const editor = vscode.window.activeTextEditor;
    if (!editor)
        return;
    const document = editor.document;
    const fileName = document.fileName;
    vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: 'CodeYang: Generating tests...',
        cancellable: true,
    }, async (progress, token) => {
        try {
            const code = document.getText();
            const tests = await client.generateTests(code, fileName, token);
            if (tests) {
                const testFileName = fileName.replace(/\.(ts|js)$/, '.test.$1');
                const testUri = vscode.Uri.file(testFileName);
                await vscode.workspace.fs.writeFile(testUri, Buffer.from(tests));
                const testDoc = await vscode.workspace.openTextDocument(testUri);
                await vscode.window.showTextDocument(testDoc);
                vscode.window.showInformationMessage('Tests generated successfully');
            }
        }
        catch (error) {
            vscode.window.showErrorMessage(`Test generation failed: ${error}`);
        }
    });
}
function deactivate() {
    if (completionProvider) {
        completionProvider.dispose();
    }
}
//# sourceMappingURL=extension.js.map