const path = require('path');
const { run } = require('./file-utils');
async function main() {
  const scripts = ['test-process-host.js', 'test-stores.js', 'test-logic.js', 'test-engine.js', 'test-security.js', 'test-release.js', 'test-updater.js',
    'smoke-electron.js', 'test-instance.js', 'test-performance.js'];
  if (process.argv.includes('--binaries')) scripts.push('test-runner.js');
  for (const script of scripts) {
    console.log('\nRunning ' + script);
    await run(process.execPath, [path.join(__dirname, script)], { stdio: 'inherit', timeoutMs: 120000 });
  }
  console.log('\nAll selected checks passed.');
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
