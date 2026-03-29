const { contextBridge, ipcRenderer } = require('electron');

function subscribe(channel, callback) {
  const handler = function handler(event, payload) {
    callback(payload);
  };

  ipcRenderer.on(channel, handler);

  return function unsubscribe() {
    ipcRenderer.removeListener(channel, handler);
  };
}

contextBridge.exposeInMainWorld('appApi', {
  bootstrap: function bootstrap() {
    return ipcRenderer.invoke('app:bootstrap');
  },
  startDownloads: function startDownloads(text) {
    return ipcRenderer.invoke('downloads:start', { text: text });
  },
  stopDownloads: function stopDownloads() {
    return ipcRenderer.invoke('downloads:stop');
  },
  retryFailed: function retryFailed(jobId) {
    return ipcRenderer.invoke('downloads:retry-failed', { jobId: jobId });
  },
  clearJobs: function clearJobs() {
    return ipcRenderer.invoke('downloads:clear');
  },
  openDownloadsFolder: function openDownloadsFolder() {
    return ipcRenderer.invoke('downloads:open-folder');
  },
  pickDownloadFolder: function pickDownloadFolder() {
    return ipcRenderer.invoke('downloads:pick-folder');
  },
  openJobFile: function openJobFile(jobId) {
    return ipcRenderer.invoke('downloads:open-job-file', jobId);
  },
  openJobFolder: function openJobFolder(jobId) {
    return ipcRenderer.invoke('downloads:open-job-folder', jobId);
  },
  onSnapshot: function onSnapshot(callback) {
    return subscribe('jobs:snapshot', callback);
  },
  onLog: function onLog(callback) {
    return subscribe('jobs:log', callback);
  }
});
