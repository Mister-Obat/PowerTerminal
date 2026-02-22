import { app, BrowserWindow, ipcMain, Menu, dialog, protocol, net, clipboard, shell } from 'electron';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import fs from 'fs/promises';
import os from 'os';
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
  console.log(`[Main] PTY Created: ${ptyId} for ${cwd}`);

  ptyProcess.onData((data) => {
    // console.log(`[Main] PTY Data [${ptyId}]:`, data);
    if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents && !mainWindow.webContents.isDestroyed()) {
        mainWindow.webContents.send('terminal:incoming', { ptyId, data });
    }
  });

  ptyProcess.onExit(() => {
    terminals.delete(ptyId);
    if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents && !mainWindow.webContents.isDestroyed()) {
        mainWindow.webContents.send('terminal:exit', { ptyId });
    }
  });

  return ptyId;
});

// IPC Handler: Destroy Terminal
ipcMain.on('terminal:destroy', (event, { ptyId }) => {
  const ptyProcess = terminals.get(ptyId);
  if (ptyProcess) {
    ptyProcess.kill();
    terminals.delete(ptyId);
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
