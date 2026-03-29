const fs = require('fs');
const path = require('path');

function resolveAppPaths(electronApp) {
  const baseDir = electronApp.isPackaged
    ? path.dirname(process.execPath)
    : path.resolve(__dirname, '..', '..');

  return {
    baseDir,
    dataDir: path.join(baseDir, 'data'),
    logsDir: path.join(baseDir, 'data', 'logs'),
    downloadsDir: path.join(baseDir, 'downloads'),
    jobsFile: path.join(baseDir, 'data', 'jobs.json'),
    settingsFile: path.join(baseDir, 'data', 'settings.json'),
    archiveFile: path.join(baseDir, 'data', 'archive.txt'),
    binDir: electronApp.isPackaged
      ? path.join(process.resourcesPath, 'bin')
      : path.join(baseDir, 'app', 'bin')
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
