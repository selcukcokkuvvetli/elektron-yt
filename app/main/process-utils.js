const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

function spawnManaged(executable, args, options) {
  if (process.platform !== 'win32') return spawn(executable, args, options);
  const host = path.join(path.dirname(executable), 'process-host.exe');
  if (!fs.existsSync(host)) throw new Error('process-host.exe bulunamadi. npm run build:process-host calistirin.');
  const child = spawn(host, [executable, ...args], options);
  child.managedTree = true;
  return child;
}

function killProcessTree(child) {
  if (!child || !child.pid || child.exitCode !== null || child.signalCode) return;
  if (child.managedTree) { child.kill('SIGKILL'); return; }
  if (process.platform === 'win32') {
    const killer = spawn('taskkill', ['/pid', String(child.pid), '/t', '/f'], {
      windowsHide: true, stdio: 'ignore'
    });
    killer.on('error', () => child.kill('SIGKILL'));
    killer.on('close', code => {
      if (code !== 0 && child.exitCode === null) child.kill('SIGKILL');
    });
    return;
  }
  try { process.kill(-child.pid, 'SIGKILL'); }
  catch (_) { child.kill('SIGKILL'); }
}

function cancelledError(message = 'Islem iptal edildi.') {
  const error = new Error(message);
  error.isCancelled = true;
  return error;
}

module.exports = { killProcessTree, cancelledError, spawnManaged };
