const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // Terminal APIs
  createTerminal: (cwd) => ipcRenderer.invoke('terminal:create', { cwd }),
  sendInput: (ptyId, data) => ipcRenderer.send('terminal:input', { ptyId, data }),
  onTerminalData: (callback) => ipcRenderer.on('terminal:incoming', (event, data) => callback(data)),
  onTerminalStatus: (callback) => ipcRenderer.on('terminal:status', (event, data) => callback(data)),
  onTerminalExit: (callback) => ipcRenderer.on('terminal:exit', (event, data) => callback(data)),
  resizeTerminal: (ptyId, cols, rows) => ipcRenderer.send('terminal:resize', { ptyId, cols, rows }),
  destroyTerminal: (ptyId) => ipcRenderer.send('terminal:destroy', { ptyId }),
  terminalExists: (ptyId) => ipcRenderer.invoke('terminal:exists', { ptyId }),

  // Config
  getConfig: () => ipcRenderer.invoke('config:get'),

  // Projects
  pickFolder: (defaultPath) => ipcRenderer.invoke('project:pick-folder', { defaultPath }),

  // Metadata APIs
  getMetadata: () => ipcRenderer.invoke('project:get-metadata'),
  saveMetadata: (metadata) => ipcRenderer.invoke('project:save-metadata', metadata),
  getProjectOrder: () => ipcRenderer.invoke('project:get-order'),
  saveProjectOrder: (projectOrder) => ipcRenderer.invoke('project:save-order', projectOrder),
  getEmojiOrder: () => ipcRenderer.invoke('emoji:get-order'),
  saveEmojiOrder: (emojiRecentOrder) => ipcRenderer.invoke('emoji:save-order', emojiRecentOrder),
  pickLogo: (cwd) => ipcRenderer.invoke('project:pick-logo', cwd),

  // Window Controls
  windowControl: (action) => ipcRenderer.send('window:control', action),
  moveWindow: (x, y) => ipcRenderer.send('window:move', { x, y }),

  // Clipboard (délégué au main process)
  copyToClipboard: (text) => ipcRenderer.send('clipboard:write', text),

  // Open URL in default browser
  openUrl: (url) => ipcRenderer.send('shell:open-url', url),

  // Ports monitor
  listActivePorts: () => ipcRenderer.invoke('ports:list'),
  killProcessByPid: (pid) => ipcRenderer.invoke('ports:kill-process', { pid }),
});
