const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

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

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', '.next', 'build', '.turbo', 'coverage', '__pycache__']);

// ─── Tools ──────────────────────────────────────────────────────────────────
function execRead(filePath, offset, limit) {
  const resolved = path.isAbsolute(filePath) ? filePath : path.join(getWorkspaceRoot(), filePath);
  if (!fs.existsSync(resolved)) throw new Error(`File not found: ${filePath}`);
  const st = fs.statSync(resolved);
  if (st.isDirectory()) {
    const entries = fs.readdirSync(resolved, { withFileTypes: true });
    const sorted = [...entries].sort((a, b) => {
      if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    const dirs = entries.filter(e => e.isDirectory()).length;
    const files = entries.length - dirs;
    return sorted.map(e => e.name + (e.isDirectory() ? '/' : '')).join('\n') +
      `\n\n${dirs} director${dirs === 1 ? 'y' : 'ies'}, ${files} file${files === 1 ? '' : 's'}`;
  }
  const content = fs.readFileSync(resolved, 'utf-8');
  const lines = content.split('\n');
  if (offset !== undefined) {
    const start = Number(offset);
    const end = limit !== undefined ? start + Number(limit) : lines.length;
    const shown = lines.slice(start, end);
    const header = `(Lines ${start + 1}-${start + shown.length} of ${lines.length})\n`;
    return header + shown.map((l, i) => `${start + i + 1}: ${l}`).join('\n');
  }
  return content;
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

function execWrite(filePath, content) {
  const resolved = path.isAbsolute(filePath) ? filePath : path.join(getWorkspaceRoot(), filePath);
  const dir = path.dirname(resolved);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(resolved, content, 'utf-8');
  return `Written ${content.length} bytes to ${filePath}`;
}

function execEdit(filePath, oldString, newString, replaceAll) {
  const resolved = path.isAbsolute(filePath) ? filePath : path.join(getWorkspaceRoot(), filePath);
  if (!fs.existsSync(resolved)) throw new Error(`File not found: ${filePath}`);
  const content = fs.readFileSync(resolved, 'utf-8');

  if (replaceAll) {
    if (!content.includes(oldString)) throw new Error(`oldString not found in ${filePath}`);
    const count = (content.match(new RegExp(escapeRegex(oldString), 'g')) || []).length;
    const updated = content.replaceAll(oldString, newString);
    fs.writeFileSync(resolved, updated, 'utf-8');
    return `Replaced ${count} occurrence(s) in ${filePath}`;
  }

  const idx = content.indexOf(oldString);
  if (idx === -1) throw new Error(`oldString not found in ${filePath}`);
  if (content.indexOf(oldString, idx + 1) !== -1) {
    throw new Error(`Found multiple matches for oldString in ${filePath}. Provide more surrounding context or use replaceAll.`);
  }
  const updated = content.replace(oldString, newString);
  fs.writeFileSync(resolved, updated, 'utf-8');
  return `Edited ${filePath} (1 occurrence)`;
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function execWebFetch(url, format) {
  if (!url || typeof url !== 'string') throw new Error('URL is required');
  let parsed;
  try {
    parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') throw new Error(`Unsupported protocol: ${parsed.protocol}`);
  } catch (e) {
    if (e.message.includes('Unsupported')) throw e;
    throw new Error(`Invalid URL: ${url}`);
  }

  const outputFormat = format === 'html' ? 'html' : 'text';
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'CodeYang/0.2.0 (AI Coding Agent)',
        'Accept': outputFormat === 'html' ? 'text/html' : 'text/plain, text/html',
      },
    });
    clearTimeout(timeout);

    if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);

    const contentType = response.headers.get('content-type') || '';
    const isHtml = contentType.includes('text/html');

    if (isHtml && outputFormat === 'text') {
      let html = await response.text();
      let text = html
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<head[^>]*>[\s\S]*?<\/head>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&nbsp;/g, ' ')
        .replace(/\s+/g, ' ')
        .replace(/\n\s*\n/g, '\n')
        .trim();
      if (text.length > 100000) text = text.slice(0, 100000) + '\n\n[Content truncated at 100000 characters]';
      return text;
    }

    const content = await response.text();
    if (content.length > 100000) return content.slice(0, 100000) + '\n\n[Content truncated at 100000 characters]';
    return content;
  } catch (err) {
    if (err.name === 'AbortError') throw new Error(`Request timed out after 15s: ${url}`);
    throw err;
  }
}

function execGlob(pattern, root) {
  const base = root ? (path.isAbsolute(root) ? root : path.join(getWorkspaceRoot(), root)) : getWorkspaceRoot();
  const results = [];
  function walk(dir) {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      const rel = path.relative(base, full).replace(/\\/g, '/');
      const regexStr = pattern.replace(/\./g, '\\.').replace(/\*\*/g, '___G___').replace(/\*/g, '[^/]*').replace(/___G___/g, '.*');
      if (new RegExp('^' + regexStr + '$').test(rel)) results.push(rel);
      if (entry.isDirectory()) {
        if (pattern.includes('**')) walk(full);
        else if (pattern.includes('/') && rel.split('/').length < pattern.split('/').length) walk(full);
      }
    }
  }
  walk(base);
  return results.length > 0 ? results.join('\n') : '(no matches)';
}

function execGrep(pattern, include, searchPath) {
  const base = searchPath ? (path.isAbsolute(searchPath) ? searchPath : path.join(getWorkspaceRoot(), searchPath)) : getWorkspaceRoot();
  const regex = new RegExp(pattern, 'i');
  const includeRegex = include ? new RegExp(include.replace(/\*/g, '.*')) : null;
  const results = [];
  function walk(dir) {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!entry.name.startsWith('.') && !SKIP_DIRS.has(entry.name)) walk(full);
      } else if (entry.isFile()) {
        if (includeRegex && !includeRegex.test(entry.name)) continue;
        try {
          const content = fs.readFileSync(full, 'utf-8');
          const lines = content.split('\n');
          const matches = [];
          for (let i = 0; i < lines.length; i++) {
            if (regex.test(lines[i])) matches.push((i + 1) + ': ' + lines[i].trim());
          }
          if (matches.length > 0) {
            results.push({ file: path.relative(base, full).replace(/\\/g, '/'), lines: matches.slice(0, 20) });
          }
        } catch {}
      }
    }
  }
  walk(base);
  if (results.length === 0) return '(no matches)';
  return results.map(r => r.file + '\n' + r.lines.join('\n')).join('\n\n');
}

// ─── Todo & Question state ──────────────────────────────────────────────────
let currentTodos = [];

function execTodoWrite(todos) {
  if (!Array.isArray(todos) || todos.length === 0) {
    return 'Usage: Provide a non-empty array of todo items with content, status, priority.';
  }
  const validStatuses = new Set(['pending', 'in_progress', 'completed', 'cancelled']);
  const validPriorities = new Set(['high', 'medium', 'low']);
  const normalized = todos.map(t => ({
    content: String(t.content || ''),
    status: validStatuses.has(t.status) ? t.status : 'pending',
    priority: validPriorities.has(t.priority) ? t.priority : 'medium',
  }));

  currentTodos = normalized.filter(t => t.status !== 'completed' && t.status !== 'cancelled');

  const statusIcons = { pending: '[ ]', in_progress: '[~]', completed: '[x]', cancelled: '[-]' };
  const lines = [`## Todo List (${currentTodos.length} active)`];
  const grouped = { in_progress: [], pending: [], completed: [], cancelled: [] };
  for (const t of todos) { (grouped[t.status] ||= []).push(t); }

  for (const status of ['in_progress', 'pending', 'completed', 'cancelled']) {
    const items = grouped[status];
    if (items.length === 0) continue;
    lines.push(`\n### ${status.replace('_', ' ')}:`);
    for (const item of items) {
      lines.push(`  ${statusIcons[item.status] || '?'} [${item.priority}] ${item.content}`);
    }
  }
  return lines.join('\n');
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
];

async function executeTool(name, args, panel) {
  switch (name) {
    case 'Bash': return execBash(String(args.command || ''), args.cwd ? String(args.cwd) : undefined);
    case 'Read': return execRead(String(args.filePath || ''), args.offset, args.limit);
    case 'Write': return execWrite(String(args.filePath || ''), String(args.content || ''));
    case 'Edit': return execEdit(String(args.filePath || ''), String(args.oldString || ''), String(args.newString || ''), args.replaceAll === true);
    case 'Glob': return execGlob(String(args.pattern || ''), args.root ? String(args.root) : undefined);
    case 'Grep': return execGrep(String(args.pattern || ''), args.include ? String(args.include) : undefined, args.path ? String(args.path) : undefined);
    case 'WebFetch': return await execWebFetch(String(args.url || ''), args.format ? String(args.format) : undefined);
    case 'TodoWrite': return execTodoWrite(Array.isArray(args.todos) ? args.todos : []);
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
        const handler = msg => {
          if (msg.type === 'questionAnswer') {
            panel.webview.onDidReceiveMessage(msg => {});
            resolve(msg.answer);
          }
        };
        // Use a one-time listener approach - store resolve and handle in message handler
        panel._questionResolve = resolve;
      });
      return `[ANSWER] ${answer}`;
    }
    default: return 'Unknown tool: ' + name;
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
  ].join('\n');

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const stream = client.messages.stream({
      model: getModel(),
      max_tokens: Number(process.env['CODEYANG_MAX_TOKENS'] || '8192'),
      system: systemPrompt,
      messages,
      tools: toolDefinitions,
    });

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
          panel.webview.postMessage({ type: 'done' });
        } catch (err) {
          const errMsg = err.message || String(err);
          if (errMsg.includes('401') || errMsg.includes('authentication') || errMsg.includes('api key')) {
            panel.webview.postMessage({ type: 'error', message: 'Invalid API key. Please check your Anthropic API key and try again.' });
            panel.webview.postMessage({ type: 'showSetup' });
          } else {
            panel.webview.postMessage({ type: 'error', message: errMsg });
          }
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
