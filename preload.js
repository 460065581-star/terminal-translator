const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('terminalAPI', {
  onData: (cb) => ipcRenderer.on('terminal:data', (_e, data) => cb(data)),
  onExit: (cb) => ipcRenderer.on('terminal:exit', (_e, code) => cb(code)),
  sendInput: (data) => ipcRenderer.send('terminal:input', data),
  resize: (cols, rows) => ipcRenderer.send('terminal:resize', { cols, rows }),
});
