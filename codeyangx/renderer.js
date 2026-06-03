/**
 * CodeYangX — Renderer Process
 * Chat UI, markdown rendering, streaming agent loop, tool call display.
 * All tool execution is delegated to the main process via IPC.
 */
const { codeyangx } = window;

// ═══════════════════════════════════════════════════════════════════════════════
// State
// ═══════════════════════════════════════════════════════════════════════════════

let apiKey = null;
let currentDir = null;
let isProcessing = false;
let pendingQuestion = null;
let abortController = null;
let mcpTools = [];           // Dynamic MCP tool schemas
let mcpInitialized = false;  // Whether MCP servers are connected

// ═══════════════════════════════════════════════════════════════════════════════
// DOM Elements
// ═══════════════════════════════════════════════════════════════════════════════

const $setup = document.getElementById('setup');
const $app = document.getElementById('app');
const $chat = document.getElementById('chat');
const $input = document.getElementById('input');
const $sendBtn = document.getElementById('sendBtn');
const $status = document.getElementById('status');
const $currentDir = document.getElementById('currentDir');
const $welcome = document.getElementById('welcome');

// ═══════════════════════════════════════════════════════════════════════════════
// Init
// ═══════════════════════════════════════════════════════════════════════════════

async function init() {
  apiKey = await codeyangx.getApiKey();
  currentDir = await codeyangx.getWorkingDir();
  if (currentDir) $currentDir.textContent = currentDir;
  showApp();
}

function showApp() {
  $setup.classList.add('hidden');
  $app.classList.remove('hidden');
  $input.disabled = false;
  $sendBtn.disabled = false;
  $input.focus();

  if (!apiKey) {
    var warnEl = document.getElementById('welcome');
    if (warnEl) {
      warnEl.innerHTML = '<div style="font-size:40px;margin-bottom:12px;">></div>' +
        '<div style="font-size:16px;color:var(--yellow);font-weight:600;">No API Key Configured</div>' +
        '<div style="margin-top:8px;font-size:13px;">Set ANTHROPIC_API_KEY environment variable or save key in ~/.codeyang/config.json</div>' +
        '<div style="margin-top:12px;font-size:13px;">Or type your key below to save it:</div>';
    }
    $input.placeholder = 'Paste your Anthropic API key (sk-ant-...) to save it...';
    $status.textContent = 'Enter API key to start';
  } else {
    // Initialize MCP servers in background
    initMcpServers();
  }
}

/** Initialize MCP servers and register their tools */
async function initMcpServers() {
  try {
    const result = await codeyangx.mcpInit();
    if (result && result.tools && result.tools.length > 0) {
      mcpTools = result.tools.map(function (t) {
        return {
          name: t.qualifiedName,
          description: '[MCP:' + t.serverName + '] ' + t.description,
          input_schema: t.inputSchema || { type: 'object', properties: {} },
        };
      });
      mcpInitialized = true;
    }
    if (result && result.status) {
      var logParts = [];
      for (var name in result.status) {
        var s = result.status[name];
        logParts.push(name + ': ' + (s.connected ? s.toolCount + ' tools' : 'ERROR: ' + s.error));
      }
      if (logParts.length > 0) {
        $status.textContent = 'MCP: ' + logParts.join(' | ');
        setTimeout(function () { $status.textContent = ''; }, 5000);
      }
    }
  } catch {
    // MCP might not be configured — that's fine
  }
}

async function saveKey() {
  const key = document.getElementById('apiKeyInput').value.trim();
  if (!key) return;
  await codeyangx.saveApiKey(key);
  apiKey = key;
  showApp();
}

// ═══════════════════════════════════════════════════════════════════════════════
// Directory
// ═══════════════════════════════════════════════════════════════════════════════

async function selectDirectory() {
  const dir = await codeyangx.selectDirectory();
  if (dir) {
    currentDir = dir;
    $currentDir.textContent = dir;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Chat Management
// ═══════════════════════════════════════════════════════════════════════════════

function clearChat() {
  const kids = Array.from($chat.children);
  for (const child of kids) {
    if (child.id !== 'welcome') child.remove();
  }
  $welcome && $welcome.classList.remove('hidden');
}

function addUserMessage(text) {
  if ($welcome) $welcome.classList.add('hidden');
  const div = document.createElement('div');
  div.className = 'message user-msg';
  div.innerHTML = '<div class="bubble">' + escapeHtml(text) + '</div>';
  $chat.appendChild(div);
  $chat.scrollTop = $chat.scrollHeight;
}

function createAssistantBlock() {
  if ($welcome) $welcome.classList.add('hidden');
  const div = document.createElement('div');
  div.className = 'message assistant-msg';
  div.innerHTML = '<div class="content"></div>';
  $chat.appendChild(div);
  return div.querySelector('.content');
}

function createToolBlock(name, args) {
  const block = document.createElement('div');
  block.className = 'tool-block open';
  block.innerHTML =
    '<div class="tool-header" onclick="this.parentElement.classList.toggle(\'open\')">' +
    '<span> > </span><span class="name">' + escapeHtml(name) + '</span>' +
    '<span style="color:var(--text2);font-size:11px">' + escapeHtml(JSON.stringify(args || {}).slice(0, 100)) + '</span>' +
    '</div>' +
    '<div class="tool-body"><pre></pre></div>';
  $chat.appendChild(block);
  return { block, pre: block.querySelector('pre') };
}

// ═══════════════════════════════════════════════════════════════════════════════
// Markdown Rendering
// ═══════════════════════════════════════════════════════════════════════════════

function renderMarkdown(text) {
  let html = text;

  // Code blocks
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, function (_, lang, code) {
    return '<div class="code-block"><div class="lang">' + (lang || 'code') + '</div><pre>' + escapeHtml(code.trim()) + '</pre></div>';
  });

  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

  // Bold / Italic
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

  // Headers
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');

  // Horizontal rules
  html = html.replace(/^---$/gm, '<hr style="border:0;border-top:1px solid var(--border);margin:12px 0">');

  // Tables
  html = html.replace(/\|(.+)\|\n\|[-|\s]+\|\n((?:\|.+\|\n?)*)/g, function (_, header, rows) {
    const hCells = header.split('|').filter(function (c) { return c.trim(); });
    const rLines = rows.trim().split('\n').filter(function (r) { return r.trim(); });
    var table = '<table><thead><tr>';
    hCells.forEach(function (h) { table += '<th>' + h.trim() + '</th>'; });
    table += '</tr></thead><tbody>';
    rLines.forEach(function (r) {
      table += '<tr>';
      r.split('|').filter(function (c) { return c.trim() !== ''; }).forEach(function (c) { table += '<td>' + c.trim() + '</td>'; });
      table += '</tr>';
    });
    table += '</tbody></table>';
    return table;
  });

  // Lists
  html = html.replace(/^[\t ]*- (.+)$/gm, '<li>$1</li>');
  html = html.replace(/((?:<li>.*<\/li>\n?)+)/g, '<ul>$1</ul>');

  // Blockquotes
  html = html.replace(/^> (.+)$/gm, '<blockquote style="border-left:3px solid var(--accent);padding:4px 12px;margin:4px 0;color:var(--text2)">$1</blockquote>');

  // Links
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>');

  // Line breaks
  html = html.replace(/\n\n/g, '</p><p>');
  html = html.replace(/\n/g, '<br>');
  if (!html.startsWith('<')) html = '<p>' + html + '</p>';

  return html;
}

function appendText(el, text) {
  el.innerHTML = el.innerHTML + renderMarkdown(text);
  $chat.scrollTop = $chat.scrollHeight;
}

function setContent(el, text) {
  el.innerHTML = renderMarkdown(text);
  $chat.scrollTop = $chat.scrollHeight;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Streaming Agent Loop
// ═══════════════════════════════════════════════════════════════════════════════

async function sendMessage(userText) {
  if (isProcessing) return;

  // If no API key yet, treat first input as API key
  if (!apiKey) {
    if (userText.startsWith('sk-ant-')) {
      await codeyangx.saveApiKey(userText.trim());
      apiKey = userText.trim();
      $input.placeholder = 'Type your message...';
      $status.textContent = 'API key saved. Ready.';
      var welEl = document.getElementById('welcome');
      if (welEl) {
        welEl.innerHTML = '<div style="font-size:40px;margin-bottom:12px;">></div>' +
          '<div style="font-size:16px;color:var(--accent);font-weight:600;">CodeYangX Ready</div>' +
          '<div style="margin-top:8px;font-size:13px;">Ask me anything about your code.</div>';
      }
      initMcpServers();
    } else {
      $status.textContent = 'Invalid API key format. Should start with sk-ant-';
    }
    return;
  }

  isProcessing = true;
  $sendBtn.disabled = true;
  $status.textContent = 'Thinking...';

  abortController = new AbortController();
  addUserMessage(userText);
  const contentEl = createAssistantBlock();

  const messages = [
    { role: 'user', content: userText }
  ];

  const tools = getToolSchemas();

  try {
    let continueLoop = true;
    let turn = 0;
    const MAX_TURNS = 20;
    let lastText = '';
    let repeatCount = 0;

    while (continueLoop && turn < MAX_TURNS) {
      turn++;

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-beta': 'tools-2024-04-04',
        },
        body: JSON.stringify({
          model: await codeyangx.getModel(),
          max_tokens: 8192,
          temperature: 0.5,
          system: getSystemPrompt(),
          messages,
          tools,
          stream: true,
        }),
        signal: abortController.signal,
      });

      if (!response.ok) {
        const err = await response.json().catch(function () { return {}; });
        if (response.status === 401) {
          appendText(contentEl, '\n\n**Error**: Invalid API key. Please restart and re-enter your key.');
          apiKey = null;
        } else {
          appendText(contentEl, '\n\n**Error**: HTTP ' + response.status + ' — ' + (err.error && err.error.message ? err.error.message : 'Unknown error'));
        }
        break;
      }

      // Parse SSE stream
      const streamResult = await parseSSEStream(response);
      const { textBlocks, toolCalls, assistantText } = streamResult;

      // Anti-repetition check
      if (assistantText && assistantText === lastText) {
        repeatCount++;
        if (repeatCount >= 1) {
          appendText(contentEl, '\n\n*Agent loop detected — stopping to avoid repetition.*');
          break;
        }
      } else {
        repeatCount = 0;
      }
      lastText = assistantText;

      // Build assistant content for messages
      const assistantContent = [];
      for (const b of textBlocks) {
        if (b.type === 'text') {
          assistantContent.push({ type: 'text', text: b.text || '' });
        }
      }
      for (const tc of toolCalls) {
        assistantContent.push({ type: 'tool_use', id: tc.id, name: tc.name, input: tc.input });
      }

      messages.push({ role: 'assistant', content: assistantContent });

      if (toolCalls.length === 0) {
        continueLoop = false;
        $status.textContent = 'Done.';
        break;
      }

      // Execute tools — parallel, but Question first
      const toolResults = new Array(toolCalls.length);
      const toolResultIds = new Array(toolCalls.length);

      // Handle Question + Task tools first (they block or take extra time)
      for (let i = 0; i < toolCalls.length; i++) {
        const tc = toolCalls[i];
        toolResultIds[i] = tc.id;
        if (tc.name === 'Question') {
          const q = String(tc.input.question || '');
          const opts = Array.isArray(tc.input.options) ? tc.input.options : null;
          const answer = await askQuestion(q, opts);
          toolResults[i] = { type: 'tool_result', tool_use_id: tc.id, content: answer };
        } else if (tc.name === 'Task') {
          const desc = String(tc.input.description || '');
          const prompt = String(tc.input.prompt || '');
          if (!prompt) {
            toolResults[i] = { type: 'tool_result', tool_use_id: tc.id, content: 'Task requires a prompt parameter.' };
            continue;
          }
          const { block, pre } = createToolBlock('Task: ' + desc, {});
          pre.textContent = 'Running sub-agent...';
          $status.textContent = 'Sub-agent working...';
          try {
            const model = await codeyangx.getModel();
            const output = await codeyangx.executeSubAgent(apiKey, model, desc, prompt, currentDir);
            pre.textContent = output;
            toolResults[i] = { type: 'tool_result', tool_use_id: tc.id, content: output };
            $status.textContent = 'Sub-agent done.';
          } catch (err) {
            pre.textContent = 'Error: ' + (err.message || String(err));
            pre.style.color = 'var(--red)';
            toolResults[i] = { type: 'tool_result', tool_use_id: tc.id, content: 'Error: ' + (err.message || String(err)) };
          }
        }
      }

      // Execute non-Question, non-Task tools via IPC (parallel)
      const parallelTasks = toolCalls.map(async function (tc, i) {
        if (tc.name === 'Question' || tc.name === 'Task') return;

        toolResultIds[i] = tc.id;
        const { block, pre } = createToolBlock(tc.name, tc.input);

        try {
          const output = await codeyangx.executeTool(tc.name, tc.input, currentDir);
          pre.textContent = output;
          toolResults[i] = { type: 'tool_result', tool_use_id: tc.id, content: output };
        } catch (err) {
          pre.textContent = 'Error: ' + (err.message || String(err));
          pre.style.color = 'var(--red)';
          toolResults[i] = { type: 'tool_result', tool_use_id: tc.id, content: 'Error: ' + (err.message || String(err)) };
        }
      });

      await Promise.all(parallelTasks);

      // Push tool results into messages
      const resultContent = toolResults.map(function (tr, i) {
        return {
          type: 'tool_result',
          tool_use_id: toolResultIds[i] || 'unknown',
          content: tr ? tr.content : '',
          is_error: false,
        };
      });

      messages.push({ role: 'user', content: resultContent });
    }
  } catch (err) {
    if (err.name !== 'AbortError') {
      appendText(contentEl, '\n\n**Error**: ' + (err.message || 'Unknown error'));
      $status.textContent = 'Error';
    }
  }

  isProcessing = false;
  $sendBtn.disabled = false;
  $input.focus();
}

// ═══════════════════════════════════════════════════════════════════════════════
// SSE Streaming Parser
// ═══════════════════════════════════════════════════════════════════════════════

async function parseSSEStream(response) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const textBlocks = [];      // { type, text }
  const toolCalls = [];       // { id, name, input }
  let currentBlock = null;
  let currentBlockIdx = -1;
  let buffer = '';
  let textAccum = [];

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    // Keep the last partial line
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const jsonStr = line.slice(6);
      if (jsonStr === '[DONE]') continue;

      let event;
      try { event = JSON.parse(jsonStr); }
      catch { continue; }

      switch (event.type) {
        case 'content_block_start': {
          const block = event.content_block;
          if (!block) break;
          currentBlockIdx = event.index;
          textBlocks[currentBlockIdx] = block;
          currentBlock = block;

          if (block.type === 'text') {
            textBlocks[currentBlockIdx].text = '';
          } else if (block.type === 'tool_use') {
            textBlocks[currentBlockIdx].input_json = '';
          }
          break;
        }

        case 'content_block_delta': {
          const delta = event.delta;
          if (!delta) break;

          if (delta.type === 'text_delta' && delta.text) {
            // Live text rendering
            const container = document.querySelector('.assistant-msg:last-of-type .content');
            if (container) {
              container.innerHTML = container.innerHTML + renderMarkdown(delta.text);
              $chat.scrollTop = $chat.scrollHeight;
            }
            textAccum.push(delta.text);
            if (textBlocks[currentBlockIdx] && textBlocks[currentBlockIdx].type === 'text') {
              textBlocks[currentBlockIdx].text = (textBlocks[currentBlockIdx].text || '') + delta.text;
            }
          } else if (delta.type === 'input_json_delta' && delta.partial_json) {
            if (currentBlock && currentBlock.type === 'tool_use') {
              currentBlock.input_json = (currentBlock.input_json || '') + delta.partial_json;
            }
          }
          break;
        }

        case 'content_block_stop': {
          if (currentBlock && currentBlock.type === 'tool_use') {
            try {
              currentBlock.input = JSON.parse(currentBlock.input_json || '{}');
              toolCalls.push({
                id: currentBlock.id,
                name: currentBlock.name,
                input: currentBlock.input,
              });
            } catch (e) {
              currentBlock.input = {};
              toolCalls.push({
                id: currentBlock.id,
                name: currentBlock.name,
                input: {},
              });
            }
          }
          currentBlock = null;
          currentBlockIdx = -1;
          break;
        }

        case 'message_stop':
          break;
      }
    }
  }

  return {
    textBlocks,
    toolCalls,
    assistantText: textAccum.join(''),
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// Question Dialog
// ═══════════════════════════════════════════════════════════════════════════════

function askQuestion(q, opts) {
  return new Promise(function (resolve) {
    if (opts && opts.length > 0) {
      const optHtml = opts.map(function (o, i) {
        return (i + 1) + '. **' + o.label + '** — ' + o.description;
      }).join('\n');
      appendText(createAssistantBlock(), '**Question**: ' + q + '\n\n' + optHtml + '\n\n*Reply with the option number or your answer...*');
    } else {
      appendText(createAssistantBlock(), '**Question**: ' + q + '\n\n*Type your answer...*');
    }
    pendingQuestion = resolve;
    $input.placeholder = 'Answer the question...';
    $input.focus();
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// Tool Schemas — all 28 tools
// ═══════════════════════════════════════════════════════════════════════════════

function getToolSchemas() {
  var schemas = [
    // ── Core tools ──
    {
      name: 'Bash', description: 'Execute a shell command. Use for running code, tests, file operations, etc.',
      input_schema: { type: 'object', properties: { command: { type: 'string', description: 'The command to execute' }, cwd: { type: 'string', description: 'Working directory (optional)' } }, required: ['command'] },
    },
    {
      name: 'Read', description: 'Read the contents of a file or list a directory. For files, optionally specify offset and limit for large files.',
      input_schema: { type: 'object', properties: { filePath: { type: 'string', description: 'Path to the file' }, offset: { type: 'number', description: 'Starting line (0-indexed)' }, limit: { type: 'number', description: 'Number of lines to read' } }, required: ['filePath'] },
    },
    {
      name: 'Write', description: 'Write content to a file. Creates parent directories if needed.',
      input_schema: { type: 'object', properties: { filePath: { type: 'string', description: 'Path to the file' }, content: { type: 'string', description: 'Content to write' } }, required: ['filePath', 'content'] },
    },
    {
      name: 'Edit', description: 'Edit a file by replacing exact text. Use for surgical code changes.',
      input_schema: { type: 'object', properties: { filePath: { type: 'string' }, oldString: { type: 'string' }, newString: { type: 'string' }, replaceAll: { type: 'boolean' } }, required: ['filePath', 'oldString', 'newString'] },
    },
    {
      name: 'Glob', description: 'Search for files matching a glob pattern (e.g. "**/*.ts").',
      input_schema: { type: 'object', properties: { pattern: { type: 'string' }, root: { type: 'string' } }, required: ['pattern'] },
    },
    {
      name: 'Grep', description: 'Search file contents for a regex pattern.',
      input_schema: { type: 'object', properties: { pattern: { type: 'string' }, include: { type: 'string' }, path: { type: 'string' } }, required: ['pattern'] },
    },
    {
      name: 'TodoWrite', description: 'Create and maintain a structured task list.',
      input_schema: { type: 'object', properties: { todos: { type: 'array', items: { type: 'object', properties: { content: { type: 'string' }, status: { type: 'string', enum: ['pending', 'in_progress', 'completed', 'cancelled'] }, priority: { type: 'string', enum: ['high', 'medium', 'low'] } }, required: ['content', 'status', 'priority'] } } }, required: ['todos'] },
    },
    {
      name: 'WebFetch', description: 'Fetches content from a specified URL and returns it as text.',
      input_schema: { type: 'object', properties: { url: { type: 'string' }, format: { type: 'string', enum: ['text', 'html'] } }, required: ['url'] },
    },
    {
      name: 'Question', description: 'Ask the user a question when you need clarification or a decision.',
      input_schema: { type: 'object', properties: { question: { type: 'string' }, options: { type: 'array', items: { type: 'object', properties: { label: { type: 'string' }, description: { type: 'string' } }, required: ['label', 'description'] } } }, required: ['question'] },
    },
    {
      name: 'Task', description: 'Launch a sub-agent to handle complex, multi-step tasks autonomously. Use for independent subtasks (code research, search, file analysis) that can run without shared state.',
      input_schema: { type: 'object', properties: { description: { type: 'string', description: 'Short name for this sub-agent task' }, prompt: { type: 'string', description: 'Detailed instructions for the sub-agent' } }, required: ['description', 'prompt'] },
    },

    // ── Math tools ──
    {
      name: 'MathSolve', description: 'Solve middle school math problems step by step. Covers: linear/quadratic equations, systems, Pythagorean theorem, circle geometry, statistics, percentages, trig, sequences, coordinate geometry.',
      input_schema: { type: 'object', properties: { problem: { type: 'string', description: 'The math problem to solve' }, type: { type: 'string', enum: ['linear', 'quadratic', 'system', 'pythagorean', 'circle', 'stats', 'percent', 'trig', 'sequence', 'coord'], description: 'Problem type (auto-detected if not specified)' } }, required: ['problem'] },
    },
    {
      name: 'MathPlot', description: 'Generate SVG mathematical diagrams. Supports: coordinate plane, function graphs, bar charts, pie charts, scatter plots.',
      input_schema: { type: 'object', properties: { kind: { type: 'string', description: 'Plot kind: coordinate, func:<expr>, bar:<data>, pie:<data>, scatter:<data>' }, output: { type: 'string', description: 'Output filename (optional)' } }, required: ['kind'] },
    },
    {
      name: 'MathExplain', description: 'Reference for Chinese middle school math concepts with formulas, examples, and common mistakes. Topics: equations, functions, geometry, statistics, probability.',
      input_schema: { type: 'object', properties: { topic: { type: 'string', description: 'Topic name (Chinese or English). Omit to list all topics.' } }, required: [] },
    },

    // ── Qt tools ──
    {
      name: 'QtBuild', description: 'Build the current Qt project. Detects the build system automatically and provides Qt-specific diagnostics.',
      input_schema: { type: 'object', properties: { target: { type: 'string', description: 'Build target name (default: all)' }, buildSystem: { type: 'string', enum: ['qmake', 'cmake', 'auto'] }, cwd: { type: 'string' } }, required: [] },
    },
    {
      name: 'QtSignals', description: 'Analyze signal-slot connections in the Qt project. Finds connect() calls, detects old-style macros, identifies auto-connections.',
      input_schema: { type: 'object', properties: { cwd: { type: 'string' } }, required: [] },
    },
    {
      name: 'QtProFile', description: 'Read and analyze a .pro (qmake project) file. Lists Qt modules, sources, headers, forms, and resources.',
      input_schema: { type: 'object', properties: { proPath: { type: 'string', description: 'Path to the .pro file' } }, required: [] },
    },
    {
      name: 'QtMigration', description: 'Analyze Qt5 code for Qt6 compatibility issues. Provides migration guidance for 30+ common API changes.',
      input_schema: { type: 'object', properties: { cwd: { type: 'string' } }, required: [] },
    },
    {
      name: 'QtUi', description: 'Analyze a .ui form file. Shows widget tree, layouts, connections, and properties.',
      input_schema: { type: 'object', properties: { filePath: { type: 'string', description: 'Path to the .ui file' } }, required: ['filePath'] },
    },
    {
      name: 'QtQml', description: 'Analyze a QML file. Lists imports, components, IDs, signals, and properties.',
      input_schema: { type: 'object', properties: { filePath: { type: 'string', description: 'Path to the .qml file' } }, required: ['filePath'] },
    },
    {
      name: 'QtTestGen', description: 'Generate QTest boilerplate from C++ headers.',
      input_schema: { type: 'object', properties: { filePath: { type: 'string', description: 'Path to C++ header or source directory' } }, required: ['filePath'] },
    },
    {
      name: 'QtTestRunner', description: 'Run QTest test targets and parse XML output for results.',
      input_schema: { type: 'object', properties: { target: { type: 'string', description: 'Test target name' } }, required: [] },
    },
    {
      name: 'QtCoverage', description: 'Analyze test coverage gaps between test files and source files.',
      input_schema: { type: 'object', properties: { cwd: { type: 'string' } }, required: [] },
    },
    {
      name: 'QtGraphics', description: 'QPainter and QGraphicsView best practices and anti-pattern reference.',
      input_schema: { type: 'object', properties: { cwd: { type: 'string' } }, required: [] },
    },
    {
      name: 'QtCharts', description: 'Qt Charts code reference and generator for common chart types.',
      input_schema: { type: 'object', properties: { kind: { type: 'string', enum: ['line', 'bar', 'pie', 'scatter'] } }, required: [] },
    },
    {
      name: 'QtMath', description: 'Qt math utilities reference (QtMath, qSin, qCos, etc.) with optional expression evaluation.',
      input_schema: { type: 'object', properties: { expr: { type: 'string', description: 'Math expression to evaluate' } }, required: [] },
    },
    {
      name: 'QtModelView', description: 'Qt Model/View architecture guide with best practices and anti-patterns.',
      input_schema: { type: 'object', properties: { cwd: { type: 'string' } }, required: [] },
    },
    {
      name: 'QtThread', description: 'Qt threading and concurrency best practices with moveToThread() patterns.',
      input_schema: { type: 'object', properties: { cwd: { type: 'string' } }, required: [] },
    },
  ];

  // Append MCP tools dynamically
  for (var i = 0; i < mcpTools.length; i++) {
    schemas.push(mcpTools[i]);
  }

  return schemas;
}

function getSystemPrompt() {
  return [
    'You are CodeYangX, an AI coding agent in a desktop application powered by Claude.',
    'Help users with coding, debugging, explanation, and code modification.',
    '',
    '## Available Tools',
    'You have access to these tool categories:',
    '- **Core**: Bash, Read, Write, Edit, Glob, Grep, TodoWrite, WebFetch, Question',
    '- **Task**: Launch sub-agents to handle complex, multi-step work autonomously',
    '- **Math**: MathSolve (solver), MathPlot (charts), MathExplain (reference)',
    '- **Qt**: QtBuild, QtSignals, QtProFile, QtMigration, QtUi, QtQml, QtTestGen, QtTestRunner, QtCoverage, QtGraphics, QtCharts, QtMath, QtModelView, QtThread',
    mcpTools.length > 0 ? '- **MCP**: ' + mcpTools.length + ' external tools from configured servers' : '',
    '',
    '## Guidelines',
    '- Be concise but thorough. Use markdown for code blocks and formatting.',
    '- When making file changes, use Edit for surgical changes (preferred) or Write for full rewrites.',
    '- Use Bash to run commands, build projects, run tests.',
    '- Use Grep to search code, Glob to find files.',
    '- Use the Task tool to delegate complex subtasks to sub-agents.',
    '- Create todo lists with TodoWrite for multi-step tasks.',
    currentDir ? 'Working directory: ' + currentDir : '',
  ].filter(Boolean).join('\n');
}

// ═══════════════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════════════

function escapeHtml(text) {
  return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ═══════════════════════════════════════════════════════════════════════════════
// Input Handling
// ═══════════════════════════════════════════════════════════════════════════════

$input.addEventListener('keydown', function (e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    const text = $input.value.trim();
    if (!text) return;
    $input.value = '';

    if (pendingQuestion) {
      pendingQuestion(text);
      pendingQuestion = null;
      $input.placeholder = 'Type your message...';
      return;
    }

    sendMessage(text);
  }
});

$sendBtn.addEventListener('click', function () {
  const text = $input.value.trim();
  if (!text) return;
  $input.value = '';
  if (pendingQuestion) {
    pendingQuestion(text);
    pendingQuestion = null;
    $input.placeholder = 'Type your message...';
    return;
  }
  sendMessage(text);
});

// Auto-resize textarea
$input.addEventListener('input', function () {
  $input.style.height = 'auto';
  $input.style.height = Math.min($input.scrollHeight, 150) + 'px';
});

// ═══════════════════════════════════════════════════════════════════════════════
// Global Functions
// ═══════════════════════════════════════════════════════════════════════════════

window.selectDirectory = selectDirectory;
window.clearChat = clearChat;

// ═══════════════════════════════════════════════════════════════════════════════
// Start
// ═══════════════════════════════════════════════════════════════════════════════

init();
