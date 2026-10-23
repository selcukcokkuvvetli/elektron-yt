const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { execFile } = require('child_process');
const { app, BrowserWindow } = require('electron');
const { ensureAppPaths, resolveAppPaths } = require('./paths');
const JobStore = require('./job-store');
const SettingsStore = require('./settings-store');
const DownloadManager = require('./download-manager');
const registerIpc = require('./ipc');
const setupAutoUpdater = require('./auto-updater');

const smoke = process.env.ELECTRON_SMOKE_TEST === '1';
const paths = resolveAppPaths(app);
const profile = path.join(paths.dataDir, 'profile');
fs.mkdirSync(profile, { recursive: true });
app.setPath('userData', profile);
let manager;
let mainWindow;
let quitting = false;
const rendererFile = path.join(__dirname, '..', 'renderer', 'index.html');
const rendererUrl = pathToFileURL(rendererFile).href;

if (!app.requestSingleInstanceLock()) {
  if (smoke && process.env.ELEKTRON_YT_LOCK_PROBE === '1') {
    fs.writeFileSync(path.join(process.env.ELEKTRON_YT_TEST_ROOT, 'lock-rejected'), 'rejected');
    console.log('LOCK_REJECTED');
  }
  app.quit();
}
else {
  app.on('second-instance', () => {
    if (mainWindow) { if (mainWindow.isMinimized()) mainWindow.restore(); mainWindow.focus(); }
  });
  app.whenReady().then(() => {
    ensureAppPaths(paths);
    const settingsStore = new SettingsStore(paths.settingsFile, {
      concurrency: 3, preferredFormat: 'audio', downloadFolder: paths.downloadsDir, maxRetries: 3, jobTimeoutMs: 180000,
      startupTimeoutMs: 60000, postprocessTimeoutMs: 600000, analysisTimeoutMs: 60000, analysisConcurrency: 1
    });
    manager = new DownloadManager({ paths, jobStore: new JobStore(paths.jobsFile), settingsStore });
    manager.initialize();
    registerIpc({ getWindow: () => mainWindow, manager, rendererUrl });
    createWindow();
    if (!smoke) setupAutoUpdater({ app, logger: manager.log.bind(manager) });
    app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
  }).catch(error => { console.error(error); app.exit(1); });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280, height: 820, minWidth: 960, minHeight: 640, show: !smoke,
    backgroundColor: '#0d1118', title: 'Elektron YT',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true,
      nodeIntegration: false, sandbox: true, webSecurity: true, webviewTag: false,
      allowRunningInsecureContent: false }
  });
  const contents = mainWindow.webContents;
  contents.setWindowOpenHandler(() => ({ action: 'deny' }));
  contents.on('will-navigate', (event, url) => { if (url !== rendererUrl) event.preventDefault(); });
  contents.session.setPermissionRequestHandler((webContents, permission, callback) => callback(false));
  if (smoke) {
    const failures = [];
    contents.on('preload-error', (event, file, error) => failures.push(String(error)));
    contents.on('render-process-gone', (event, details) => failures.push('Renderer: ' + details.reason));
    contents.on('console-message', event => {
      if (event.level === 'error' || event.level === 3) failures.push(event.message);
    });
    contents.once('did-fail-load', () => app.exit(1));
    contents.once('did-finish-load', async () => {
      try {
        if (process.env.ELEKTRON_YT_LOCK_PROBE === '1') {
          fs.writeFileSync(path.join(process.env.ELEKTRON_YT_TEST_ROOT, 'lock-ready'), process.execPath);
          console.log('LOCK_READY');
          const hold = setInterval(() => {
            if (fs.existsSync(path.join(process.env.ELEKTRON_YT_TEST_ROOT, 'lock-quit'))) {
              clearInterval(hold);
              app.quit();
            }
          }, 100);
          hold.unref();
          return;
        }
        const report = await contents.executeJavaScript(require('./smoke-check').replace('__ANALYSIS_URL__',
          JSON.stringify(process.env.ELEKTRON_YT_SMOKE_ANALYSIS_URL || null)));
        report.appVersion = app.getVersion();
        report.electron = process.versions.electron;
        report.embeddedNode = await new Promise((resolve, reject) => {
          execFile(process.execPath, ['--version'], { env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
            windowsHide: true, timeout: 10000 }, (error, stdout) => error ? reject(error) : resolve(stdout.trim()));
        });
        if (!/^v24\./.test(report.embeddedNode)) throw new Error('Embedded Node runtime unavailable');
        if (failures.length) throw new Error(failures.join('\n'));
        fs.writeFileSync(path.join(process.env.ELEKTRON_YT_TEST_ROOT, 'smoke-report.json'), JSON.stringify(report));
        app.quit();
      } catch (error) {
        fs.writeFileSync(path.join(process.env.ELEKTRON_YT_TEST_ROOT, 'smoke-error.txt'), error.stack || String(error));
        console.error(error);
        app.exit(1);
      }
    });
  }
  mainWindow.loadFile(rendererFile);
  return mainWindow;
}

app.on('before-quit', event => {
  if (!manager || quitting) return;
  event.preventDefault();
  quitting = true;
  manager.dispose().then(() => app.quit(), error => { console.error(error); app.exit(1); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
