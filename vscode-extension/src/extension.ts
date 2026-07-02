/**
 * CodeYang VS Code Extension
 *
 * Provides inline code completion powered by CodeYang agent.
 */

import * as vscode from 'vscode';
import { CodeYangCompletionProvider } from './completionProvider';
import { CodeYangClient } from './client';
import { BridgeClient } from './bridgeClient';
import { BridgeCompletionProvider } from './bridgeCompletionProvider';

let completionProvider: vscode.Disposable | undefined;
let client: CodeYangClient;
let bridgeClient: BridgeClient | undefined;
let usingBridge = false;

export function activate(context: vscode.ExtensionContext) {
  console.log('CodeYang extension activated');

  // Initialize CodeYang client
  const config = vscode.workspace.getConfiguration('codeyang');
  const apiKey = config.get<string>('apiKey') || process.env.ANTHROPIC_API_KEY || '';
  const useBridgeMode = config.get<boolean>('useBridge', false);
  const bridgeURL = config.get<string>('bridgeURL', 'http://localhost:9876');

  // Try Bridge mode first if enabled
  if (useBridgeMode) {
    bridgeClient = new BridgeClient({ url: bridgeURL, apiKey });

    bridgeClient
      .checkConnection()
      .then((connected) => {
        if (connected) {
          usingBridge = true;
          vscode.window.showInformationMessage('✅ CodeYang: Connected to Agent (Full features available)');

          // Connect WebSocket for real-time updates
          return bridgeClient!.connectWebSocket();
        } else {
          throw new Error('Bridge not available');
        }
      })
      .catch((error) => {
        console.warn('[CodeYang] Bridge connection failed:', error);
        vscode.window.showWarningMessage(
          '⚠️ CodeYang: Bridge not available. Start bridge server with: npm run bridge-server',
        );
        bridgeClient = undefined;
        usingBridge = false;
      });
  }

  // Fallback to direct API if Bridge not available
  if (!apiKey && !useBridgeMode) {
    vscode.window.showWarningMessage(
      'CodeYang: No API key configured. Please set codeyang.apiKey in settings or enable Bridge mode.',
    );
  }

  client = new CodeYangClient(apiKey);

  // Register inline completion provider
  if (config.get<boolean>('enableInlineCompletion')) {
    // Wait a bit for Bridge connection to establish
    setTimeout(() => {
      const provider =
        usingBridge && bridgeClient
          ? new BridgeCompletionProvider(bridgeClient)
          : new CodeYangCompletionProvider(client);

      completionProvider = vscode.languages.registerInlineCompletionItemProvider({ pattern: '**' }, provider);
      context.subscriptions.push(completionProvider);

      console.log(`[CodeYang] Using ${usingBridge ? 'Bridge' : 'Direct API'} mode for completions`);
    }, 1000);
  }

  // Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand('codeyang.inlineCompletion', async () => {
      await triggerInlineCompletion();
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('codeyang.refactor', async () => {
      await refactorSelection();
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('codeyang.generateTests', async () => {
      await generateTests();
    }),
  );

  // Bridge-specific commands
  if (useBridgeMode) {
    context.subscriptions.push(
      vscode.commands.registerCommand('codeyang.reconnectBridge', async () => {
        await reconnectBridge();
      }),
    );

    context.subscriptions.push(
      vscode.commands.registerCommand('codeyang.showStats', async () => {
        await showAgentStats();
      }),
    );

    context.subscriptions.push(
      vscode.commands.registerCommand('codeyang.executeCustomTask', async () => {
        await executeCustomTask();
      }),
    );
  }

  // Watch for configuration changes
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('codeyang.apiKey')) {
        const newApiKey = vscode.workspace.getConfiguration('codeyang').get<string>('apiKey') || '';
        client.updateApiKey(newApiKey);
      }
    }),
  );
}

async function triggerInlineCompletion() {
  const editor = vscode.window.activeTextEditor;
  if (!editor) return;

  // Trigger VS Code's inline suggestion
  await vscode.commands.executeCommand('editor.action.inlineSuggest.trigger');
}

async function refactorSelection() {
  const editor = vscode.window.activeTextEditor;
  if (!editor) return;

  const selection = editor.selection;
  const selectedText = editor.document.getText(selection);

  if (!selectedText) {
    vscode.window.showWarningMessage('Please select code to refactor');
    return;
  }

  const action = await vscode.window.showQuickPick(
    ['Extract Function', 'Rename Variable', 'Optimize Code', 'Add Comments', 'Convert to Async/Await'],
    { placeHolder: 'Select refactoring action' },
  );

  if (!action) return;

  vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: `CodeYang: ${action}...`,
      cancellable: true,
    },
    async (progress, token) => {
      try {
        const result = await client.refactor(selectedText, action, token);

        if (result) {
          await editor.edit((editBuilder) => {
            editBuilder.replace(selection, result);
          });
          vscode.window.showInformationMessage('Refactoring completed');
        }
      } catch (error) {
        vscode.window.showErrorMessage(`Refactoring failed: ${error}`);
      }
    },
  );
}

async function generateTests() {
  const editor = vscode.window.activeTextEditor;
  if (!editor) return;

  const document = editor.document;
  const fileName = document.fileName;

  vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: 'CodeYang: Generating tests...',
      cancellable: true,
    },
    async (progress, token) => {
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
      } catch (error) {
        vscode.window.showErrorMessage(`Test generation failed: ${error}`);
      }
    },
  );
}

export function deactivate() {
  if (completionProvider) {
    completionProvider.dispose();
  }
  if (bridgeClient) {
    bridgeClient.disconnect();
  }
}

/**
 * Reconnect to Bridge
 */
async function reconnectBridge() {
  if (!bridgeClient) {
    vscode.window.showErrorMessage('Bridge mode not enabled');
    return;
  }

  try {
    const connected = await bridgeClient.checkConnection();
    if (connected) {
      await bridgeClient.connectWebSocket();
      vscode.window.showInformationMessage('✅ CodeYang: Reconnected to Bridge');
    } else {
      vscode.window.showErrorMessage('❌ CodeYang: Bridge server not responding');
    }
  } catch (error) {
    vscode.window.showErrorMessage(`Failed to reconnect: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Show Agent statistics
 */
async function showAgentStats() {
  if (!bridgeClient) {
    vscode.window.showErrorMessage('Bridge mode not enabled');
    return;
  }

  try {
    const stats = await bridgeClient.getStats();

    const message = `
📊 CodeYang Agent Statistics

🛠️ Tools Used:
${Object.entries(stats.toolsUsed)
  .map(([tool, count]) => `  ${tool}: ${count} times`)
  .join('\n')}

⚖️ Top RL Weights:
${stats.rlWeights
  .slice(0, 5)
  .map((w) => `  ${w.name}: ${w.weight.toFixed(2)}`)
  .join('\n')}

💾 Memory: ${stats.memorySize} entries
    `;

    vscode.window.showInformationMessage(message, { modal: true });
  } catch (error) {
    vscode.window.showErrorMessage(`Failed to get stats: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Execute custom task
 */
async function executeCustomTask() {
  if (!bridgeClient) {
    vscode.window.showErrorMessage('Bridge mode not enabled');
    return;
  }

  const taskDescription = await vscode.window.showInputBox({
    prompt: 'What would you like CodeYang Agent to do?',
    placeHolder: 'e.g., "Find all TODOs in the project" or "Optimize this function"',
  });

  if (!taskDescription) {
    return;
  }

  const editor = vscode.window.activeTextEditor;
  const context: Record<string, unknown> = {};

  if (editor) {
    context.filePath = editor.document.uri.fsPath;
    context.selection = editor.document.getText(editor.selection);
  }

  vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: 'CodeYang Agent working...',
      cancellable: true,
    },
    async (progress, token) => {
      try {
        const result = await bridgeClient!.executeTask({
          type: 'custom',
          description: taskDescription,
          context,
        });

        if (result.success) {
          vscode.window.showInformationMessage('✅ Task completed');

          // Show result in new document
          const doc = await vscode.workspace.openTextDocument({
            content: result.result,
            language: 'markdown',
          });
          await vscode.window.showTextDocument(doc);
        } else {
          vscode.window.showErrorMessage('❌ Task failed');
        }
      } catch (error) {
        vscode.window.showErrorMessage(
          `Task execution failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    },
  );
}
