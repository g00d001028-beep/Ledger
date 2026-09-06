const { app, BrowserWindow, ipcMain, shell } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const DATA_DIR = path.join(app.getPath('userData'), 'ledger-data');
const ACCOUNTS_FILE = path.join(DATA_DIR, 'accounts.json');
const ITERATIONS = 210000;
const KEY_LEN = 32;
const sessions = new Map();

function ensureDataDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function readAccounts() {
  ensureDataDir();
  try {
    return JSON.parse(fs.readFileSync(ACCOUNTS_FILE, 'utf8'));
  } catch {
    return { version: 3, accounts: [] };
  }
}

function writeAccounts(accounts) {
  ensureDataDir();
  const tmp = ACCOUNTS_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(accounts, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, ACCOUNTS_FILE);
}

function deriveKey(password, salt) {
  return crypto.pbkdf2Sync(password, Buffer.from(salt, 'base64'), ITERATIONS, KEY_LEN, 'sha256');
}

function verifier(key) {
  return crypto.createHash('sha256').update(key).digest('base64');
}

function userFile(id) {
  return path.join(DATA_DIR, `${id}.ledger`);
}

function encryptPayload(data, key) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const plaintext = Buffer.from(JSON.stringify(data), 'utf8');
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return JSON.stringify({
    version: 1,
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    data: ciphertext.toString('base64')
  });
}

function decryptPayload(raw, key) {
  const obj = JSON.parse(raw);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(obj.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(obj.tag, 'base64'));
  const plaintext = Buffer.concat([decipher.update(Buffer.from(obj.data, 'base64')), decipher.final()]);
  return JSON.parse(plaintext.toString('utf8'));
}

function safeUsername(name) {
  return String(name || '').trim().replace(/[^a-zA-Z0-9 _.-]/g, '').slice(0, 32);
}

// IPC Handlers
ipcMain.handle('accounts:list', () => {
  return readAccounts().accounts.map(a => ({ id: a.id, username: a.username }));
});

ipcMain.handle('accounts:create', (_event, username, password) => {
  username = safeUsername(username);
  if (username.length < 2) throw new Error('Username must be at least 2 characters.');
  if (typeof password !== 'string' || password.length < 8) throw new Error('Password must be at least 8 characters.');

  const db = readAccounts();
  if (db.accounts.some(a => a.username.toLowerCase() === username.toLowerCase())) {
    throw new Error('Username already exists.');
  }

  const id = crypto.randomUUID();
  const salt = crypto.randomBytes(16).toString('base64');
  const key = deriveKey(password, salt);

  db.accounts.push({ id, username, salt, verifier: verifier(key), createdAt: new Date().toISOString() });
  writeAccounts(db);

  fs.writeFileSync(userFile(id), encryptPayload({ entries: [], recurring: [], savingsGoal: 0, theme: 'light' }, key), { mode: 0o600 });
  return { id, username };
});

ipcMain.handle('accounts:login', (_event, id, password) => {
  const account = readAccounts().accounts.find(a => a.id === id);
  if (!account) throw new Error('Account not found.');
  
  const key = deriveKey(password, account.salt);
  if (!crypto.timingSafeEqual(Buffer.from(verifier(key)), Buffer.from(account.verifier))) {
    throw new Error('Incorrect password.');
  }

  let data;
  try {
    data = decryptPayload(fs.readFileSync(userFile(id), 'utf8'), key);
  } catch {
    throw new Error('The encrypted ledger could not be opened.');
  }

  const sessionId = crypto.randomUUID();
  sessions.set(sessionId, { id, key, createdAt: Date.now() });
  return { sessionId, id, username: account.username, data };
});

ipcMain.handle('ledger:save', (_event, sessionId, data) => {
  const session = sessions.get(sessionId);
  if (!session) throw new Error('Session expired.');
  const tmp = userFile(session.id) + '.tmp';
  fs.writeFileSync(tmp, encryptPayload(data, session.key), { mode: 0o600 });
  fs.renameSync(tmp, userFile(session.id));
  return true;
});

ipcMain.handle('backup:export', (_event, sessionId, data) => {
  const session = sessions.get(sessionId);
  if (!session) throw new Error('Session expired.');
  return encryptPayload({ backupVersion: 3, exportedAt: new Date().toISOString(), ...data }, session.key);
});

ipcMain.handle('backup:import', (_event, sessionId, encrypted) => {
  const session = sessions.get(sessionId);
  if (!session) throw new Error('Session expired.');
  const data = decryptPayload(encrypted, session.key);
  if (!Array.isArray(data.entries) || !Array.isArray(data.recurring)) throw new Error('Invalid backup structure.');
  return { entries: data.entries, recurring: data.recurring, savingsGoal: Number(data.savingsGoal) || 0, theme: data.theme === 'dark' ? 'dark' : 'light' };
});

ipcMain.on('session:clear', (_event, sessionId) => sessions.delete(sessionId));

function createWindow() {
  const win = new BrowserWindow({
    width: 1050,
    height: 800,
    minWidth: 760,
    minHeight: 600,
    title: 'Ledger',
    backgroundColor: '#151714',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  win.loadFile(path.join(__dirname, 'index.html'));

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  // Automatically check for published update files on startup
  autoUpdater.checkForUpdatesAndNotify();
}

app.whenReady().then(() => {
  ensureDataDir();
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});