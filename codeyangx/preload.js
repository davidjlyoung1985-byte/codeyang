/**
 * CodeYangX — Preload script
 * Exposes safe IPC methods to the renderer process.
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('codeyangx', {
  // Config
  getApiKey: () => ipcRenderer.invoke('getApiKey'),
  saveApiKey: (key) => ipcRenderer.invoke('saveApiKey', key),
  getModel: () => ipcRenderer.invoke('getModel'),
  getVersion: () => ipcRenderer.invoke('getVersion'),

  // File system
  readFile: (fp) => ipcRenderer.invoke('readFile', fp),
  writeFile: (fp, content) => ipcRenderer.invoke('writeFile', fp, content),
  listDirectory: (dir) => ipcRenderer.invoke('listDirectory', dir),

  // Dialog
  selectDirectory: () => ipcRenderer.invoke('selectDirectory'),
  getWorkingDir: () => ipcRenderer.invoke('getWorkingDir'),

  // Tool execution — all tools go through this single IPC channel
  executeTool: (name, args, cwd) => ipcRenderer.invoke('executeTool', name, args, cwd),

  // Sub-agent (Task tool)
  executeSubAgent: (apiKey, model, description, prompt, cwd) =>
    ipcRenderer.invoke('executeSubAgent', apiKey, model, description, prompt, cwd),

  // MCP server management
  mcpInit: () => ipcRenderer.invoke('mcpInit'),
  mcpRefreshTools: () => ipcRenderer.invoke('mcpRefreshTools'),
  mcpCallTool: (name, args) => ipcRenderer.invoke('mcpCallTool', name, args),
  mcpGetStatus: () => ipcRenderer.invoke('mcpGetStatus'),
  mcpGetTools: () => ipcRenderer.invoke('mcpGetTools'),
});
