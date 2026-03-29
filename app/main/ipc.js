const fs = require('fs');
const path = require('path');
const { dialog, ipcMain, shell } = require('electron');

function registerIpc(options) {
  const mainWindow = options.mainWindow;
  const manager = options.manager;

  const sendSnapshot = function sendSnapshot(snapshot) {
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send('jobs:snapshot', snapshot);
    }
  };

  const sendLog = function sendLog(line) {
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send('jobs:log', line);
    }
  };

  manager.on('snapshot', sendSnapshot);
  manager.on('log', sendLog);

  ipcMain.handle('app:bootstrap', function bootstrap() {
    return manager.getState();
  });

  ipcMain.handle('downloads:start', function start(event, payload) {
    return manager.startDownloads(
      payload && payload.text ? payload.text : '',
      payload && payload.format ? payload.format : 'video'
    );
  });

  ipcMain.handle('downloads:stop', function stop() {
    return manager.stopAll();
  });

  ipcMain.handle('downloads:retry-failed', function retry(event, payload) {
    return manager.retryFailed(payload && payload.jobId ? payload.jobId : null);
  });

  ipcMain.handle('downloads:clear', function clear() {
    return manager.clearJobs();
  });

  ipcMain.handle('downloads:open-folder', function openFolder() {
    return shell.openPath(manager.settings.downloadFolder);
  });

  ipcMain.handle('downloads:pick-folder', async function pickFolder() {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Indirme klasoru sec',
      defaultPath: manager.settings.downloadFolder,
      properties: ['openDirectory', 'createDirectory']
    });

    if (result.canceled || !result.filePaths.length) {
      return manager.getState();
    }

    return manager.updateSettings({
      downloadFolder: result.filePaths[0]
    });
  });

  ipcMain.handle('downloads:open-job-file', function openJobFile(event, jobId) {
    const job = manager.findJob(jobId);
    if (!job || !job.outputPath || !fs.existsSync(job.outputPath)) {
      return false;
    }

    return shell.openPath(job.outputPath);
  });

  ipcMain.handle('downloads:open-job-folder', function openJobFolder(event, jobId) {
    const job = manager.findJob(jobId);
    const folder = job && job.outputPath ? path.dirname(job.outputPath) : manager.settings.downloadFolder;
    return shell.openPath(folder);
  });
}

module.exports = registerIpc;
