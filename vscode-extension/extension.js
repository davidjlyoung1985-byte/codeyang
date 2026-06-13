const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');
const https = require('https');

const {
  executeRead: _executeRead,
  executeWrite: _executeWrite,
  executeEdit: _executeEdit,
  executeGlob: _executeGlob,
  executeGrep: _executeGrep,
  executeWebFetch: _executeWebFetch,
  executeTodoWrite: _executeTodoWrite,
  executeSearch: _executeSearch,
  executeImageInfo: _executeImageInfo,
  executeImageToBase64: _executeImageToBase64,
  executeListImages: _executeListImages,
} = require('./tools.cjs');

// ─── Provider-agnostic config ──────────────────────────────────────

const SUPPORTED_PROVIDERS = {
  deepseek: {
    name: 'DeepSeek',
    baseURL: 'https://api.deepseek.com/v1',
    defaultModel: 'deepseek-chat',
    apiKeyEnvVars: ['CODEYANG_API_KEY', 'DEEPSEEK_API_KEY'],
    type: 'openai',
  },
  deepseek_anthropic: {
    name: 'DeepSeek (Anthropic API)',
    baseURL: 'https://api.deepseek.com/anthropic',
    defaultModel: 'deepseek-v4-pro',
    apiKeyEnvVars: ['CODEYANG_API_KEY', 'DEEPSEEK_API_KEY'],
    type: 'anthropic',
  },
  anthropic: {
    name: 'Anthropic',
    baseURL: 'https://api.anthropic.com',
    defaultModel: 'claude-sonnet-4-20250514',
    apiKeyEnvVars: ['ANTHROPIC_API_KEY'],
    type: 'anthropic',
  },
};

function getApiKey() {
  const cfgKey = vscode.workspace.getConfiguration('codeyang').get('apiKey', '');
  if (cfgKey) return cfgKey;
  for (const envVar of ['CODEYANG_API_KEY', 'DEEPSEEK_API_KEY', 'ANTHROPIC_API_KEY']) {
    if (process.env[envVar]) return process.env[envVar];
  }
  try {
    const cfgPath = path.join(os.homedir(), '.codeyang', 'config.json');
    const data = JSON.parse(fs.readFileSync(cfgPath, 'utf-8'));
    if (data.apiKey) return data.apiKey;
  } catch {}
  return null;
}

function getProviderType() {
  const baseUrl = getApiBaseUrl();
  const model = getModel();
  // DeepSeek's Anthropic API endpoint
  if (baseUrl && baseUrl.includes('api.deepseek.com/anthropic')) return 'anthropic';
  // Official Anthropic API
  if (baseUrl && (baseUrl.includes('anthropic') || baseUrl.includes('api.anthropic.com'))) return 'anthropic';
  // Model-based detection (deepseek-v4-* uses Anthropic format, claude-* also)
  if (model && (model.startsWith('deepseek-v4-') || model.includes('claude'))) return 'anthropic';
  return 'openai';
}

function getApiBaseUrl() {
  const cfgBase = vscode.workspace.getConfiguration('codeyang').get('apiBaseUrl', '');
  if (cfgBase) return cfgBase;
  if (process.env['CODEYANG_BASE_URL']) return process.env['CODEYANG_BASE_URL'];
  try {
    const cfgPath = path.join(os.homedir(), '.codeyang', 'config.json');
    const data = JSON.parse(fs.readFileSync(cfgPath, 'utf-8'));
    if (data.apiBaseUrl) return data.apiBaseUrl;
  } catch {}
  return 'https://api.deepseek.com/anthropic';
}

function getModel() {
  return vscode.workspace.getConfiguration('codeyang').get('model', '') ||
    process.env['CODEYANG_MODEL'] ||
    'deepseek-v4-pro';
}

async function saveApiKey(key, baseUrl, model) {
  await vscode.workspace.getConfiguration('codeyang').update('apiKey', key, true);
  if (baseUrl) {
    await vscode.workspace.getConfiguration('codeyang').update('apiBaseUrl', baseUrl, true);
  }
  if (model) {
    await vscode.workspace.getConfiguration('codeyang').update('model', model, true);
  }
  const dir = path.join(os.homedir(), '.codeyang');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const config = { apiKey: key };
  if (baseUrl) config.apiBaseUrl = baseUrl;
  if (model) config.model = model;
  fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify(config, null, 2));
}

// ─── Helpers ───────────────────────────────────────────────────────

function getWorkspaceRoot() {
  const folders = vscode.workspace.workspaceFolders;
  return folders && folders.length > 0 ? folders[0].uri.fsPath : process.cwd();
}

// ─── Tools ─────────────────────────────────────────────────────────

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

async function execSearch(query, rootDir, opts) {
  const resolved = rootDir ? (path.isAbsolute(rootDir) ? rootDir : path.join(getWorkspaceRoot(), rootDir)) : getWorkspaceRoot();
  return _executeSearch(query, resolved, opts || {});
}

async function execImageInfo(filePath) {
  const resolved = path.isAbsolute(filePath) ? filePath : path.join(getWorkspaceRoot(), filePath);
  return _executeImageInfo(resolved);
}

async function execImageToBase64(filePath, maxBytes) {
  const resolved = path.isAbsolute(filePath) ? filePath : path.join(getWorkspaceRoot(), filePath);
  return _executeImageToBase64(resolved, maxBytes);
}

async function execListImages(dirPath) {
  const resolved = path.isAbsolute(dirPath) ? dirPath : path.join(getWorkspaceRoot(), dirPath);
  return _executeListImages(resolved);
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

// ─── Tool Definitions ──────────────────────────────────────────────

const toolDefinitions = [
  { name: 'Bash', description: 'Execute a shell command.', input_schema: { type: 'object', properties: { command: { type: 'string', description: 'Command to run' }, cwd: { type: 'string' } }, required: ['command'] } },
  { name: 'Read', description: 'Read a file or list a directory.', input_schema: { type: 'object', properties: { filePath: { type: 'string', description: 'File or directory path' }, offset: { type: 'number' }, limit: { type: 'number' } }, required: ['filePath'] } },
  { name: 'Write', description: 'Write content to a file.', input_schema: { type: 'object', properties: { filePath: { type: 'string', description: 'Path to the file' }, content: { type: 'string', description: 'Content to write' } }, required: ['filePath', 'content'] } },
  { name: 'Edit', description: 'Edit a file by replacing exact text.', input_schema: { type: 'object', properties: { filePath: { type: 'string', description: 'Path to the file' }, oldString: { type: 'string', description: 'Text to replace' }, newString: { type: 'string', description: 'Replacement text' }, replaceAll: { type: 'boolean' } }, required: ['filePath', 'oldString', 'newString'] } },
  { name: 'Glob', description: 'Search for files matching a glob pattern.', input_schema: { type: 'object', properties: { pattern: { type: 'string', description: 'Glob pattern' }, root: { type: 'string' } }, required: ['pattern'] } },
  { name: 'Grep', description: 'Search file contents for a regex pattern.', input_schema: { type: 'object', properties: { pattern: { type: 'string', description: 'Regex pattern' }, include: { type: 'string' }, path: { type: 'string' } }, required: ['pattern'] } },
  { name: 'WebFetch', description: 'Fetch content from a URL.', input_schema: { type: 'object', properties: { url: { type: 'string', description: 'URL to fetch' }, format: { type: 'string', enum: ['text', 'html'] } }, required: ['url'] } },
  { name: 'TodoWrite', description: 'Create and maintain a structured task list.', input_schema: { type: 'object', properties: { todos: { type: 'array', items: { type: 'object', properties: { content: { type: 'string' }, status: { type: 'string', enum: ['pending', 'in_progress', 'completed', 'cancelled'] }, priority: { type: 'string', enum: ['high', 'medium', 'low'] } }, required: ['content', 'status', 'priority'] }, description: 'The updated todo list' } }, required: ['todos'] } },
  { name: 'Question', description: 'Ask the user a question when you need clarification.', input_schema: { type: 'object', properties: { question: { type: 'string', description: 'The question to ask' }, options: { type: 'array', items: { type: 'object', properties: { label: { type: 'string' }, description: { type: 'string' } }, required: ['label', 'description'] }, description: 'Available choices' } }, required: ['question'] } },
  { name: 'Task', description: 'Launch a sub-agent for complex multi-step tasks.', input_schema: { type: 'object', properties: { description: { type: 'string', description: 'Brief description of the task' }, prompt: { type: 'string', description: 'Detailed prompt for the sub-agent' } }, required: ['description', 'prompt'] } },
  { name: 'Search', description: 'Search files by name and/or content.', input_schema: { type: 'object', properties: { query: { type: 'string', description: 'Search query' }, rootDir: { type: 'string' }, maxResults: { type: 'number' }, includeGlob: { type: 'string' }, searchContent: { type: 'boolean' }, searchNames: { type: 'boolean' } }, required: ['query'] } },
  { name: 'ImageInfo', description: 'Read image metadata.', input_schema: { type: 'object', properties: { filePath: { type: 'string' } }, required: ['filePath'] } },
  { name: 'ImageToBase64', description: 'Encode image to base64 data URI.', input_schema: { type: 'object', properties: { filePath: { type: 'string' }, maxBytes: { type: 'number' } }, required: ['filePath'] } },
  { name: 'ListImages', description: 'List image files in a directory.', input_schema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] } },
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
    case 'Task': return 'Sub-agent tasks are available in the CLI. Please execute directly using available tools.';
    case 'Search': return await execSearch(String(args.query || ''), args.rootDir ? String(args.rootDir) : undefined, { maxResults: args.maxResults, includeGlob: args.includeGlob, searchContent: args.searchContent, searchNames: args.searchNames });
    case 'ImageInfo': return await execImageInfo(String(args.filePath || ''));
    case 'ImageToBase64': return await execImageToBase64(String(args.filePath || ''), args.maxBytes);
    case 'ListImages': return await execListImages(String(args.path || ''));
    case 'Question': {
      const q = String(args.question || '');
      panel.webview.postMessage({ type: 'question', question: q, options: args.options || [] });
      const answer = await new Promise(resolve => { panel._questionResolve = resolve; });
      return `[ANSWER] ${answer}`;
    }
    default: return 'Unknown tool: ' + name;
  }
}

// ─── Retry ─────────────────────────────────────────────────────────

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

// ─── Session persistence ───────────────────────────────────────────

const SESSION_DIR = path.join(os.homedir(), '.codeyang', 'vscode-sessions');

function saveSession(messages) {
  if (messages.length === 0) return;
  try {
    if (!fs.existsSync(SESSION_DIR)) fs.mkdirSync(SESSION_DIR, { recursive: true });
    const firstUserMsg = messages.find(m => m.role === 'user');
    const title = firstUserMsg
      ? String(firstUserMsg.content || '').slice(0, 60).replace(/\n/g, ' ')
      : 'untitled';
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const session = {
      id, title,
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

// ─── Anthropic SSE stream helper ───────────────────────────────────

function anthropicStreamRequest(apiKey, baseURL, model, systemPrompt, messages, tools, onTextDelta) {
  return new Promise((resolve, reject) => {
    // Anthropic Messages API format: system is a top-level param, not a message
    const body = JSON.stringify({
      model,
      max_tokens: Number(process.env['CODEYANG_MAX_TOKENS'] || '8192'),
      temperature: 0.5,
      system: systemPrompt,
      messages,
      tools,
      stream: true,
    });

    const url = new URL(baseURL + '/v1/messages');
    const opts = {
      hostname: url.hostname,
      port: url.port || 443,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Length': Buffer.byteLength(body),
      },
    };

    const req = https.request(opts, (res) => {
      const blocks = [];       // content blocks indexed by position
      let currentEvent = '';
      let buffer = '';

      res.on('data', (chunk) => {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('event: ')) {
            currentEvent = line.slice(7).trim();
          } else if (line.startsWith('data: ')) {
            const dataStr = line.slice(6);
            try {
              const event = JSON.parse(dataStr);
              switch (event.type) {
                case 'content_block_start':
                  blocks[event.index] = event.content_block;
                  break;
                case 'content_block_delta':
                  if (event.delta.type === 'text_delta' && blocks[event.index]) {
                    blocks[event.index].text = (blocks[event.index].text || '') + event.delta.text;
                    if (onTextDelta) onTextDelta(event.delta.text);
                  } else if (event.delta.type === 'input_json_delta' && blocks[event.index]) {
                    blocks[event.index].input_json = (blocks[event.index].input_json || '') + event.delta.partial_json;
                  }
                  break;
                case 'content_block_stop':
                  if (blocks[event.index]?.type === 'tool_use') {
                    try { blocks[event.index].input = JSON.parse(blocks[event.index].input_json || '{}'); }
                    catch { blocks[event.index].input = {}; }
                  }
                  break;
              }
            } catch {}
          }
        }
      });

      res.on('end', () => {
        if (res.statusCode >= 400) {
          let errMsg = 'HTTP ' + res.statusCode;
          try {
            const err = JSON.parse(buffer);
            errMsg = err.error?.message || errMsg;
          } catch {}
          reject(new Error(errMsg));
          return;
        }
        const result = { blocks, textBlocks: [], toolCalls: [], assistantText: '' };
        for (const block of blocks) {
          if (!block) continue;
          if (block.type === 'text') {
            result.assistantText += (block.text || '');
            result.textBlocks.push({ type: 'text', text: block.text || '' });
          } else if (block.type === 'tool_use') {
            result.toolCalls.push({ id: block.id, name: block.name, input: block.input || {} });
          }
        }
        resolve(result);
      });
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ─── OpenAI-compatible SSE stream helper ───────────────────────────

function openaiStreamRequest(apiKey, baseURL, model, systemPrompt, messages, tools) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model,
      max_tokens: Number(process.env['CODEYANG_MAX_TOKENS'] || '8192'),
      temperature: 0.5,
      messages: [{ role: 'system', content: systemPrompt }, ...messages],
      tools,
      stream: true,
    });

    const url = new URL(baseURL + '/chat/completions');
    const opts = {
      hostname: url.hostname,
      port: url.port || 443,
      path: url.pathname + url.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + apiKey,
        'Content-Length': Buffer.byteLength(body),
      },
    };

    const req = https.request(opts, (res) => {
      const result = {
        textBlocks: [],
        toolCalls: [],
        assistantText: '',
      };

      let data = '';
      res.on('data', (chunk) => {
        data += chunk.toString();
        const lines = data.split('\n');
        data = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const jsonStr = line.slice(6).trim();
          if (!jsonStr || jsonStr === '[DONE]') continue;

          try {
            const event = JSON.parse(jsonStr);
            const choice = event.choices && event.choices[0];
            if (!choice) continue;

            const delta = choice.delta || {};
            if (delta.content) {
              result.textBlocks.push({ type: 'text', text: delta.content });
              result.assistantText += delta.content;
            }

            if (delta.tool_calls) {
              for (const tc of delta.tool_calls) {
                const idx = tc.index;
                if (!result.toolCalls[idx]) {
                  result.toolCalls[idx] = { id: tc.id || '', name: '', input: {}, _args: '' };
                }
                if (tc.function) {
                  if (tc.function.name) result.toolCalls[idx].name = tc.function.name;
                  if (tc.function.arguments) result.toolCalls[idx]._args += tc.function.arguments;
                }
              }
            }
          } catch {}
        }
      });

      res.on('end', () => {
        if (res.statusCode >= 400) {
          let errMsg = 'HTTP ' + res.statusCode;
          let fullError = data;
          try {
            const err = JSON.parse(data);
            errMsg = err.error?.message || err.error?.code || errMsg;
          } catch {}
          console.error('[CodeYang] API Error:', res.statusCode, fullError);
          console.error('[CodeYang] Request URL:', baseURL);
          console.error('[CodeYang] Model:', model);
          reject(new Error(errMsg + ' - ' + fullError));
          return;
        }
        // Finalize tool call arguments
        for (const tc of result.toolCalls) {
          if (tc && tc._args) {
            try { tc.input = JSON.parse(tc._args); } catch { tc.input = {}; }
            delete tc._args;
          }
        }
        resolve(result);
      });
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ─── Agent Loop ────────────────────────────────────────────────────

async function runAgent(apiKey, baseUrl, model, messages, panel) {
  const MAX_TURNS = 15;
  const provider = getProviderType();
  const systemPrompt = [
    'You are CodeYang, an AI coding agent inside VS Code.',
    'Help users with coding, debugging, code explanation, and project navigation.',
    'Use the available tools to read files, search code, run commands, write files, and more.',
    'Be concise but thorough. Use markdown formatting.',
    'Do not repeat yourself or restate the obvious — say it once and move on.',
    'Avoid filler and preamble — give the answer directly.',
  ].join('\n');

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    let contentBlocks;
    let toolCalls;
    let assistantText;

    if (provider === 'anthropic') {
      const result = await withRetry(
        () => anthropicStreamRequest(
          apiKey, baseUrl, model, systemPrompt, messages, toolDefinitions,
          (text) => panel.webview.postMessage({ type: 'append', content: text })
        ),
        'Anthropic streaming API',
      );

      contentBlocks = result.blocks;
      toolCalls = result.toolCalls;
      assistantText = result.assistantText;
    } else {
      const result = await withRetry(
        () => openaiStreamRequest(apiKey, baseUrl, model, systemPrompt, messages, toolDefinitions),
        'OpenAI streaming API',
      );

      toolCalls = result.toolCalls.filter(Boolean);
      assistantText = result.assistantText;

      // Send text back to webview in real-time
      if (result.textBlocks.length > 0) {
        for (const block of result.textBlocks) {
          if (block.type === 'text' && block.text) {
            panel.webview.postMessage({ type: 'append', content: block.text });
          }
        }
      }
    }

    const assistantContent = [];

    if (provider === 'anthropic') {
      for (const block of contentBlocks) {
        if (!block) continue;
        if (block.type === 'text') assistantContent.push({ type: 'text', text: block.text || '' });
        else if (block.type === 'tool_use') assistantContent.push({ type: 'tool_use', id: block.id, name: block.name, input: block.input || {} });
      }
    } else {
      if (assistantText) assistantContent.push({ type: 'text', text: assistantText });
      for (const tc of toolCalls) {
        assistantContent.push({ type: 'tool_use', id: tc.id, name: tc.name, input: tc.input });
      }
    }

    if (assistantContent.length === 0) break;
    messages.push({ role: 'assistant', content: assistantContent });
    if (toolCalls.length === 0) break;

    const toolResults = new Array(toolCalls.length);

    for (let i = 0; i < toolCalls.length; i++) {
      const tc = toolCalls[i];
      if (tc.name === 'Question') {
        const q = String(tc.input.question || '');
        panel.webview.postMessage({ type: 'question', question: q, options: tc.input.options || [] });
        const answer = await new Promise(resolve => { panel._questionResolve = resolve; });
        toolResults[i] = { type: 'tool_result', tool_use_id: tc.id, content: answer, is_error: false };
      }
    }

    await Promise.all(toolCalls.map(async (tc, i) => {
      if (tc.name === 'Question') return;
      panel.webview.postMessage({ type: 'toolCall', name: tc.name, args: JSON.stringify(tc.input).slice(0, 200) });
      try {
        const output = await executeTool(tc.name, tc.input, panel);
        toolResults[i] = { type: 'tool_result', tool_use_id: tc.id, content: output, is_error: false };
        panel.webview.postMessage({ type: 'toolResult', output: String(output).split('\n')[0]?.slice(0, 150) || '(empty)', isError: false });
      } catch (err) {
        const msg = err.message || String(err);
        toolResults[i] = { type: 'tool_result', tool_use_id: tc.id, content: msg, is_error: true };
        panel.webview.postMessage({ type: 'toolResult', output: msg.slice(0, 150), isError: true });
      }
    }));

    messages.push({ role: 'user', content: toolResults });
  }
}

// ─── Extension Activation ──────────────────────────────────────────

let panel = null;
let history = [];

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

  panel.onDidDispose(() => { panel = null; history = []; });

  panel.webview.onDidReceiveMessage(async (msg) => {
    if (msg.type === 'ready') {
      panel.webview.postMessage({ type: 'showSetup' });
      return;
    }

    if (msg.type === 'questionAnswer' && panel._questionResolve) {
      panel._questionResolve(msg.answer);
      panel._questionResolve = null;
      return;
    }

    switch (msg.type) {
      case 'setApiKey': {
        if (msg.key && msg.key.trim()) {
          const baseUrl = msg.baseUrl && msg.baseUrl.trim() ? msg.baseUrl.trim() : 'https://api.deepseek.com/anthropic';
          const model = msg.model && msg.model.trim() ? msg.model.trim() : 'deepseek-v4-pro';
          await saveApiKey(msg.key.trim(), baseUrl, model);
          panel.webview.postMessage({ type: 'apiKeySet' });
          vscode.window.showInformationMessage(`CodeYang: Connected to ${baseUrl} (${model})`);
        }
        break;
      }

      case 'chat': {
        const key = getApiKey();
        if (!key) {
          panel.webview.postMessage({ type: 'error', message: 'API key not configured. Please enter your API key above.' });
          return;
        }

        const userText = msg.text;
        history.push({ role: 'user', content: userText });
        panel.webview.postMessage({ type: 'addMessage', role: 'assistant', content: '' });

        try {
          const baseUrl = getApiBaseUrl();
          const model = getModel();
          const messages = history.slice();
          await runAgent(key, baseUrl, model, messages, panel);
          history = messages;
          saveSession(history);
          panel.webview.postMessage({ type: 'done' });
        } catch (err) {
          const errMsg = err.message || String(err);
          console.error('Agent error:', err);

          if (errMsg.includes('401') || errMsg.includes('authentication') || errMsg.includes('api key') || errMsg.includes('invalid_api_key')) {
            panel.webview.postMessage({ type: 'error', message: 'Invalid API key. Please check your API key and try again.' });
            panel.webview.postMessage({ type: 'showSetup' });
          } else if (errMsg.includes('503') || errMsg.includes('500') || errMsg.includes('Internal server error') || errMsg.includes('upstream_error')) {
            panel.webview.postMessage({ type: 'error', message: 'API server is temporarily unavailable. Please try again later.' });
          } else if (errMsg.includes('429') || errMsg.includes('rate_limit') || errMsg.includes('insufficient_quota')) {
            panel.webview.postMessage({ type: 'error', message: 'Rate limit exceeded or insufficient quota. Please wait and try again.' });
          } else if (errMsg.includes('Insufficient Balance') || errMsg.includes('insufficient_balance')) {
            panel.webview.postMessage({ type: 'error', message: 'Insufficient API balance. Please top up your account.' });
          } else if (errMsg.includes('ENOTFOUND') || errMsg.includes('ECONNREFUSED') || errMsg.includes('network')) {
            panel.webview.postMessage({ type: 'error', message: 'Network error: Cannot connect to API. Please check your internet connection and API base URL.' });
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
