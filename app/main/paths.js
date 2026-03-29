const fs = require('fs');
const path = require('path');

function resolveAppPaths(electronApp) {
  const runtimeDir = electronApp.isPackaged
    ? path.dirname(process.execPath)
    : path.resolve(__dirname, '..', '..');
  const portableDataDir = process.env.PORTABLE_EXECUTABLE_DIR
    ? path.join(process.env.PORTABLE_EXECUTABLE_DIR, 'data')
    : null;
  const userDataDir = electronApp.isPackaged
    ? (portableDataDir || electronApp.getPath('userData'))
    : path.join(runtimeDir, 'data');
  const downloadsDir = electronApp.isPackaged
    ? (portableDataDir ? path.join(process.env.PORTABLE_EXECUTABLE_DIR, 'downloads') : path.join(userDataDir, 'downloads'))
    : path.join(runtimeDir, 'downloads');

  return {
    baseDir: runtimeDir,
    runtimeDir,
    dataDir: userDataDir,
    logsDir: path.join(userDataDir, 'logs'),
    downloadsDir: downloadsDir,
    jobsFile: path.join(userDataDir, 'jobs.json'),
    settingsFile: path.join(userDataDir, 'settings.json'),
    archiveFile: path.join(userDataDir, 'archive.txt'),
    binDir: electronApp.isPackaged
      ? path.join(process.resourcesPath, 'bin')
      : path.join(runtimeDir, 'app', 'bin')
  };
}

function ensureDir(target) {
  fs.mkdirSync(target, { recursive: true });
}

function ensureFile(target, initialValue) {
  if (!fs.existsSync(target)) {
    fs.writeFileSync(target, initialValue, 'utf8');
  }
}

function ensureAppPaths(appPaths) {
  ensureDir(appPaths.dataDir);
  ensureDir(appPaths.logsDir);
  ensureDir(appPaths.downloadsDir);
  ensureDir(appPaths.binDir);
  ensureFile(appPaths.jobsFile, '[]');
  ensureFile(appPaths.settingsFile, '{}');
  ensureFile(appPaths.archiveFile, '');
}

module.exports = {
  ensureAppPaths,
  resolveAppPaths
};
