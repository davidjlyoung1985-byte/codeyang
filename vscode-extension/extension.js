const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const os = require('os');

function getApiKey() {
  const cfgKey = vscode.workspace.getConfiguration('codeyang').get('apiKey', '');
  if (cfgKey) return cfgKey;
  if (process.env['ANTHROPIC_API_KEY']) return process.env['ANTHROPIC_API_KEY'];
  if (process.env['CODEYANG_API_KEY']) return process.env['CODEYANG_API_KEY'];
  try {
    const cfgPath = path.join(os.homedir(), '.codeyang', 'config.json');
    const data = JSON.parse(fs.readFileSync(cfgPath, 'utf-8'));
    if (data.apiKey) return data.apiKey;
  } catch {}
  return null;
}

async function promptForApiKey() {
  const key = await vscode.window.showInputBox({
    prompt: 'Enter your Anthropic API key',
    password: true,
    placeHolder: 'sk-ant-api03-...',
    ignoreFocusOut: true,
  });
  if (key) {
    await vscode.workspace.getConfiguration('codeyang').update('apiKey', key, true);
    vscode.window.showInformationMessage('CodeYang: API key saved.');
  }
  return key;
}

let panel = null;
let history = [];

function activate(context) {
  const cmd = vscode.commands.registerCommand('codeyang.startChat', async () => {
    // apiKey might change between calls; refresh every time
    let apiKey = getApiKey();
    if (!apiKey) {
      apiKey = await promptForApiKey();
      if (!apiKey) return;
    }

    if (panel) {
      panel.reveal(vscode.ViewColumn.Beside);
      return;
    }

    try {
      const { Anthropic } = require('@anthropic-ai/sdk');
      const client = new Anthropic({ apiKey });

      panel = vscode.window.createWebviewPanel(
        'codeyangChat',
        'CodeYang',
        vscode.ViewColumn.Beside,
        { enableScripts: true, retainContextWhenHidden: true }
      );

      // Read the chat HTML from file (bundled with extension)
      const htmlPath = path.join(__dirname, 'chat.html');
      if (fs.existsSync(htmlPath)) {
        panel.webview.html = fs.readFileSync(htmlPath, 'utf-8');
      } else {
        panel.webview.html = '<html><body><p>chat.html not found</p></body></html>';
      }

      history = [];

      panel.webview.onDidReceiveMessage(async (msg) => {
        if (msg.type !== 'chat') return;
        try {
          history.push({ role: 'user', content: msg.text });
          panel.webview.postMessage({ type: 'addMessage', role: 'assistant', content: '' });

          const stream = client.messages.stream({
            model: process.env['CODEYANG_MODEL'] || 'claude-sonnet-4-20250514',
            max_tokens: Number(process.env['CODEYANG_MAX_TOKENS'] || '8192'),
            system: [
              'You are CodeYang, an AI coding agent inside VS Code.',
              'Help with coding, debugging, and code explanation.',
              'Write clean code, use markdown formatting.',
            ].join('\n'),
            messages: history,
          });

          let full = '';
          for await (const e of stream) {
            if (e.type === 'content_block_delta' && e.delta && e.delta.text) {
              full += e.delta.text;
              panel.webview.postMessage({ type: 'append', content: e.delta.text });
            }
          }
          history.push({ role: 'assistant', content: full });
          panel.webview.postMessage({ type: 'done' });
        } catch (err) {
          panel.webview.postMessage({ type: 'error', message: err.message || String(err) });
        }
      });

      panel.onDidDispose(() => { panel = null; });
    } catch (err) {
      vscode.window.showErrorMessage('CodeYang: ' + (err.message || String(err)));
    }
  });

  context.subscriptions.push(cmd);
}

function deactivate() {}

module.exports = { activate, deactivate };
