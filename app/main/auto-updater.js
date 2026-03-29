const { autoUpdater } = require('electron-updater');

function setupAutoUpdater(options) {
  const app = options.app;
  const logger = typeof options.logger === 'function' ? options.logger : function noop() {};

  if (!app.isPackaged) {
    logger('Auto update sadece paketli uygulamada aktif.');
    return;
  }

  if (process.env.PORTABLE_EXECUTABLE_DIR) {
    logger('Portable build auto update almaz. Manuel update kullanilir.');
    return;
  }

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('checking-for-update', function onChecking() {
    logger('Auto update: guncelleme kontrol ediliyor.');
  });

  autoUpdater.on('update-not-available', function onNoUpdate() {
    logger('Auto update: yeni surum bulunamadi.');
  });

  autoUpdater.on('update-available', function onUpdate(info) {
    logger('Auto update: yeni surum bulundu (' + info.version + '), indiriliyor.');
    autoUpdater.downloadUpdate().catch(function onDownloadError(error) {
      logger('Auto update indirme hatasi: ' + error.message);
    });
  });

  autoUpdater.on('download-progress', function onProgress(progress) {
    logger('Auto update indiriliyor: ' + Math.round(progress.percent || 0) + '%');
  });

  autoUpdater.on('update-downloaded', function onDownloaded(info) {
    logger('Auto update hazir: ' + info.version + '. Uygulama kapaninca kurulacak.');
  });

  autoUpdater.on('error', function onError(error) {
    logger('Auto update hatasi: ' + error.message);
  });

  autoUpdater.checkForUpdates().catch(function onCheckError(error) {
    logger('Auto update kontrol hatasi: ' + error.message);
  });
}

module.exports = setupAutoUpdater;
