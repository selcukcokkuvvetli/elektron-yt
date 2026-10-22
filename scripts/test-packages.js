const path = require('path');
const { packageInfo } = require('./build-utils');
const { run } = require('./file-utils');
async function main() {
  const root = path.resolve(__dirname, '..');
  const { version } = packageInfo(root);
  for (const file of ['win-unpacked/ElektronYT.exe', 'Elektron-YT-Portable-' + version + '.exe']) {
    console.log('Verifying packaged app: ' + file);
    await run(process.execPath, [path.join(__dirname, 'smoke-electron.js')], { stdio: 'inherit', timeoutMs: 120000,
      env: { ...process.env, ELEKTRON_YT_SMOKE_EXE: path.join(root, 'release', version, file) } });
    await run(process.execPath, [path.join(__dirname, 'test-instance.js')], { stdio: 'inherit', timeoutMs: 120000,
      env: { ...process.env, ELEKTRON_YT_SMOKE_EXE: path.join(root, 'release', version, file) } });
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
