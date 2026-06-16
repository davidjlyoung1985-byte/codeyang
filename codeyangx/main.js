const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { randomUUID } = require('crypto');

const tools = require('./tools.cjs');
const { getMcpManager } = require('./mcp.cjs');
const { isDenied, rateLimiter } = require('./security');

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: 'CodeYangX - AI Coding Agent',
    backgroundColor: '#0d1117',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    titleBarStyle: 'hiddenInset',
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));

  if (process.env.CODEYANGX_DEV) {
    mainWindow.webContents.openDevTools();
  }
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  const mcp = getMcpManager();
  if (mcp.hasServers) mcp.shutdown().catch(() => {});
  if (process.platform !== 'darwin') app.quit();
});

const CONFIG_DIR = path.join(os.homedir(), '.codeyang');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

function readConfig() {
  try {
    if (!fs.existsSync(CONFIG_FILE)) return {};
    return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
  } catch {
    return {};
  }
}

function writeConfig(data) {
  if (!fs.existsSync(CONFIG_DIR)) fs.mkdirSync(CONFIG_DIR, { recursive: true });
  const existing = fs.existsSync(CONFIG_FILE) ? JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8')) : {};
  Object.assign(existing, data);
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(existing, null, 2));
}

// ─── Provider config ───────────────────────────────────────────────

const SUPPORTED_PROVIDERS = {
  deepseek: {
    name: 'DeepSeek',
    baseURL: 'https://api.deepseek.com/v1',
    defaultModel: 'deepseek-chat',
    apiKeyEnv: ['CODEYANG_API_KEY', 'DEEPSEEK_API_KEY'],
    headerFormat: 'bearer',
    apiType: 'openai',
  },
  anthropic: {
    name: 'Anthropic',
    baseURL: 'https://api.anthropic.com/v1',
    defaultModel: 'claude-sonnet-4-20250514',
    apiKeyEnv: ['ANTHROPIC_API_KEY'],
    headerFormat: 'x-api-key',
    apiType: 'anthropic',
  },
};

function getProvider() {
  const conf = readConfig();
  const name = conf.apiProvider || process.env['CODEYANG_PROVIDER'] || 'deepseek';
  const provider = SUPPORTED_PROVIDERS[name];
  if (!provider) return SUPPORTED_PROVIDERS.deepseek;
  return provider;
}

// ─── IPC Handlers ──────────────────────────────────────────────────

ipcMain.handle('getProviderConfig', () => {
  const provider = getProvider();
  const conf = readConfig();
  return {
    type: provider.apiType,
    baseURL: conf.apiBaseURL || process.env['CODEYANG_BASE_URL'] || provider.baseURL,
    model: conf.model || process.env['CODEYANG_MODEL'] || provider.defaultModel,
  };
});

ipcMain.handle('getApiKey', () => {
  const conf = readConfig();
  if (conf.apiKey) return conf.apiKey;
  // Try all env vars for the current provider
  const provider = getProvider();
  for (const envVar of provider.apiKeyEnv) {
    if (process.env[envVar]) return process.env[envVar];
  }
  return process.env['CODEYANG_API_KEY'] || null;
});

ipcMain.handle('saveApiKey', (_event, key) => {
  writeConfig({ apiKey: key });
  return true;
});

ipcMain.handle('getModel', () => {
  const conf = readConfig();
  return conf.model || process.env['CODEYANG_MODEL'] || getProvider().defaultModel;
});

ipcMain.handle('getVersion', () => '0.3.0');

ipcMain.handle('selectDirectory', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: 'Select Project Directory',
  });
  return result.canceled ? null : result.filePaths[0] || null;
});

ipcMain.handle('getWorkingDir', () => process.cwd());

// ─── Tool Execution ────────────────────────────────────────────────

ipcMain.handle('executeTool', async (_event, name, args, cwd) => {
  const dir = cwd || process.cwd();

  try {
    switch (name) {
      case 'Bash': {
        // SECURITY: Rate limit and deny list checks
        rateLimiter.check('bash');
        const command = String(args.command || '');
        if (isDenied(command)) {
          throw new Error('[SECURITY] Command blocked by deny list.');
        }
        return await tools.executeBash(command, args.cwd || dir);
      }

      case 'Read': {
        rateLimiter.check('file');
        const fp = String(args.filePath || '');
        const offset = args.offset !== undefined ? Number(args.offset) : undefined;
        const limit = args.limit !== undefined ? Number(args.limit) : undefined;
        return await tools.executeRead(fp, offset, limit, dir);
      }

      case 'Write': {
        rateLimiter.check('file');
        const fp = String(args.filePath || '');
        const ct = String(args.content || '');
        return await tools.executeWrite(fp, ct, dir);
      }

      case 'Edit': {
        rateLimiter.check('file');
        const fp = String(args.filePath || '');
        const oldStr = String(args.oldString || '');
        const newStr = String(args.newString || '');
        const replaceAll = args.replaceAll === true;
        return await tools.executeEdit(fp, oldStr, newStr, replaceAll, dir);
      }

      case 'Glob': {
        const pattern = String(args.pattern || '');
        const root = args.root || undefined;
        return await tools.executeGlob(pattern, root, dir);
      }

      case 'Grep': {
        const pattern = String(args.pattern || '');
        const include = args.include || undefined;
        const sp = args.path || undefined;
        return await tools.executeGrep(pattern, include, sp, dir);
      }

      case 'TodoWrite': {
        const todos = Array.isArray(args.todos) ? args.todos : [];
        return tools.executeTodoWrite(todos);
      }

      case 'WebFetch': {
        const url = String(args.url || '');
        return await tools.executeWebFetch(url);
      }

      case 'Remember':
      case 'Recall':
      case 'Forget':
      case 'ListMemories':
        return await tools.executeMemoryTool(name, args);

      case 'MathSolve': {
        const problem = String(args.problem || '');
        const type = args.type ? String(args.type) : undefined;
        return await tools.executeMathSolve(problem, type);
      }

      case 'MathPlot': {
        const kind = String(args.kind || '');
        const output = args.output ? String(args.output) : undefined;
        return await tools.executeMathPlot(kind, output, dir);
      }

      case 'MathExplain': {
        const topic = args.topic ? String(args.topic) : undefined;
        return tools.executeMathExplain(topic);
      }

      case 'QtBuild':
        return await tools.executeQtBuild(args.buildSystem || 'auto', args.target || '', args.cwd || dir);
      case 'QtSignals':
        return await tools.executeQtSignals(args.cwd || dir);
      case 'QtProFile':
        return await tools.executeQtProFile(args.proPath || null, dir);
      case 'QtMigration':
        return await tools.executeQtMigration(args.cwd || dir);
      case 'QtUi':
        return await tools.executeQtUi(args.filePath, dir);
      case 'QtQml':
        return await tools.executeQtQml(args.filePath, dir);
      case 'QtTestGen':
        return await tools.executeQtTestGen(args.filePath, dir);
      case 'QtTestRunner':
        return await tools.executeQtTestRunner(args.target || '', dir);
      case 'QtCoverage':
        return await tools.executeQtCoverage(dir);
      case 'QtGraphics':
        return await tools.executeQtGraphics(dir);
      case 'QtCharts':
        return await tools.executeQtCharts(args.kind || '', dir);
      case 'QtMath':
        return await tools.executeQtMath(args.expr || '', dir);
      case 'QtModelView':
        return await tools.executeQtModelView(dir);
      case 'QtThread':
        return await tools.executeQtThread(dir);

      default:
        if (name.startsWith('mcp__')) {
          const mcp = getMcpManager();
          const result = await mcp.callTool(name, args);
          return result.isError ? '[MCP Error] ' + result.output : result.output;
        }
        return 'Unknown tool: ' + name;
    }
  } catch (err) {
    return 'Error: ' + (err.message || String(err));
  }
});

// ─── Sub-Agent (Task Tool) ────────────────────────────────────────

ipcMain.handle('executeSubAgent', async (_event, apiKey, model, description, prompt, cwd) => {
  try {
    return await tools.executeSubAgent(apiKey, model, description, prompt, cwd);
  } catch (err) {
    return '**Sub-agent error**: ' + (err.message || String(err));
  }
});

// ─── MCP Server Management ────────────────────────────────────────

ipcMain.handle('mcpInit', async () => {
  try {
    const mcp = getMcpManager();
    return await mcp.initialize();
  } catch (err) {
    return { tools: [], status: {}, serverCount: 0, connectedCount: 0, error: err.message };
  }
});

ipcMain.handle('mcpRefreshTools', async () => {
  try {
    const mcp = getMcpManager();
    return await mcp.refreshTools();
  } catch {
    return [];
  }
});

ipcMain.handle('mcpCallTool', async (_event, qualifiedName, args) => {
  try {
    const mcp = getMcpManager();
    return await mcp.callTool(qualifiedName, args);
  } catch (err) {
    return { output: err.message, isError: true };
  }
});

ipcMain.handle('mcpGetStatus', async () => {
  const mcp = getMcpManager();
  return mcp.status;
});

ipcMain.handle('mcpGetTools', async () => {
  const mcp = getMcpManager();
  return mcp.mcpTools.map((t) => ({
    qualifiedName: t.qualifiedName,
    serverName: t.serverName,
    name: t.name,
    description: t.description,
    inputSchema: t.inputSchema,
  }));
});
