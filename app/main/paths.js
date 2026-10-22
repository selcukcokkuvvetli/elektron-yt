const fs = require('fs');
const path = require('path');

function resolveAppPaths(electronApp) {
  if (process.env.ELECTRON_SMOKE_TEST === '1' && (!process.env.ELEKTRON_YT_TEST_ROOT
    || !path.isAbsolute(process.env.ELEKTRON_YT_TEST_ROOT))) {
    throw new Error('Smoke testi mutlak bir ELEKTRON_YT_TEST_ROOT gerektirir; kullanici verisi kullanilamaz.');
  }
  const runtimeDir = electronApp.isPackaged
    ? path.dirname(process.execPath)
    : path.resolve(__dirname, '..', '..');
  const portableDataDir = process.env.PORTABLE_EXECUTABLE_DIR
    ? path.join(process.env.PORTABLE_EXECUTABLE_DIR, 'data')
    : null;
  const testRoot = process.env.ELECTRON_SMOKE_TEST === '1' && process.env.ELEKTRON_YT_TEST_ROOT
    ? path.resolve(process.env.ELEKTRON_YT_TEST_ROOT) : null;
  const userDataDir = testRoot ? path.join(testRoot, 'data') : electronApp.isPackaged
    ? (portableDataDir || electronApp.getPath('userData'))
    : path.join(runtimeDir, 'data');
  const downloadsDir = testRoot ? path.join(testRoot, 'downloads') : electronApp.isPackaged
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
