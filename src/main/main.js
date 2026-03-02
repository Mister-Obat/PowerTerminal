import { app, BrowserWindow, ipcMain, Menu, dialog, protocol, net, clipboard, shell } from 'electron';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import fs from 'fs/promises';
import os from 'os';
import { execFile } from 'child_process';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const pty = require('node-pty');

// Register schemes as privileged before app is ready
protocol.registerSchemesAsPrivileged([
  { scheme: 'logo', privileges: { standard: true, secure: true, supportFetchAPI: true, bypassCSP: true } }
]);

// Remove menu globally for a cleaner look
Menu.setApplicationMenu(null);

const terminals = new Map();
const terminalRunningStates = new Map();
let terminalStatusInterval = null;
const TERMINAL_STATUS_INTERVAL_MS = 1200;

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Config file path — sits next to the project root
const CONFIG_PATH = path.join(__dirname, '../../config.json');

const DEFAULT_CONFIG = {
  rootPath: os.homedir(),
  projectMetadata: {}
};

async function readConfig() {
  try {
    const raw = await fs.readFile(CONFIG_PATH, 'utf8');
    return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

async function writeConfig(data) {
  await fs.writeFile(CONFIG_PATH, JSON.stringify(data, null, 2), 'utf8');
}

// Robustness: Set AppUserModelID for Windows
app.setAppUserModelId('obat.powerterminal.v1');

let mainWindow;

function sendTerminalStatus(ptyId, running) {
  if (!mainWindow || mainWindow.isDestroyed() || !mainWindow.webContents || mainWindow.webContents.isDestroyed()) {
    return;
  }
  mainWindow.webContents.send('terminal:status', { ptyId, running });
}

function setTerminalRunning(ptyId, running) {
  const previous = terminalRunningStates.get(ptyId);
  if (previous === running) return;
  terminalRunningStates.set(ptyId, running);
  sendTerminalStatus(ptyId, running);
}

function stopTerminalStatusMonitorIfIdle() {
  if (terminals.size > 0 || !terminalStatusInterval) return;
  clearInterval(terminalStatusInterval);
  terminalStatusInterval = null;
}

async function getChildProcessesByParent(parentPids) {
  if (!parentPids.length) return new Map();

  const childrenByParent = new Map(parentPids.map(pid => [pid, []]));

  try {
    if (process.platform === 'win32') {
      const filter = parentPids.map(pid => `ParentProcessId=${pid}`).join(' OR ');
      const script = `Get-CimInstance Win32_Process -Filter "${filter}" | Select-Object ParentProcessId, ProcessId, Name | ConvertTo-Json -Compress`;
      const stdout = await new Promise((resolve, reject) => {
        execFile('powershell.exe', ['-NoProfile', '-Command', script], { windowsHide: true, timeout: 5000, maxBuffer: 1024 * 1024 }, (error, out, err) => {
          if (error) {
            const details = String(err || '').trim();
            reject(new Error(details ? `${error.message}\n${details}` : error.message));
            return;
          }
          resolve(out);
        });
      });

      const trimmed = String(stdout || '').trim();
      if (!trimmed) return childrenByParent;

      const parsed = JSON.parse(trimmed);
      const entries = Array.isArray(parsed) ? parsed : [parsed];
      const ignoredNames = new Set(['conhost.exe']);

      entries.forEach((entry) => {
        const parentPid = Number(entry.ParentProcessId);
        if (!childrenByParent.has(parentPid)) return;
        if (ignoredNames.has(String(entry.Name || '').toLowerCase())) return;
        childrenByParent.get(parentPid).push(entry);
      });

      return childrenByParent;
    }

    const stdout = await new Promise((resolve, reject) => {
      execFile('ps', ['-eo', 'pid=,ppid=,comm='], { timeout: 1500, maxBuffer: 1024 * 1024 }, (error, out) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(out);
      });
    });

    String(stdout || '').split('\n').forEach((line) => {
      const parts = line.trim().split(/\s+/, 3);
      if (parts.length < 2) return;
      const pid = Number(parts[0]);
      const parentPid = Number(parts[1]);
      if (!Number.isFinite(pid) || !childrenByParent.has(parentPid)) return;
      childrenByParent.get(parentPid).push({ ProcessId: pid });
    });
  } catch (error) {
    console.warn('[Main] Terminal status probe failed:', error.message);
    return null;
  }

  return childrenByParent;
}

function ensureTerminalStatusMonitor() {
  if (terminalStatusInterval) return;

  terminalStatusInterval = setInterval(async () => {
    const ptyIds = [...terminals.keys()];
    if (!ptyIds.length) {
      stopTerminalStatusMonitorIfIdle();
      return;
    }

    const parentPids = ptyIds.map(id => Number(id)).filter(Number.isFinite);
    const childrenByParent = await getChildProcessesByParent(parentPids);
    if (!childrenByParent) {
      return;
    }

    ptyIds.forEach((ptyId) => {
      const pid = Number(ptyId);
      const children = childrenByParent.get(pid) || [];
      setTerminalRunning(ptyId, children.length > 0);
    });
  }, TERMINAL_STATUS_INTERVAL_MS);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    backgroundColor: '#0a0a0c',
    show: false,
    frame: false,
    icon: path.join(__dirname, '../../logo.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.setMenu(null);
  mainWindow.setMenuBarVisibility(false);
  mainWindow.removeMenu();

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Ensure all terminals are killed when window is destroyed
  mainWindow.on('closed', () => {
    killAllTerminals();
    mainWindow = null;
  });

  // Save last project path on close
  mainWindow.on('close', () => {
    // This will be handled via an IPC or state update if needed, 
    // but for now we store it during selection.
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }
}

app.whenReady().then(() => {
  // Register custom protocol to load local images safely
  protocol.handle('logo', (request) => {
    try {
      const url = new URL(request.url);
      const filePath = decodeURIComponent(url.searchParams.get('path') || '');
      if (!filePath) return new Response('Missing path', { status: 400 });
      return net.fetch(pathToFileURL(filePath).toString());
    } catch (e) {
      console.error('[Main] Logo protocol error:', e);
      return new Response('Error loading image', { status: 500 });
    }
  });

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// IPC Handler: Pick Logo
ipcMain.handle('project:pick-logo', async (event, cwd) => {
  const normalizedCwd = cwd ? cwd.replace(/\//g, '\\') : undefined;
  const { canceled, filePaths } = await dialog.showOpenDialog({
    defaultPath: normalizedCwd,
    properties: ['openFile'],
    filters: [
      { name: 'Images', extensions: ['png', 'ico', 'jpg', 'jpeg'] }
    ]
  });
  if (canceled) return null;
  return filePaths[0];
});

// IPC Handler: Window Control
ipcMain.on('window:control', (event, action) => {
  if (!mainWindow) return;
  switch (action) {
    case 'minimize': mainWindow.minimize(); break;
    case 'maximize':
      if (mainWindow.isMaximized()) mainWindow.unmaximize();
      else mainWindow.maximize();
      break;
    case 'close': mainWindow.close(); break;
  }
});

// IPC Handler: Window Move
ipcMain.on('window:move', (event, { x, y }) => {
  if (!mainWindow) return;
  mainWindow.setPosition(Math.round(x), Math.round(y));
});

// IPC Handler: Pick a project folder via native dialog
ipcMain.handle('project:pick-folder', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: 'Sélectionner le dossier du projet'
  });
  if (canceled || !filePaths.length) return null;
  const folderPath = filePaths[0].replace(/\\/g, '/');
  const name = path.basename(folderPath);
  return { id: name, name, path: folderPath };
});

// IPC Handler: Get config (rootPath + metadata)
ipcMain.handle('config:get', async () => {
  return await readConfig();
});

// IPC Handler: Project Metadata (Custom Names, Paths, Favoris)
ipcMain.handle('project:get-metadata', async () => {
  const config = await readConfig();
  return config.projectMetadata || {};
});

ipcMain.handle('project:save-metadata', async (event, metadata) => {
  const config = await readConfig();
  config.projectMetadata = metadata;
  await writeConfig(config);
});

// IPC Handler: Create Terminal (PTY)
ipcMain.handle('terminal:create', (event, { cwd }) => {
  const shell = process.platform === 'win32' ? 'powershell.exe' : 'bash';
  const env = { ...process.env };
  // Avoid leaking dev-only NODE_ENV into user commands (breaks `next build`, etc.)
  if (env.NODE_ENV === 'development') {
    delete env.NODE_ENV;
  }
  
  const ptyProcess = pty.spawn(shell, [], {
    name: 'xterm-color',
    cols: 80,
    rows: 24,
    cwd: cwd || os.homedir(),
    env
  });

  const ptyId = ptyProcess.pid.toString();
  terminals.set(ptyId, ptyProcess);
  terminalRunningStates.set(ptyId, false);
  sendTerminalStatus(ptyId, false);
  ensureTerminalStatusMonitor();
  console.log(`[Main] PTY Created: ${ptyId} for ${cwd}`);

  ptyProcess.onData((data) => {
    // console.log(`[Main] PTY Data [${ptyId}]:`, data);
    if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents && !mainWindow.webContents.isDestroyed()) {
        mainWindow.webContents.send('terminal:incoming', { ptyId, data });
    }
  });

  ptyProcess.onExit(() => {
    terminals.delete(ptyId);
    terminalRunningStates.delete(ptyId);
    sendTerminalStatus(ptyId, false);
    stopTerminalStatusMonitorIfIdle();
    if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents && !mainWindow.webContents.isDestroyed()) {
        mainWindow.webContents.send('terminal:exit', { ptyId });
    }
  });

  return ptyId;
});

ipcMain.handle('terminal:exists', (event, { ptyId }) => {
  if (!ptyId) return false;
  return terminals.has(String(ptyId));
});

// IPC Handler: Destroy Terminal
ipcMain.on('terminal:destroy', (event, { ptyId }) => {
  const ptyProcess = terminals.get(ptyId);
  if (ptyProcess) {
    ptyProcess.kill();
    terminals.delete(ptyId);
    terminalRunningStates.delete(ptyId);
    sendTerminalStatus(ptyId, false);
    stopTerminalStatusMonitorIfIdle();
    console.log(`[Main] PTY Destroyed: ${ptyId}`);
  }
});

// Graceful Exit: Kill all PTY processes
function killAllTerminals() {
    console.log('[Main] Killing all terminals...');
    for (const [id, ptyProcess] of terminals) {
        ptyProcess.kill();
    }
    terminals.clear();
    terminalRunningStates.clear();
    stopTerminalStatusMonitorIfIdle();
}

app.on('before-quit', killAllTerminals);

// IPC Handler: Terminal Input
ipcMain.on('terminal:input', (event, { ptyId, data }) => {
  const ptyProcess = terminals.get(ptyId);
  if (ptyProcess) {
    ptyProcess.write(data);
  }
});

// IPC Handler: Terminal Resize
ipcMain.on('terminal:resize', (event, { ptyId, cols, rows }) => {
  const ptyProcess = terminals.get(ptyId);
  if (ptyProcess) {
    ptyProcess.resize(cols, rows);
  }
});

// IPC Handler: Clipboard Write (depuis le renderer)
ipcMain.on('clipboard:write', (event, text) => {
  clipboard.writeText(text);
});

// IPC Handler: Open URL in default browser
ipcMain.on('shell:open-url', (event, url) => {
  shell.openExternal(url);
});
