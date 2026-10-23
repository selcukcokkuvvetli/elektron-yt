const path = require('path');
const { dialog, ipcMain, shell } = require('electron');
const { assertSender, assertJobId, safeOutput, validatePreferences } = require('./ipc-validation');

function registerIpc({ getWindow, manager, rendererUrl }) {
  const send = (channel, payload) => {
    const window = getWindow();
    if (window && !window.isDestroyed()) window.webContents.send(channel, payload);
  };
  manager.on('snapshot', payload => send('jobs:snapshot', payload));
  manager.on('delta', payload => send('jobs:delta', payload));
  manager.on('log', payload => send('jobs:log', payload));
  const handle = (channel, action) => ipcMain.handle(channel, (event, ...args) => {
    assertSender(event, getWindow(), rendererUrl);
    return action(...args);
  });
  handle('app:bootstrap', () => manager.getState());
  handle('downloads:start', payload => {
    if (!payload || typeof payload.text !== 'string' || payload.text.length > 2 * 1024 * 1024
      || !['video', 'audio'].includes(payload.format)) throw new Error('Gecersiz indirme girisi.');
    return manager.startDownloads(payload.text, payload.format);
  });
  handle('downloads:stop', () => manager.stopAll());
  handle('settings:preferences', payload => manager.updateSettings(validatePreferences(payload)));
  handle('downloads:retry-failed', payload => {
    const id = payload && payload.jobId;
    assertJobId(id, true);
    return manager.retryFailed(id);
  });
  handle('downloads:clear', () => manager.clearJobs());
  handle('downloads:open-folder', () => shell.openPath(manager.settings.downloadFolder));
  handle('downloads:pick-folder', async () => {
    const result = await dialog.showOpenDialog(getWindow(), {
      title: 'Indirme klasoru sec', defaultPath: manager.settings.downloadFolder,
      properties: ['openDirectory', 'createDirectory']
    });
    return result.canceled || !result.filePaths.length ? manager.getState()
      : manager.updateSettings({ downloadFolder: result.filePaths[0] });
  });
  for (const action of ['file', 'folder']) {
    handle('downloads:open-job-' + action, id => {
      assertJobId(id);
      const file = safeOutput(manager.findJob(id), manager.settings.downloadFolder);
      if (!file) throw new Error('Dogrulanmis medya dosyasi bulunamadi.');
      return shell.openPath(action === 'file' ? file : path.dirname(file));
    });
  }
}
module.exports = registerIpc;
