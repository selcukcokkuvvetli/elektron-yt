const assert = require('assert');
const crypto = require('crypto');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { createWorkspace, killTree } = require('./test-support');

const rootDir = path.resolve(__dirname, '..');
const protectedFiles = ['data/jobs.json', 'data/settings.json', 'data/archive.txt'];
function fingerprints() {
  return protectedFiles.map(file => fs.existsSync(path.join(rootDir, file))
    ? crypto.createHash('sha256').update(fs.readFileSync(path.join(rootDir, file))).digest('hex') : null);
}

async function main() {
  const workspace = createWorkspace('smoke');
  const jobCount = Number(process.env.ELEKTRON_YT_SMOKE_JOBS || 0);
  assert.ok(Number.isInteger(jobCount) && jobCount >= 0 && jobCount <= 5000);
  fs.writeFileSync(workspace.paths.jobsFile, JSON.stringify(Array.from({ length: jobCount }, (_, index) => ({
    id: 'fixture_' + index, url: 'https://www.youtube.com/watch?v=fixture-' + index,
    status: 'completed', format: 'video', title: 'Fixture ' + index
  }))));
  const before = fingerprints();
  const connections = new Set();
  const pendingServer = http.createServer(() => {});
  pendingServer.on('connection', socket => { connections.add(socket); socket.once('close', () => connections.delete(socket)); });
  await new Promise(resolve => pendingServer.listen(0, '127.0.0.1', resolve));
  const env = { ...process.env, ELECTRON_SMOKE_TEST: '1', ELEKTRON_YT_TEST_ROOT: workspace.root };
  env.ELEKTRON_YT_SMOKE_ANALYSIS_URL = 'http://127.0.0.1:' + pendingServer.address().port + '/pending';
  delete env.ELECTRON_RUN_AS_NODE;
  let child;
  let timeout;
  try {
    const executable = process.env.ELEKTRON_YT_SMOKE_EXE || require('electron');
    const args = process.env.ELEKTRON_YT_SMOKE_EXE ? [] : ['.'];
    child = spawn(executable, args, { cwd: rootDir, env, windowsHide: true, stdio: 'inherit' });
    await new Promise((resolve, reject) => {
      timeout = setTimeout(() => { killTree(child).then(() => reject(new Error('Electron smoke timeout'))); }, 30000);
      child.once('error', reject);
      child.once('close', (code, signal) => code === 0 && !signal
        ? resolve() : reject(new Error('Electron failed: code=' + code + ', signal=' + signal)));
    });
    assert.ok(fs.existsSync(workspace.paths.jobsFile));
    const report = JSON.parse(fs.readFileSync(path.join(workspace.root, 'smoke-report.json'), 'utf8'));
    assert.strictEqual(report.jobs, jobCount);
    assert.ok(report.bootstrap && report.buttons && report.ipcValidation);
    assert.ok(report.responsiveAnalysis);
    assert.ok(report.renderMs < 250, 'Renderer exceeded 250ms budget: ' + report.renderMs);
    console.log('SMOKE_REPORT ' + JSON.stringify(report));
    assert.deepStrictEqual(fingerprints(), before, 'Smoke test changed user data');
    console.log('Electron smoke passed; user data unchanged.');
  } catch (error) {
    const diagnostic = path.join(workspace.root, 'smoke-error.txt');
    if (fs.existsSync(diagnostic)) console.error(fs.readFileSync(diagnostic, 'utf8'));
    throw error;
  } finally {
    clearTimeout(timeout);
    await killTree(child);
    for (const socket of connections) socket.destroy();
    await new Promise(resolve => pendingServer.close(resolve));
    workspace.cleanup();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
