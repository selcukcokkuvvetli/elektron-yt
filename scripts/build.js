const fs = require('fs');
const path = require('path');
const { build, Platform, Arch } = require('electron-builder');
const { verifyEntries } = require('./bootstrap-binaries');
const { packageInfo, sourceHash, gitState, releaseNames } = require('./build-utils');
const { hashFile, run } = require('./file-utils');

async function main() {
  const root = path.resolve(__dirname, '..');
  const pkg = packageInfo(root);
  const index = process.argv.indexOf('--target');
  const target = index < 0 ? 'all' : process.argv[index + 1];
  if (!['portable', 'nsis', 'all'].includes(target)) throw new Error('Target must be portable, nsis or all');
  const targets = target === 'all' ? ['portable', 'nsis'] : [target];
  require('./build-process-host')();
  const binaries = await verifyEntries();
  await run(process.execPath, [path.join(__dirname, 'generate-icon.js')], { stdio: 'inherit' });
  const output = path.join(root, 'release', pkg.version);
  const fingerprint = await sourceHash(root);
  await build({ targets: Platform.WINDOWS.createTarget(targets, Arch.x64), publish: 'never',
    config: { directories: { output } } });
  await verifyEntries(path.join(output, 'win-unpacked', 'resources'));
  if (await sourceHash(root) !== fingerprint) throw new Error('Source changed during build; rebuild before publication.');
  const files = [];
  for (const name of releaseNames(pkg.version).filter(name => name !== 'build-info.json')) {
    const file = path.join(output, name);
    if (fs.existsSync(file)) files.push({ name, sha256: await hashFile(file) });
  }
  fs.writeFileSync(path.join(output, 'build-info.json'), JSON.stringify({
    version: pkg.version, ...gitState(root), sourceHash: fingerprint,
    node: process.version, electron: pkg.devDependencies.electron, builder: pkg.devDependencies['electron-builder'],
    updater: pkg.dependencies['electron-updater'], targets, binaries, files,
    processHostSha256: await hashFile(path.join(output, 'win-unpacked', 'resources', 'bin', 'process-host.exe')),
    createdAt: new Date().toISOString()
  }, null, 2));
  console.log('Local packages ready: ' + output);
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
