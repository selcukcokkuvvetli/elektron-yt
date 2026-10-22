const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { createWorkspace, waitFor, killTree } = require('./test-support');

async function main() {
  const workspace = createWorkspace('instance');
  const env = { ...process.env, ELECTRON_SMOKE_TEST: '1', ELEKTRON_YT_TEST_ROOT: workspace.root, ELEKTRON_YT_LOCK_PROBE: '1' };
  delete env.ELECTRON_RUN_AS_NODE;
  const start = () => {
    const child = spawn(process.env.ELEKTRON_YT_SMOKE_EXE || require('electron'),
      process.env.ELEKTRON_YT_SMOKE_EXE ? [] : ['.'], { cwd: path.resolve(__dirname, '..'), env, windowsHide: true });
    const output = { text: '' };
    child.stdout.on('data', chunk => { output.text += chunk; });
    child.stderr.on('data', chunk => { output.text += chunk; });
    const closed = new Promise((resolve, reject) => { child.once('error', reject); child.once('close', resolve); });
    return { child, output, closed };
  };
  let first, second;
  try {
    first = start();
    await waitFor(() => fs.existsSync(path.join(workspace.root, 'lock-ready')), 'first instance ready', 45000);
    const hash = () => crypto.createHash('sha256').update(fs.readFileSync(workspace.paths.jobsFile)).digest('hex');
    const before = hash();
    second = start();
    await waitFor(() => second.child.exitCode !== null, 'second instance exits', 45000);
    const code = await second.closed;
    assert.strictEqual(code, 0);
    assert.ok(fs.existsSync(path.join(workspace.root, 'lock-rejected')), second.output.text);
    assert.strictEqual(hash(), before);
    if (process.env.ELEKTRON_YT_SMOKE_EXE) {
      const executable = fs.readFileSync(path.join(workspace.root, 'lock-ready'), 'utf8');
      assert.ok(fs.existsSync(path.join(path.dirname(executable), 'resources', 'bin', 'yt-dlp.exe')),
        'Second portable launcher removed the active application files');
    }
    console.log('PASS T17 second instance cannot write the same data root');
  } finally {
    if (first && first.child.exitCode === null) {
      fs.writeFileSync(path.join(workspace.root, 'lock-quit'), 'quit');
      await waitFor(() => first.child.exitCode !== null, 'primary instance shutdown', 15000).catch(() => {});
    }
    for (const instance of [second, first]) if (instance) { await killTree(instance.child); await instance.closed; }
    workspace.cleanup();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
