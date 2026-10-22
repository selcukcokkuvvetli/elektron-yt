const fs = require('fs');
const path = require('path');
const { build, Platform, Arch } = require('electron-builder');
const asar = require('@electron/asar');

// A private test successor, never a release asset or a change to the real version.
module.exports = async function buildUpdateFixture(root, workspace, feedUrl) {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json')));
  const parts = pkg.version.split('.').map(Number);
  const version = [parts[0], parts[1], parts[2] + 1].join('.');
  const project = path.join(workspace, 'update-fixture');
  const output = path.join(project, 'out');
  fs.mkdirSync(project);
  // Reuse the already packaged production dependency tree. A node_modules junction
  // confuses dependency collection and can omit updater dependencies in the fixture.
  const runtimeBasis = path.join(project, 'runtime-basis');
  asar.extractAll(path.join(root, 'release', pkg.version, 'win-unpacked', 'resources', 'app.asar'), runtimeBasis);
  fs.renameSync(path.join(runtimeBasis, 'node_modules'), path.join(project, 'node_modules'));
  fs.cpSync(path.join(root, 'app'), path.join(project, 'app'), { recursive: true,
    filter: source => ![path.join(root, 'app', 'bin'), path.join(root, 'app', 'licenses')].includes(source) });
  // Do not merge the production GitHub provider's owner/repo into the generic provider.
  fs.writeFileSync(path.join(project, 'package.json'), JSON.stringify({ ...pkg, version, build: undefined }));
  await build({ projectDir: project, targets: Platform.WINDOWS.createTarget(['nsis'], Arch.x64), publish: 'never',
    config: { ...pkg.build, extends: null, electronVersion: pkg.devDependencies.electron, npmRebuild: false,
      compression: 'store', directories: { output, buildResources: path.join(root, 'build') },
      extraResources: pkg.build.extraResources.map(entry => ({ ...entry, from: path.resolve(root, entry.from) })),
      nsis: { ...pkg.build.nsis, artifactName: 'Elektron-YT-Test-Update-${version}.${ext}' },
      publish: { provider: 'generic', url: feedUrl } } });
  return { version, output, synthetic: true };
};
