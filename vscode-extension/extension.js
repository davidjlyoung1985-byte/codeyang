const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

// Shared tools from main project (CJS build)
const {
  executeRead: _executeRead,
  executeWrite: _executeWrite,
  executeEdit: _executeEdit,
  executeGlob: _executeGlob,
  executeGrep: _executeGrep,
  executeWebFetch: _executeWebFetch,
  executeTodoWrite: _executeTodoWrite,
} = require('../../dist/cjs/tools.cjs');

// ─── Configuration ──────────────────────────────────────────────────────────
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

function getModel() {
  return vscode.workspace.getConfiguration('codeyang').get('model', '') ||
    process.env['CODEYANG_MODEL'] ||
    'claude-sonnet-4-20250514';
}

async function saveApiKey(key) {
  // Save to VS Code settings
  await vscode.workspace.getConfiguration('codeyang').update('apiKey', key, true);
  // Also save to ~/.codeyang/config.json for CLI
  const dir = path.join(os.homedir(), '.codeyang');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify({ apiKey: key }, null, 2));
}

// ─── Helpers ────────────────────────────────────────────────────────────────
function getWorkspaceRoot() {
  const folders = vscode.workspace.workspaceFolders;
  return folders && folders.length > 0 ? folders[0].uri.fsPath : process.cwd();
}

// ─── Tools ──────────────────────────────────────────────────────────────────
// Wrappers that resolve paths relative to workspace root before calling shared tools

async function execRead(filePath, offset, limit) {
  const resolved = path.isAbsolute(filePath) ? filePath : path.join(getWorkspaceRoot(), filePath);
  return _executeRead(resolved, offset, limit);
}

function execBash(command, cwd) {
  const workDir = cwd || getWorkspaceRoot();
  const shell = process.platform === 'win32' ? 'powershell.exe' : '/bin/bash';
  try {
    const stdout = execSync(command, { cwd: workDir, shell, timeout: 30000, maxBuffer: 10 * 1024 * 1024, encoding: 'utf-8' });
    return stdout.trim() || '(no output)';
  } catch (err) {
    const parts = [];
    if (err.stdout?.trim()) parts.push('stdout:\n' + err.stdout.trim());
    if (err.stderr?.trim()) parts.push('stderr:\n' + err.stderr.trim());
    parts.push('exit code: ' + (err.status || 1));
    return parts.join('\n\n');
  }
}

async function execWrite(filePath, content) {
  const resolved = path.isAbsolute(filePath) ? filePath : path.join(getWorkspaceRoot(), filePath);
  return _executeWrite(resolved, content);
}

async function execEdit(filePath, oldString, newString, replaceAll) {
  const resolved = path.isAbsolute(filePath) ? filePath : path.join(getWorkspaceRoot(), filePath);
  return _executeEdit(resolved, oldString, newString, replaceAll);
}

async function execWebFetch(url, format) {
  return _executeWebFetch(url, format);
}

async function execGlob(pattern, root) {
  const resolvedRoot = root ? (path.isAbsolute(root) ? root : path.join(getWorkspaceRoot(), root)) : getWorkspaceRoot();
  return _executeGlob(pattern, resolvedRoot);
}

async function execGrep(pattern, include, searchPath) {
  const resolvedPath = searchPath ? (path.isAbsolute(searchPath) ? searchPath : path.join(getWorkspaceRoot(), searchPath)) : getWorkspaceRoot();
  return _executeGrep(pattern, include, resolvedPath);
}

async function execTodoWrite(todos) {
  if (!Array.isArray(todos) || todos.length === 0) {
    return 'Usage: Provide a non-empty array of todo items with content, status, priority.';
  }
  return _executeTodoWrite(todos.map(t => ({
    content: String(t.content || ''),
    status: t.status || 'pending',
    priority: t.priority || 'medium',
  })));
}

// ─── Tool Definitions ───────────────────────────────────────────────────────
const toolDefinitions = [
  { name: 'Bash', description: 'Execute a shell command.', input_schema: { type: 'object', properties: { command: { type: 'string', description: 'Command to run' }, cwd: { type: 'string' } }, required: ['command'] } },
  { name: 'Read', description: 'Read a file or list a directory.', input_schema: { type: 'object', properties: { filePath: { type: 'string', description: 'File or directory path' }, offset: { type: 'number' }, limit: { type: 'number' } }, required: ['filePath'] } },
  { name: 'Write', description: 'Write content to a file. Creates parent directories if needed.', input_schema: { type: 'object', properties: { filePath: { type: 'string', description: 'Path to the file' }, content: { type: 'string', description: 'Content to write' } }, required: ['filePath', 'content'] } },
  { name: 'Edit', description: 'Edit a file by replacing exact text. Use replaceAll for renaming.', input_schema: { type: 'object', properties: { filePath: { type: 'string', description: 'Path to the file' }, oldString: { type: 'string', description: 'Text to replace' }, newString: { type: 'string', description: 'Replacement text' }, replaceAll: { type: 'boolean' } }, required: ['filePath', 'oldString', 'newString'] } },
  { name: 'Glob', description: 'Search for files matching a glob pattern.', input_schema: { type: 'object', properties: { pattern: { type: 'string', description: 'Glob pattern' }, root: { type: 'string' } }, required: ['pattern'] } },
  { name: 'Grep', description: 'Search file contents for a regex pattern.', input_schema: { type: 'object', properties: { pattern: { type: 'string', description: 'Regex pattern' }, include: { type: 'string' }, path: { type: 'string' } }, required: ['pattern'] } },
  { name: 'WebFetch', description: 'Fetch content from a URL. Converts HTML to readable text.', input_schema: { type: 'object', properties: { url: { type: 'string', description: 'URL to fetch' }, format: { type: 'string', enum: ['text', 'html'] } }, required: ['url'] } },
  { name: 'TodoWrite', description: 'Create and maintain a structured task list for the current session.', input_schema: { type: 'object', properties: { todos: { type: 'array', items: { type: 'object', properties: { content: { type: 'string' }, status: { type: 'string', enum: ['pending', 'in_progress', 'completed', 'cancelled'] }, priority: { type: 'string', enum: ['high', 'medium', 'low'] } }, required: ['content', 'status', 'priority'] }, description: 'The updated todo list' } }, required: ['todos'] } },
  { name: 'Question', description: 'Ask the user a question when you need clarification.', input_schema: { type: 'object', properties: { question: { type: 'string', description: 'The question to ask' }, options: { type: 'array', items: { type: 'object', properties: { label: { type: 'string' }, description: { type: 'string' } }, required: ['label', 'description'] }, description: 'Available choices' } }, required: ['question'] } },
  { name: 'Task', description: 'Launch a sub-agent for complex multi-step tasks. Available in CLI mode only.', input_schema: { type: 'object', properties: { description: { type: 'string', description: 'Brief description of the task' }, prompt: { type: 'string', description: 'Detailed prompt for the sub-agent' }, subagent_type: { type: 'string', description: 'Type of sub-agent' } }, required: ['description', 'prompt'] } },
];

async function executeTool(name, args, panel) {
  switch (name) {
    case 'Bash': return execBash(String(args.command || ''), args.cwd ? String(args.cwd) : undefined);
    case 'Read': return await execRead(String(args.filePath || ''), args.offset, args.limit);
    case 'Write': return await execWrite(String(args.filePath || ''), String(args.content || ''));
    case 'Edit': return await execEdit(String(args.filePath || ''), String(args.oldString || ''), String(args.newString || ''), args.replaceAll === true);
    case 'Glob': return await execGlob(String(args.pattern || ''), args.root ? String(args.root) : undefined);
    case 'Grep': return await execGrep(String(args.pattern || ''), args.include ? String(args.include) : undefined, args.path ? String(args.path) : undefined);
    case 'WebFetch': return await execWebFetch(String(args.url || ''), args.format ? String(args.format) : undefined);
    case 'TodoWrite': return await execTodoWrite(Array.isArray(args.todos) ? args.todos : []);
    case 'Task': return 'Sub-agent tasks are available in the CodeYang CLI. Please execute this work directly using the available tools (Read, Grep, Bash, etc.).';
    case 'Question': {
      const q = String(args.question || '');
      const options = args.options;
      let result = `[QUESTION] ${q}`;
      if (options && options.length > 0) {
        const opts = options.map((o, i) => `  ${i + 1}. ${o.label} — ${o.description}`).join('\n');
        result += '\n\nOptions:\n' + opts;
      }
      // Show question to user and wait for answer
      panel.webview.postMessage({ type: 'question', question: q, options: options || [] });
      const answer = await new Promise(resolve => {
        // Store resolve function for the main message handler to use
        panel._questionResolve = resolve;
      });
      return `[ANSWER] ${answer}`;
    }
    default: return 'Unknown tool: ' + name;
  }
}

// ─── Retry ──────────────────────────────────────────────────────────────────
async function withRetry(fn, label, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const isRetryable =
        err.message?.includes('rate_limit') ||
        err.message?.includes('Rate exceeded') ||
        err.message?.includes('429') ||
        err.message?.includes('529') ||
        err.message?.includes('server error') ||
        err.message?.includes('503') ||
        err.message?.includes('timeout') ||
        err.message?.includes('network') ||
        err.message?.includes('ECONNRESET') ||
        err.message?.includes('ETIMEDOUT');

      if (attempt < maxRetries && isRetryable) {
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 30_000);
        console.error(`${label} attempt ${attempt}/${maxRetries} failed, retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      throw err;
    }
  }
}

// ─── Session persistence ─────────────────────────────────────────────────────
const SESSION_DIR = path.join(os.homedir(), '.codeyang', 'vscode-sessions');

function saveSession(messages) {
  if (messages.length === 0) return;
  try {
    if (!fs.existsSync(SESSION_DIR)) fs.mkdirSync(SESSION_DIR, { recursive: true });
    // Auto-generate title from first user message
    const firstUserMsg = messages.find(m => m.role === 'user');
    const title = firstUserMsg
      ? String(firstUserMsg.content || '').slice(0, 60).replace(/\n/g, ' ')
      : 'untitled';
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const session = {
      id,
      title,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      messages: messages.map(m => ({
        role: m.role,
        content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
      })),
    };
    fs.writeFileSync(path.join(SESSION_DIR, `${id}.json`), JSON.stringify(session, null, 2));
  } catch (e) {
    console.error('Failed to save session:', e.message);
  }
}

// ─── Agent Loop ─────────────────────────────────────────────────────────────
async function runAgent(client, messages, panel) {
  const MAX_TURNS = 15;
  const systemPrompt = [
    'You are CodeYang, an AI coding agent inside VS Code.',
    'Help users with coding, debugging, code explanation, and project navigation.',
    'Use the available tools to read files, search code, run commands, write files, and more.',
    'Be concise but thorough. Use markdown formatting.',
    'Do not repeat yourself or restate the obvious — say it once and move on.',
    'Avoid filler and preamble — give the answer directly.',
  ].join('\n');

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const stream = await withRetry(
      () => client.messages.stream({
        model: getModel(),
        max_tokens: Number(process.env['CODEYANG_MAX_TOKENS'] || '8192'),
        temperature: 0.5,
        system: systemPrompt,
        messages,
        tools: toolDefinitions,
      }),
      'Anthropic streaming API',
    );

    const contentBlocks = [];
    let currentBlockIndex = -1;

    for await (const event of stream) {
      switch (event.type) {
        case 'content_block_start':
          currentBlockIndex = event.index;
          contentBlocks[currentBlockIndex] = event.content_block;
          break;
        case 'content_block_delta':
          if (event.delta?.type === 'text_delta' && event.delta.text) {
            panel.webview.postMessage({ type: 'append', content: event.delta.text });
            if (contentBlocks[currentBlockIndex]?.type === 'text') {
              contentBlocks[currentBlockIndex].text = (contentBlocks[currentBlockIndex].text || '') + event.delta.text;
            }
          } else if (event.delta?.type === 'input_json_delta' && event.delta.partial_json) {
            if (contentBlocks[currentBlockIndex]?.type === 'tool_use') {
              contentBlocks[currentBlockIndex].input_json = (contentBlocks[currentBlockIndex].input_json || '') + event.delta.partial_json;
            }
          }
          break;
        case 'content_block_stop':
          if (contentBlocks[currentBlockIndex]?.type === 'tool_use') {
            try { contentBlocks[currentBlockIndex].input = JSON.parse(contentBlocks[currentBlockIndex].input_json || '{}'); }
            catch { contentBlocks[currentBlockIndex].input = {}; }
          }
          break;
      }
    }

    let assistantText = '';
    const toolCalls = [];
    for (const block of contentBlocks) {
      if (!block) continue;
      if (block.type === 'text') assistantText += (block.text || '');
      else if (block.type === 'tool_use') toolCalls.push({ id: block.id, name: block.name, input: block.input || {} });
    }

    const assistantContent = contentBlocks
      .filter(b => b && (b.type === 'text' || b.type === 'tool_use'))
      .map(b => b.type === 'text' ? { type: 'text', text: b.text || '' } : { type: 'tool_use', id: b.id, name: b.name, input: b.input || {} });

    if (assistantContent.length === 0) break;
    messages.push({ role: 'assistant', content: assistantContent });
    if (toolCalls.length === 0) break;

    const toolResults = [];
    for (const tc of toolCalls) {
      if (tc.name === 'Question') {
        // Handle question inline in the tool loop
        const q = String(tc.input.question || '');
        panel.webview.postMessage({ type: 'question', question: q, options: tc.input.options || [] });
        const answer = await new Promise(resolve => { panel._questionResolve = resolve; });
        toolResults.push({ type: 'tool_result', tool_use_id: tc.id, content: answer, is_error: false });
        continue;
      }

      panel.webview.postMessage({ type: 'toolCall', name: tc.name, args: JSON.stringify(tc.input).slice(0, 200) });
      try {
        const output = await executeTool(tc.name, tc.input, panel);
        toolResults.push({ type: 'tool_result', tool_use_id: tc.id, content: output, is_error: false });
        panel.webview.postMessage({ type: 'toolResult', output: String(output).split('\n')[0]?.slice(0, 150) || '(empty)', isError: false });
      } catch (err) {
        const msg = err.message || String(err);
        toolResults.push({ type: 'tool_result', tool_use_id: tc.id, content: msg, is_error: true });
        panel.webview.postMessage({ type: 'toolResult', output: msg.slice(0, 150), isError: true });
      }
    }
    messages.push({ role: 'user', content: toolResults });
  }
}

// ─── Extension Activation ───────────────────────────────────────────────────
let panel = null;
let history = [];
let anthropicClient = null;

function createOrShowPanel(context) {
  if (panel) {
    panel.reveal(vscode.ViewColumn.Beside);
    return panel;
  }

  panel = vscode.window.createWebviewPanel(
    'codeyangChat',
    'CodeYang',
    vscode.ViewColumn.Beside,
    { enableScripts: true, retainContextWhenHidden: true }
  );

  const htmlPath = path.join(context.extensionPath, 'chat.html');
  if (fs.existsSync(htmlPath)) {
    panel.webview.html = fs.readFileSync(htmlPath, 'utf-8');
  } else {
    panel.webview.html = '<html><body><p>chat.html not found</p></body></html>';
  }

  let webviewReady = false;

  panel.onDidDispose(() => { panel = null; history = []; });

  // Handle messages from the webview
  panel.webview.onDidReceiveMessage(async (msg) => {
    // First message: webview is ready, send API key status
    if (msg.type === 'ready') {
      webviewReady = true;
      const hasKey = !!getApiKey();
      if (hasKey) {
        try {
          const { Anthropic } = require('@anthropic-ai/sdk');
          anthropicClient = new Anthropic({ apiKey: getApiKey() });
        } catch {}
        panel.webview.postMessage({ type: 'apiKeySet' });
      } else {
        panel.webview.postMessage({ type: 'showSetup' });
      }
      return;
    }

    // Handle question answers
    if (msg.type === 'questionAnswer' && panel._questionResolve) {
      panel._questionResolve(msg.answer);
      panel._questionResolve = null;
      return;
    }

    switch (msg.type) {
      case 'setApiKey': {
        if (msg.key && msg.key.trim()) {
          await saveApiKey(msg.key.trim());
          try {
            const { Anthropic } = require('@anthropic-ai/sdk');
            anthropicClient = new Anthropic({ apiKey: msg.key.trim() });
            panel.webview.postMessage({ type: 'apiKeySet' });
            vscode.window.showInformationMessage('CodeYang: API key saved. You can now start chatting.');
          } catch (err) {
            panel.webview.postMessage({ type: 'error', message: 'Failed to initialize: ' + err.message });
          }
        }
        break;
      }

      case 'chat': {
        if (!anthropicClient) {
          const key = getApiKey();
          if (!key) {
            panel.webview.postMessage({ type: 'error', message: 'API key not configured. Please enter your Anthropic API key above.' });
            return;
          }
          try {
            const { Anthropic } = require('@anthropic-ai/sdk');
            anthropicClient = new Anthropic({ apiKey: key });
          } catch (err) {
            panel.webview.postMessage({ type: 'error', message: 'Failed to initialize Anthropic client: ' + err.message });
            return;
          }
        }

        const userText = msg.text;
        history.push({ role: 'user', content: userText });
        panel.webview.postMessage({ type: 'addMessage', role: 'assistant', content: '' });

        try {
          const messages = history.slice();
          await runAgent(anthropicClient, messages, panel);
          history = messages;
          saveSession(history);  // Persist after each exchange
          panel.webview.postMessage({ type: 'done' });
        } catch (err) {
          const errMsg = err.message || String(err);
          console.error('Agent error:', err);

          if (errMsg.includes('401') || errMsg.includes('authentication') || errMsg.includes('api key') || errMsg.includes('invalid_api_key')) {
            panel.webview.postMessage({ type: 'error', message: 'Invalid API key. Please check your Anthropic API key (should start with sk-ant-) and try again.' });
            panel.webview.postMessage({ type: 'showSetup' });
          } else if (errMsg.includes('503') || errMsg.includes('500') || errMsg.includes('Internal server error')) {
            panel.webview.postMessage({ type: 'error', message: 'Anthropic API server is temporarily unavailable (503/500 error). Please try again in a few moments.' });
          } else if (errMsg.includes('429') || errMsg.includes('rate_limit')) {
            panel.webview.postMessage({ type: 'error', message: 'Rate limit exceeded. Please wait a moment and try again.' });
          } else if (errMsg.includes('ENOTFOUND') || errMsg.includes('ECONNREFUSED') || errMsg.includes('network')) {
            panel.webview.postMessage({ type: 'error', message: 'Network error: Cannot connect to Anthropic API. Please check your internet connection.' });
          } else {
            panel.webview.postMessage({ type: 'error', message: 'Error: ' + errMsg });
          }
          panel.webview.postMessage({ type: 'done' });
        }
        break;
      }
    }
  });

  return panel;
}

function activate(context) {
  const cmd = vscode.commands.registerCommand('codeyang.startChat', () => {
    createOrShowPanel(context);
  });
  context.subscriptions.push(cmd);
}

function deactivate() {}

module.exports = { activate, deactivate };
