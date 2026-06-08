const { codeyangx } = window;

let apiKey = null;
let providerConfig = null;
let currentDir = null;
let isProcessing = false;
let pendingQuestion = null;
let abortController = null;
let mcpTools = [];
let mcpInitialized = false;

const $setup = document.getElementById('setup');
const $app = document.getElementById('app');
const $chat = document.getElementById('chat');
const $input = document.getElementById('input');
const $sendBtn = document.getElementById('sendBtn');
const $status = document.getElementById('status');
const $currentDir = document.getElementById('currentDir');
const $welcome = document.getElementById('welcome');

async function init() {
  apiKey = await codeyangx.getApiKey();
  providerConfig = await codeyangx.getProviderConfig();
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
    const welEl = document.getElementById('welcome');
    if (welEl) {
      const provider = providerConfig?.type === 'anthropic' ? 'Anthropic' : 'DeepSeek';
      welEl.innerHTML =
        '<div style="font-size:40px;margin-bottom:12px;">></div>' +
        '<div style="font-size:16px;color:var(--yellow);font-weight:600;">No API Key Configured</div>' +
        '<div style="margin-top:8px;font-size:13px;">Set ' + provider + ' API key in ~/.codeyang/config.json</div>' +
        '<div style="margin-top:12px;font-size:13px;">Or type your key below to save it:</div>';
    }
    $input.placeholder = 'Paste your API key...';
    $status.textContent = 'Enter API key to start';
  } else {
    initMcpServers();
  }
}

async function initMcpServers() {
  try {
    const result = await codeyangx.mcpInit();
    if (result && result.tools && result.tools.length > 0) {
      mcpTools = result.tools.map((t) => ({
        name: t.qualifiedName,
        description: '[MCP:' + t.serverName + '] ' + t.description,
        input_schema: t.inputSchema || { type: 'object', properties: {} },
      }));
      mcpInitialized = true;
    }
    if (result && result.status) {
      const logParts = [];
      for (const name in result.status) {
        const s = result.status[name];
        logParts.push(name + ': ' + (s.connected ? s.toolCount + ' tools' : 'ERROR: ' + s.error));
      }
      if (logParts.length > 0) {
        $status.textContent = 'MCP: ' + logParts.join(' | ');
        setTimeout(() => { $status.textContent = ''; }, 5000);
      }
    }
  } catch {}
}

async function saveKey() {
  const key = document.getElementById('apiKeyInput').value.trim();
  if (!key) return;
  await codeyangx.saveApiKey(key);
  apiKey = key;
  showApp();
}

async function selectDirectory() {
  const dir = await codeyangx.selectDirectory();
  if (dir) {
    currentDir = dir;
    $currentDir.textContent = dir;
  }
}

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

function renderMarkdown(text) {
  let html = text;

  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
    return '<div class="code-block"><div class="lang">' + (lang || 'code') + '</div><pre>' + escapeHtml(code.trim()) + '</pre></div>';
  });

  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');

  html = html.replace(/^---$/gm, '<hr style="border:0;border-top:1px solid var(--border);margin:12px 0">');

  html = html.replace(/\|(.+)\|\n\|[-|\s]+\|\n((?:\|.+\|\n?)*)/g, (_, header, rows) => {
    const hCells = header.split('|').filter((c) => c.trim());
    const rLines = rows.trim().split('\n').filter((r) => r.trim());
    let table = '<table><thead><tr>';
    hCells.forEach((h) => { table += '<th>' + h.trim() + '</th>'; });
    table += '</tr></thead><tbody>';
    rLines.forEach((r) => {
      table += '<tr>';
      r.split('|').filter((c) => c.trim() !== '').forEach((c) => { table += '<td>' + c.trim() + '</td>'; });
      table += '</tr>';
    });
    table += '</tbody></table>';
    return table;
  });

  html = html.replace(/^[\t ]*- (.+)$/gm, '<li>$1</li>');
  html = html.replace(/((?:<li>.*<\/li>\n?)+)/g, '<ul>$1</ul>');

  html = html.replace(/^> (.+)$/gm, '<blockquote style="border-left:3px solid var(--accent);padding:4px 12px;margin:4px 0;color:var(--text2)">$1</blockquote>');
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>');

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

// ─── Provider-Agnostic API Call ────────────────────────────────────

async function sendMessage(userText) {
  if (isProcessing) return;

  if (!apiKey) {
    await codeyangx.saveApiKey(userText.trim());
    apiKey = userText.trim();
    $input.placeholder = 'Type your message...';
    $status.textContent = 'API key saved. Ready.';
    const welEl = document.getElementById('welcome');
    if (welEl) {
      welEl.innerHTML =
        '<div style="font-size:40px;margin-bottom:12px;">></div>' +
        '<div style="font-size:16px;color:var(--accent);font-weight:600;">CodeYangX Ready</div>' +
        '<div style="margin-top:8px;font-size:13px;">Ask me anything about your code.</div>';
    }
    initMcpServers();
    return;
  }

  isProcessing = true;
  $sendBtn.disabled = true;
  $status.textContent = 'Thinking...';

  abortController = new AbortController();
  addUserMessage(userText);
  const contentEl = createAssistantBlock();

  const isAnthropic = providerConfig?.type === 'anthropic';

  const messages = [{ role: 'user', content: userText }];
  const tools = getToolSchemas();

  try {
    let continueLoop = true;
    let turn = 0;
    const MAX_TURNS = 20;
    let lastText = '';
    let repeatCount = 0;

    while (continueLoop && turn < MAX_TURNS) {
      turn++;

      const model = await codeyangx.getModel();
      const baseURL = providerConfig?.baseURL || 'https://api.deepseek.com/v1';

      let response;
      if (isAnthropic) {
        response = await fetch(baseURL + '/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
            'anthropic-beta': 'tools-2024-04-04',
          },
          body: JSON.stringify({
            model,
            max_tokens: 8192,
            temperature: 0.5,
            system: getSystemPrompt(),
            messages,
            tools,
            stream: true,
          }),
          signal: abortController.signal,
        });
      } else {
        response = await fetch(baseURL + '/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + apiKey,
          },
          body: JSON.stringify({
            model,
            max_tokens: 8192,
            temperature: 0.5,
            messages: [{ role: 'system', content: getSystemPrompt() }, ...messages],
            tools,
            stream: true,
          }),
          signal: abortController.signal,
        });
      }

      if (!response.ok) {
        let errMsg = 'HTTP ' + response.status;
        try {
          const err = await response.json();
          errMsg = err.error?.message || err.error?.code || JSON.stringify(err);
        } catch {}
        if (response.status === 401) {
          appendText(contentEl, '\n\n**Error**: Invalid API key. Please restart and re-enter your key.');
          apiKey = null;
        } else {
          appendText(contentEl, '\n\n**Error**: ' + errMsg);
        }
        break;
      }

      const streamResult = isAnthropic
        ? await parseAnthropicSSE(response, contentEl)
        : await parseOpenAISSE(response, contentEl);

      const { textBlocks, toolCalls, assistantText } = streamResult;

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

      const toolResults = new Array(toolCalls.length);
      const toolResultIds = new Array(toolCalls.length);

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

      const parallelTasks = toolCalls.map(async (tc, i) => {
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

      const resultContent = toolResults.map((tr, i) => ({
        type: 'tool_result',
        tool_use_id: toolResultIds[i] || 'unknown',
        content: tr ? tr.content : '',
        is_error: false,
      }));

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

// ─── OpenAI-compatible SSE Parser ──────────────────────────────────

async function parseOpenAISSE(response, contentEl) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const textAccum = [];
  const toolCalls = [];
  let buffer = '';
  let currentToolIdx = -1;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const jsonStr = line.slice(6).trim();
      if (!jsonStr || jsonStr === '[DONE]') continue;

      let event;
      try { event = JSON.parse(jsonStr); } catch { continue; }

      const choice = event.choices && event.choices[0];
      if (!choice) continue;

      const delta = choice.delta || {};

      if (delta.content) {
        const container = document.querySelector('.assistant-msg:last-of-type .content');
        if (container) {
          container.innerHTML = container.innerHTML + renderMarkdown(delta.content);
          $chat.scrollTop = $chat.scrollHeight;
        }
        textAccum.push(delta.content);
      }

      if (delta.tool_calls) {
        for (const tc of delta.tool_calls) {
          const idx = tc.index;
          if (tc.id) {
            toolCalls[idx] = { id: tc.id, name: '', input: {} };
            currentToolIdx = idx;
          }
          if (tc.function) {
            if (tc.function.name) {
              if (!toolCalls[idx]) toolCalls[idx] = { id: '', name: '', input: {} };
              toolCalls[idx].name = tc.function.name;
            }
            if (tc.function.arguments) {
              if (!toolCalls[idx]) toolCalls[idx] = { id: '', name: '', input: {} };
              if (!toolCalls[idx]._args) toolCalls[idx]._args = '';
              toolCalls[idx]._args += tc.function.arguments;
            }
          }
        }
      }
    }
  }

  // Finalize tool call arguments
  for (const tc of toolCalls) {
    if (tc && tc._args) {
      try { tc.input = JSON.parse(tc._args); } catch { tc.input = {}; }
      delete tc._args;
    }
  }

  const textBlocks = textAccum.length > 0 ? [{ type: 'text', text: textAccum.join('') }] : [];

  return {
    textBlocks,
    toolCalls: toolCalls.filter(Boolean),
    assistantText: textAccum.join(''),
  };
}

// ─── Anthropic SSE Parser ──────────────────────────────────────────

async function parseAnthropicSSE(response, contentEl) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const textBlocks = [];
  const toolCalls = [];
  let currentBlock = null;
  let currentBlockIdx = -1;
  let buffer = '';
  let textAccum = [];

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const jsonStr = line.slice(6);
      if (jsonStr === '[DONE]') continue;

      let event;
      try { event = JSON.parse(jsonStr); } catch { continue; }

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
            } catch {
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

// ─── Question Dialog ───────────────────────────────────────────────

function askQuestion(q, opts) {
  return new Promise((resolve) => {
    if (opts && opts.length > 0) {
      const optHtml = opts.map((o, i) => (i + 1) + '. **' + o.label + '** — ' + o.description).join('\n');
      appendText(createAssistantBlock(), '**Question**: ' + q + '\n\n' + optHtml + '\n\n*Reply with the option number or your answer...*');
    } else {
      appendText(createAssistantBlock(), '**Question**: ' + q + '\n\n*Type your answer...*');
    }
    pendingQuestion = resolve;
    $input.placeholder = 'Answer the question...';
    $input.focus();
  });
}

// ─── Tool Schemas ──────────────────────────────────────────────────

function getToolSchemas() {
  const schemas = [
    { name: 'Bash', description: 'Execute a shell command.', input_schema: { type: 'object', properties: { command: { type: 'string' }, cwd: { type: 'string' } }, required: ['command'] } },
    { name: 'Read', description: 'Read file contents or list a directory.', input_schema: { type: 'object', properties: { filePath: { type: 'string' }, offset: { type: 'number' }, limit: { type: 'number' } }, required: ['filePath'] } },
    { name: 'Write', description: 'Write content to a file.', input_schema: { type: 'object', properties: { filePath: { type: 'string' }, content: { type: 'string' } }, required: ['filePath', 'content'] } },
    { name: 'Edit', description: 'Edit a file by replacing exact text.', input_schema: { type: 'object', properties: { filePath: { type: 'string' }, oldString: { type: 'string' }, newString: { type: 'string' }, replaceAll: { type: 'boolean' } }, required: ['filePath', 'oldString', 'newString'] } },
    { name: 'Glob', description: 'Search for files matching a glob pattern.', input_schema: { type: 'object', properties: { pattern: { type: 'string' }, root: { type: 'string' } }, required: ['pattern'] } },
    { name: 'Grep', description: 'Search file contents for a regex pattern.', input_schema: { type: 'object', properties: { pattern: { type: 'string' }, include: { type: 'string' }, path: { type: 'string' } }, required: ['pattern'] } },
    { name: 'TodoWrite', description: 'Create and maintain a structured task list.', input_schema: { type: 'object', properties: { todos: { type: 'array', items: { type: 'object', properties: { content: { type: 'string' }, status: { type: 'string', enum: ['pending', 'in_progress', 'completed', 'cancelled'] }, priority: { type: 'string', enum: ['high', 'medium', 'low'] } }, required: ['content', 'status', 'priority'] } } }, required: ['todos'] } },
    { name: 'WebFetch', description: 'Fetch content from a URL.', input_schema: { type: 'object', properties: { url: { type: 'string' }, format: { type: 'string', enum: ['text', 'html'] } }, required: ['url'] } },
    { name: 'Question', description: 'Ask the user a question.', input_schema: { type: 'object', properties: { question: { type: 'string' }, options: { type: 'array', items: { type: 'object', properties: { label: { type: 'string' }, description: { type: 'string' } }, required: ['label', 'description'] } } }, required: ['question'] } },
    { name: 'Task', description: 'Launch a sub-agent for complex multi-step tasks.', input_schema: { type: 'object', properties: { description: { type: 'string' }, prompt: { type: 'string' } }, required: ['description', 'prompt'] } },

    // Memory tools
    { name: 'Remember', description: 'Save a fact or preference to persistent memory.', input_schema: { type: 'object', properties: { key: { type: 'string' }, value: { type: 'string' }, type: { type: 'string', enum: ['fact', 'preference', 'project', 'instruction', 'context'] } }, required: ['key', 'value'] } },
    { name: 'Recall', description: 'Retrieve memories by key, id, or search query.', input_schema: { type: 'object', properties: { id: { type: 'string' }, query: { type: 'string' } } } },
    { name: 'Forget', description: 'Delete a memory by its key or id.', input_schema: { type: 'object', properties: { key: { type: 'string' } }, required: ['key'] } },
    { name: 'ListMemories', description: 'List all saved memories, optionally filtered by type.', input_schema: { type: 'object', properties: { type: { type: 'string', enum: ['fact', 'preference', 'project', 'instruction', 'context'] } } } },

    // Math
    { name: 'MathSolve', description: 'Solve math problems step by step.', input_schema: { type: 'object', properties: { problem: { type: 'string' }, type: { type: 'string', enum: ['linear', 'quadratic', 'system', 'pythagorean', 'circle', 'stats', 'percent', 'trig', 'sequence', 'coord'] } }, required: ['problem'] } },
    { name: 'MathPlot', description: 'Generate SVG mathematical diagrams.', input_schema: { type: 'object', properties: { kind: { type: 'string' }, output: { type: 'string' } }, required: ['kind'] } },
    { name: 'MathExplain', description: 'Reference for math concepts.', input_schema: { type: 'object', properties: { topic: { type: 'string' } } } },

    // Qt
    { name: 'QtBuild', description: 'Build the current Qt project.', input_schema: { type: 'object', properties: { target: { type: 'string' }, buildSystem: { type: 'string', enum: ['qmake', 'cmake', 'auto'] }, cwd: { type: 'string' } } } },
    { name: 'QtSignals', description: 'Analyze signal-slot connections.', input_schema: { type: 'object', properties: { cwd: { type: 'string' } } } },
    { name: 'QtProFile', description: 'Read a .pro file.', input_schema: { type: 'object', properties: { proPath: { type: 'string' } } } },
    { name: 'QtMigration', description: 'Analyze Qt5 code for Qt6 compatibility.', input_schema: { type: 'object', properties: { cwd: { type: 'string' } } } },
    { name: 'QtUi', description: 'Analyze a .ui form file.', input_schema: { type: 'object', properties: { filePath: { type: 'string' } }, required: ['filePath'] } },
    { name: 'QtQml', description: 'Analyze a QML file.', input_schema: { type: 'object', properties: { filePath: { type: 'string' } }, required: ['filePath'] } },
    { name: 'QtTestGen', description: 'Generate QTest boilerplate.', input_schema: { type: 'object', properties: { filePath: { type: 'string' } }, required: ['filePath'] } },
    { name: 'QtTestRunner', description: 'Run QTest test targets.', input_schema: { type: 'object', properties: { target: { type: 'string' } } } },
    { name: 'QtCoverage', description: 'Analyze test coverage gaps.', input_schema: { type: 'object', properties: { cwd: { type: 'string' } } } },
    { name: 'QtGraphics', description: 'QPainter/QGraphicsView reference.', input_schema: { type: 'object', properties: { cwd: { type: 'string' } } } },
    { name: 'QtCharts', description: 'Qt Charts code reference.', input_schema: { type: 'object', properties: { kind: { type: 'string', enum: ['line', 'bar', 'pie', 'scatter'] } } } },
    { name: 'QtMath', description: 'Qt math utilities reference.', input_schema: { type: 'object', properties: { expr: { type: 'string' } } } },
    { name: 'QtModelView', description: 'Qt Model/View architecture guide.', input_schema: { type: 'object', properties: { cwd: { type: 'string' } } } },
    { name: 'QtThread', description: 'Qt threading best practices.', input_schema: { type: 'object', properties: { cwd: { type: 'string' } } } },
  ];

  for (let i = 0; i < mcpTools.length; i++) {
    schemas.push(mcpTools[i]);
  }

  return schemas;
}

function getSystemPrompt() {
  const providerName = providerConfig?.type === 'anthropic' ? 'Claude' : 'DeepSeek';
  return [
    'You are CodeYangX, an AI coding agent in a desktop application powered by ' + providerName + '.',
    'Help users with coding, debugging, explanation, and code modification.',
    '',
    '## Available Tools',
    'Core: Bash, Read, Write, Edit, Glob, Grep, TodoWrite, WebFetch, Question',
    'Memory: Remember, Recall, Forget, ListMemories (persistent across sessions)',
    'Task: Launch sub-agents for complex multi-step work',
    'Math: MathSolve, MathPlot, MathExplain',
    'Qt: QtBuild, QtSignals, QtProFile, QtMigration, QtUi, QtQml, QtTestGen, QtTestRunner, QtCoverage, QtGraphics, QtCharts, QtMath, QtModelView, QtThread',
    mcpTools.length > 0 ? 'MCP: ' + mcpTools.length + ' external tools' : '',
    '',
    '## Guidelines',
    '- Be concise but thorough. Use markdown for code blocks.',
    '- For file changes, prefer Edit (surgical) over Write (full rewrite).',
    '- Use Bash to run commands, build projects, run tests.',
    '- Use Grep to search code, Glob to find files.',
    '- Use Remember/Recall to persist and retrieve information across sessions.',
    '- Use Task to delegate complex subtasks.',
    '- Create todo lists with TodoWrite for multi-step tasks.',
    currentDir ? 'Working directory: ' + currentDir : '',
  ].filter(Boolean).join('\n');
}

// ─── Helpers ───────────────────────────────────────────────────────

function escapeHtml(text) {
  return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ─── Input Handling ────────────────────────────────────────────────

$input.addEventListener('keydown', (e) => {
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

$sendBtn.addEventListener('click', () => {
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

$input.addEventListener('input', () => {
  $input.style.height = 'auto';
  $input.style.height = Math.min($input.scrollHeight, 150) + 'px';
});

window.selectDirectory = selectDirectory;
window.clearChat = clearChat;

init();
