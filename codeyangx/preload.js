const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('codeyangx', {
  getProviderConfig: () => ipcRenderer.invoke('getProviderConfig'),
  getApiKey: () => ipcRenderer.invoke('getApiKey'),
  saveApiKey: (key) => ipcRenderer.invoke('saveApiKey', key),
  getModel: () => ipcRenderer.invoke('getModel'),
  getVersion: () => ipcRenderer.invoke('getVersion'),

  readFile: (fp) => ipcRenderer.invoke('readFile', fp),
  writeFile: (fp, content) => ipcRenderer.invoke('writeFile', fp, content),
  listDirectory: (dir) => ipcRenderer.invoke('listDirectory', dir),

  selectDirectory: () => ipcRenderer.invoke('selectDirectory'),
  getWorkingDir: () => ipcRenderer.invoke('getWorkingDir'),

  executeTool: (name, args, cwd) => ipcRenderer.invoke('executeTool', name, args, cwd),

  executeSubAgent: (apiKey, model, description, prompt, cwd) =>
    ipcRenderer.invoke('executeSubAgent', apiKey, model, description, prompt, cwd),

  mcpInit: () => ipcRenderer.invoke('mcpInit'),
  mcpRefreshTools: () => ipcRenderer.invoke('mcpRefreshTools'),
  mcpCallTool: (name, args) => ipcRenderer.invoke('mcpCallTool', name, args),
  mcpGetStatus: () => ipcRenderer.invoke('mcpGetStatus'),
  mcpGetTools: () => ipcRenderer.invoke('mcpGetTools'),
});
