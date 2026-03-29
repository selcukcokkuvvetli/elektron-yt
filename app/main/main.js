const path = require('path');
const { app, BrowserWindow } = require('electron');
const { ensureAppPaths, resolveAppPaths } = require('./paths');
const JobStore = require('./job-store');
const SettingsStore = require('./settings-store');
const DownloadManager = require('./download-manager');
const registerIpc = require('./ipc');

let manager = null;
let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1480,
    height: 940,
    minWidth: 1180,
    minHeight: 720,
    backgroundColor: '#08131a',
    title: 'Elektron YT',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  if (process.env.ELECTRON_SMOKE_TEST === '1') {
    mainWindow.webContents.once('did-finish-load', function onLoad() {
      setTimeout(function quitSoon() {
        app.quit();
      }, 1500);
    });
  }

  return mainWindow;
}

app.whenReady().then(function onReady() {
  const appPaths = resolveAppPaths(app);
  ensureAppPaths(appPaths);

  const settingsStore = new SettingsStore(appPaths.settingsFile, {
    concurrency: 3,
    downloadFolder: appPaths.downloadsDir
  });

  const jobStore = new JobStore(appPaths.jobsFile);
  manager = new DownloadManager({
    jobStore: jobStore,
    settingsStore: settingsStore,
    paths: appPaths
  });
  manager.initialize();

  const window = createWindow();
  registerIpc({
    mainWindow: window,
    manager: manager
  });

  app.on('activate', function onActivate() {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('before-quit', function beforeQuit() {
  if (manager) {
    manager.dispose();
  }
});

app.on('window-all-closed', function onAllClosed() {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
