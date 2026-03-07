const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const pty = require('node-pty');

// ── Config file ──
const CONFIG_PATH = path.join(process.env.HOME, '.terminal-translator-config.json');

function readConfig() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  } catch { return {}; }
}

function writeConfig(data) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(data, null, 2), 'utf8');
}

let mainWindow;
let ptyProcess;

function createWindow() {
  // 随机偏移位置，避免多实例窗口重叠
  const offsetX = Math.floor(Math.random() * 200);
  const offsetY = Math.floor(Math.random() * 150);

  mainWindow = new BrowserWindow({
    width: 1000,
    height: 700,
    x: 100 + offsetX,
    y: 80 + offsetY,
    title: 'Terminal Translator',
    backgroundColor: '#1e1e2e',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile('index.html');

  const shell = process.env.SHELL || '/bin/zsh';
  ptyProcess = pty.spawn(shell, [], {
    name: 'xterm-256color',
    cols: 80,
    rows: 24,
    cwd: process.env.HOME,
    env: { ...process.env, TERM: 'xterm-256color' },
  });

  ptyProcess.onData((data) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('terminal:data', data);
    }
  });

  ptyProcess.onExit(({ exitCode }) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('terminal:exit', exitCode);
    }
  });
}

ipcMain.on('terminal:input', (_event, data) => {
  if (ptyProcess) ptyProcess.write(data);
});

ipcMain.on('terminal:resize', (_event, { cols, rows }) => {
  if (ptyProcess) ptyProcess.resize(cols, rows);
});

ipcMain.handle('config:read', () => readConfig());
ipcMain.handle('config:write', (_event, data) => writeConfig(data));

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (ptyProcess) ptyProcess.kill();
  app.quit();
});
