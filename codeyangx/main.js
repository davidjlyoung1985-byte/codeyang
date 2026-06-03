/**
 * CodeYangX — Desktop AI Coding Agent
 * Electron main process
 */
const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');

const tools = require('./tools.cjs');
const { getMcpManager } = require('./mcp.cjs');

let mainWindow = null;

// ═══════════════════════════════════════════════════════════════════════════════
// Window Creation
// ═══════════════════════════════════════════════════════════════════════════════

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: 'CodeYangX - AI Coding Agent',
    icon: path.join(__dirname, 'icon.png'),
    backgroundColor: '#0d1117',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    titleBarStyle: 'hiddenInset',
    frame: true,
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));

  if (process.env.CODEYANGX_DEV) {
    mainWindow.webContents.openDevTools();
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// App Lifecycle
// ═══════════════════════════════════════════════════════════════════════════════

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

// ═══════════════════════════════════════════════════════════════════════════════
// Config
// ═══════════════════════════════════════════════════════════════════════════════

const CONFIG_DIR = path.join(os.homedir(), '.codeyang');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

ipcMain.handle('getApiKey', async () => {
  try {
    if (!fs.existsSync(CONFIG_FILE)) return process.env['ANTHROPIC_API_KEY'] || null;
    const data = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
    return data.apiKey || process.env['ANTHROPIC_API_KEY'] || null;
  } catch {
    return process.env['ANTHROPIC_API_KEY'] || null;
  }
});

ipcMain.handle('saveApiKey', async (_event, key) => {
  try {
    if (!fs.existsSync(CONFIG_DIR)) fs.mkdirSync(CONFIG_DIR, { recursive: true });
    const existing = fs.existsSync(CONFIG_FILE) ? JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8')) : {};
    existing.apiKey = key;
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(existing, null, 2));
    return true;
  } catch {
    return false;
  }
});

ipcMain.handle('getModel', async () => {
  return process.env['CODEYANG_MODEL'] || 'claude-sonnet-4-20250514';
});

ipcMain.handle('getVersion', () => {
  return '0.3.0';
});

ipcMain.handle('selectDirectory', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: 'Select Project Directory',
  });
  return result.canceled ? null : result.filePaths[0] || null;
});

ipcMain.handle('getWorkingDir', () => {
  return process.cwd();
});

// ═══════════════════════════════════════════════════════════════════════════════
// Tool Execution — unified IPC handler
// ═══════════════════════════════════════════════════════════════════════════════

ipcMain.handle('executeTool', async (_event, name, args, cwd) => {
  const dir = cwd || process.cwd();

  try {
    switch (name) {
      case 'Bash':
        return await tools.executeBash(String(args.command || ''), args.cwd || dir);

      case 'Read': {
        const fp = String(args.filePath || '');
        const offset = args.offset !== undefined ? Number(args.offset) : undefined;
        const limit = args.limit !== undefined ? Number(args.limit) : undefined;
        return await tools.executeRead(fp, offset, limit, dir);
      }

      case 'Write': {
        const fp = String(args.filePath || '');
        const ct = String(args.content || '');
        return await tools.executeWrite(fp, ct, dir);
      }

      case 'Edit': {
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

      // Math tools
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

      // Qt tools
      case 'QtBuild': {
        const bs = (args.buildSystem || 'auto');
        const target = args.target ? String(args.target) : '';
        const bd = args.cwd || dir;
        return await tools.executeQtBuild(bs, target, bd);
      }
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
        // MCP tools: mcp__serverName__toolName
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

// ═══════════════════════════════════════════════════════════════════════════════
// Sub-Agent (Task Tool)
// ═══════════════════════════════════════════════════════════════════════════════

ipcMain.handle('executeSubAgent', async (_event, apiKey, model, description, prompt, cwd) => {
  try {
    return await tools.executeSubAgent(apiKey, model, description, prompt, cwd);
  } catch (err) {
    return '**Sub-agent error**: ' + (err.message || String(err));
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// MCP Server Management
// ═══════════════════════════════════════════════════════════════════════════════

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
  } catch (err) {
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
  return mcp.mcpTools.map(function (t) {
    return {
      qualifiedName: t.qualifiedName,
      serverName: t.serverName,
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    };
  });
});
