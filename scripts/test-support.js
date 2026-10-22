const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { ensureAppPaths } = require('../app/main/paths');

function createWorkspace(name) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'elektron-yt-test-' + name + '-'));
  const paths = {
    baseDir: root, runtimeDir: root, dataDir: path.join(root, 'data'),
    logsDir: path.join(root, 'data', 'logs'), downloadsDir: path.join(root, 'downloads'),
    jobsFile: path.join(root, 'data', 'jobs.json'), settingsFile: path.join(root, 'data', 'settings.json'),
    archiveFile: path.join(root, 'data', 'archive.txt'), binDir: path.join(root, 'bin')
  };
  ensureAppPaths(paths);
  return { root, paths, cleanup() {
    // Remove only the exact temporary workspace allocated above.
    assert.strictEqual(path.dirname(root), path.resolve(os.tmpdir()));
    assert.ok(path.basename(root).startsWith('elektron-yt-test-'));
    fs.rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  } };
}

async function waitFor(predicate, message, timeoutMs = 5000) {
  const end = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() >= end) throw new Error('Timed out: ' + message);
    await new Promise(resolve => setTimeout(resolve, 10));
  }
}

function killTree(child) {
  if (!child || !child.pid || child.exitCode !== null || child.signalCode) return Promise.resolve();
  return new Promise(resolve => {
    if (process.platform === 'win32') {
      const killer = spawn('taskkill', ['/pid', String(child.pid), '/t', '/f'], { windowsHide: true, stdio: 'ignore' });
      killer.once('error', () => { child.kill(); resolve(); });
      killer.once('close', resolve);
    } else {
      try { process.kill(-child.pid, 'SIGKILL'); } catch (_) { child.kill('SIGKILL'); }
      resolve();
    }
  });
}

module.exports = { createWorkspace, waitFor, killTree };
