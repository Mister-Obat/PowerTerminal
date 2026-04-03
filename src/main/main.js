import { app, BrowserWindow, ipcMain, Menu, dialog, protocol, net, clipboard, shell } from 'electron';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import fs from 'fs/promises';
import { accessSync } from 'fs';
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
const IGNORED_PORTS = new Set([135, 139, 445, 5040, 5354, 5355, 5357, 5358, 5985, 7680, 47001]);
const DYNAMIC_PORTS_MIN = 49152;
const DYNAMIC_PORTS_MAX = 65535;

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

function runPowerShellJson(script, timeout = 7000) {
  return new Promise((resolve, reject) => {
    const encodedScript = Buffer.from(String(script || ''), 'utf16le').toString('base64');
    execFile(
      'powershell.exe',
      ['-NoProfile', '-EncodedCommand', encodedScript],
      { windowsHide: true, timeout, maxBuffer: 2 * 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error) {
          const details = String(stderr || '').trim();
          reject(new Error(details ? `${error.message}\n${details}` : error.message));
          return;
        }

        const raw = String(stdout || '').trim();
        if (!raw) {
          resolve([]);
          return;
        }

        try {
          const parsed = JSON.parse(raw);
          resolve(Array.isArray(parsed) ? parsed : [parsed]);
        } catch (parseError) {
          reject(new Error(`Invalid PowerShell JSON output: ${parseError.message}`));
        }
      }
    );
  });
}

function runCommand(file, args, timeout = 10000) {
  return new Promise((resolve, reject) => {
    execFile(
      file,
      args,
      { windowsHide: true, timeout, maxBuffer: 4 * 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error) {
          const details = String(stderr || '').trim();
          reject(new Error(details ? `${error.message}\n${details}` : error.message));
          return;
        }
        resolve(String(stdout || ''));
      }
    );
  });
}

function parseTasklistCsvLine(line) {
  const values = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === ',' && !inQuotes) {
      values.push(current);
      current = '';
      continue;
    }
    current += ch;
  }
  values.push(current);
  return values;
}

function normalizeListenState(value) {
  return String(value || '')
    .toUpperCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');
}

function parseNetstatLocalAddress(local) {
  const input = String(local || '').trim();
  if (!input) return { address: '', port: 0 };

  if (input.startsWith('[')) {
    const closing = input.lastIndexOf(']');
    const address = closing > 0 ? input.slice(1, closing) : input;
    const portPart = closing > -1 ? input.slice(closing + 1) : '';
    const port = Number(portPart.replace(/^:/, '')) || 0;
    return { address, port };
  }

  const match = input.match(/^(.*):(\d+)$/);
  if (!match) return { address: input, port: 0 };
  return { address: match[1], port: Number(match[2]) || 0 };
}

function detectFrameworkFromCommand(command = '', processName = '', executablePath = '', program = '') {
  const cmd = String(command).toLowerCase();
  const name = String(processName).toLowerCase();
  const exe = String(executablePath).toLowerCase();
  const prog = String(program).toLowerCase();
  const full = `${cmd} ${name} ${exe} ${prog}`;

  if (full.includes('codex')) return 'Codex';
  if (full.includes('next')) return 'Next.js';
  if (full.includes('vite')) return 'Vite';
  if (full.includes('nuxt')) return 'Nuxt';
  if (full.includes('angular') || full.includes('ng serve')) return 'Angular';
  if (full.includes('webpack')) return 'Webpack';
  if (full.includes('remix')) return 'Remix';
  if (full.includes('astro')) return 'Astro';
  if (full.includes('gatsby')) return 'Gatsby';
  if (full.includes('flask')) return 'Flask';
  if (full.includes('django') || full.includes('manage.py')) return 'Django';
  if (full.includes('uvicorn') || full.includes('fastapi')) return 'FastAPI';
  if (full.includes('rails')) return 'Rails';
  if (full.includes('cargo') || full.includes('rustc')) return 'Rust';
  if (full.includes('go.exe') || full.includes('\\go\\')) return 'Go';
  if (full.includes('dotnet') || full.includes('aspnet')) return '.NET';
  if (full.includes('php')) return 'PHP';
  if (full.includes('bun')) return 'Bun';
  if (full.includes('deno')) return 'Deno';
  if (full.includes('node')) return 'Node.js';
  if (full.includes('python')) return 'Python';
  if (name === 'node.exe' || name === 'node') return 'Node.js';
  if (name === 'python.exe' || name === 'python' || name === 'python3') return 'Python';
  if (name === 'java.exe' || name === 'java') return 'Java';
  if (name === 'ruby.exe' || name === 'ruby') return 'Ruby';
  if (name === 'go.exe' || name === 'go') return 'Go';

  return 'Unknown';
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
  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    console.error('[Main] did-fail-load:', { errorCode, errorDescription, validatedURL });
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
    const appPath = app.getAppPath();
    const candidatePaths = [
      path.join(appPath, 'dist/index.html'),
      path.join(__dirname, '../../dist/index.html'),
      path.join(__dirname, '../dist/index.html')
    ];
    const indexPath = candidatePaths.find((candidate) => {
      try {
        accessSync(candidate);
        return true;
      } catch {
        return false;
      }
    });

    if (!indexPath) {
      throw new Error(`Impossible de trouver index.html. Tried: ${candidatePaths.join(', ')}`);
    }

    mainWindow.loadFile(indexPath);
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

ipcMain.handle('ports:list', async () => {
  if (process.platform !== 'win32') {
    return [];
  }

  const netstatRaw = await runCommand('netstat.exe', ['-ano', '-p', 'tcp'], 12000);
  const listenStates = new Set(['LISTENING', 'ECOUTE']);
  const establishedStates = new Set(['ESTABLISHED', 'ETABLI']);
  const dedupe = new Set();
  const rows = [];

  String(netstatRaw || '').split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || !trimmed.toUpperCase().startsWith('TCP')) return;

    const parts = trimmed.split(/\s+/);
    if (parts.length < 5) return;
    const local = parts[1];
    const state = normalizeListenState(parts[3]);
    const pid = Number(parts[4]) || 0;
    const isListeningState = listenStates.has(state);
    const isEstablishedState = establishedStates.has(state);
    if ((!isListeningState && !isEstablishedState) || pid <= 0) return;

    const { address, port } = parseNetstatLocalAddress(local);
    if (port <= 0) return;

    const key = `${address}|${port}|${pid}`;
    if (dedupe.has(key)) return;
    dedupe.add(key);

    rows.push({
      localAddress: address,
      port,
      pid,
      state: isListeningState ? 'listening' : 'established',
      processName: '',
      command: '',
      executablePath: '',
      tasklistRaw: '',
      tasklistSummary: '',
    });
  });

  const pids = [...new Set(rows.map((r) => r.pid))];
  const pidInfo = new Map();
  const pidMeta = new Map();

  if (pids.length) {
    const psScript = `
$pidList = @(${pids.join(',')})
$filter = ($pidList | ForEach-Object { "ProcessId=$_" }) -join " OR "
$meta = @()
if ($filter) {
  $meta = Get-CimInstance Win32_Process -Filter $filter -ErrorAction SilentlyContinue |
    Select-Object @{Name='pid';Expression={[int]$_.ProcessId}}, Name, CommandLine, ExecutablePath
}
@($meta) | ConvertTo-Json -Compress
`;

    const [metaRowsResult, tasklistRawResult] = await Promise.allSettled([
      runPowerShellJson(psScript, 8000),
      runCommand('tasklist.exe', ['/FO', 'CSV', '/NH'], 8000),
    ]);

    if (metaRowsResult.status === 'fulfilled') {
      metaRowsResult.value.forEach((entry) => {
        const pid = Number(entry?.pid) || 0;
        const name = String(entry?.name || entry?.Name || '');
        const commandLine = String(entry?.commandLine || entry?.CommandLine || '');
        const executablePath = String(entry?.executablePath || entry?.ExecutablePath || '');
        if (pid > 0) {
          pidMeta.set(pid, { name, commandLine, executablePath });
        }
      });
    }

    if (tasklistRawResult.status === 'fulfilled') {
      const pidSet = new Set(pids);
      String(tasklistRawResult.value || '').split(/\r?\n/).forEach((rawLine) => {
        const line = rawLine.trim();
        if (!line || /^INFO:/i.test(line)) return;
        const [imageName, processId, sessionName, sessionNumber, memUsage] = parseTasklistCsvLine(line);
        const pid = Number(processId) || 0;
        if (!pidSet.has(pid)) return;
        const summary = `${imageName || 'Unknown'} | ${memUsage || '—'} | ${sessionName || '—'}`;
        pidInfo.set(pid, {
          processName: String(imageName || '').replace(/\.exe$/i, ''),
          tasklistRaw: line,
          tasklistSummary: summary,
          program: imageName || 'Unknown',
        });
        void sessionNumber;
      });
    }
  }

  const isIgnoredPort = (port) => {
    return IGNORED_PORTS.has(port);
  };

  const isDynamicPort = (port) => port >= DYNAMIC_PORTS_MIN && port <= DYNAMIC_PORTS_MAX;

  return rows.map((entry) => {
    const enriched = pidInfo.get(entry.pid) || {};
    const meta = pidMeta.get(entry.pid) || {};
    const executablePath = String(meta.executablePath || entry.executablePath || '');
    const processName = String(meta.name || enriched.processName || entry.processName || '');
    const command = String(meta.commandLine || entry.command || '');
    const tasklistRaw = String(enriched.tasklistRaw || entry.tasklistRaw || '');
    const tasklistSummary = String(enriched.tasklistSummary || entry.tasklistSummary || '');
    const taskImage = tasklistSummary ? String(tasklistSummary).split('|')[0].trim() : '';
    const resolvedProcessName = processName || taskImage;
    const resolvedProgram = executablePath || String(enriched.program || '') || taskImage || processName || 'Unknown';
    const framework = detectFrameworkFromCommand(command, resolvedProcessName, executablePath, resolvedProgram);
    const status = resolvedProcessName || tasklistRaw ? 'healthy' : 'unknown';

    return {
      localAddress: String(entry.localAddress || ''),
      port: Number(entry.port) || 0,
      pid: Number(entry.pid) || 0,
      state: String(entry.state || 'listening'),
      processName: resolvedProcessName || 'Unknown',
      command,
      program: resolvedProgram,
      tasklist: tasklistSummary || '—',
      framework,
      status,
    };
  }).filter((entry) => {
    if (entry.port <= 0 || entry.pid <= 0) return false;
    const loweredProcess = String(entry.processName || '').toLowerCase();
    const loweredProgram = String(entry.program || '').toLowerCase();
    const loweredCommand = String(entry.command || '').toLowerCase();
    const isCodex = loweredProcess.includes('codex')
      || loweredProgram.includes('codex')
      || loweredCommand.includes('codex');

    if (entry.state !== 'listening') {
      return isCodex;
    }

    if (isCodex) return true;
    if (isIgnoredPort(entry.port)) return false;
    if (isDynamicPort(entry.port)) return false;
    return true;
  });
});

ipcMain.handle('ports:kill-process', async (event, { pid }) => {
  const normalizedPid = Number(pid);
  if (!Number.isFinite(normalizedPid) || normalizedPid <= 0) {
    return { ok: false, error: 'PID invalide.' };
  }

  if (process.platform !== 'win32') {
    return { ok: false, error: 'Fonction disponible uniquement sur Windows.' };
  }

  const script = `
try {
    Stop-Process -Id ${normalizedPid} -Force -ErrorAction Stop
    @{ ok = $true } | ConvertTo-Json -Compress
} catch {
    @{ ok = $false; error = $_.Exception.Message } | ConvertTo-Json -Compress
}
`;

  const [result] = await runPowerShellJson(script, 8000);
  if (result && result.ok) {
    return { ok: true };
  }
  return { ok: false, error: String(result?.error || 'Impossible de tuer le processus.') };
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
