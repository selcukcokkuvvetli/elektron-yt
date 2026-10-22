const fs = require('fs');
const path = require('path');
const { build, Platform, Arch } = require('electron-builder');

// A private test successor, never a release asset or a change to the real version.
module.exports = async function buildUpdateFixture(root, workspace, feedUrl) {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json')));
  const parts = pkg.version.split('.').map(Number);
  const version = [parts[0], parts[1], parts[2] + 1].join('.');
  const project = path.join(workspace, 'update-fixture');
  const output = path.join(project, 'out');
  fs.mkdirSync(project);
  fs.cpSync(path.join(root, 'app'), path.join(project, 'app'), { recursive: true,
    filter: source => ![path.join(root, 'app', 'bin'), path.join(root, 'app', 'licenses')].includes(source) });
  fs.symlinkSync(path.join(root, 'node_modules'), path.join(project, 'node_modules'), 'junction');
  fs.writeFileSync(path.join(project, 'package.json'), JSON.stringify({ ...pkg, version }));
  await build({ projectDir: project, targets: Platform.WINDOWS.createTarget(['nsis'], Arch.x64), publish: 'never',
    config: { ...pkg.build, extends: null, electronVersion: pkg.devDependencies.electron, npmRebuild: false,
      compression: 'store', directories: { output, buildResources: path.join(root, 'build') },
      extraResources: pkg.build.extraResources.map(entry => ({ ...entry, from: path.resolve(root, entry.from) })),
      nsis: { ...pkg.build.nsis, artifactName: 'Elektron-YT-Test-Update-${version}.${ext}' },
      publish: { provider: 'generic', url: feedUrl } } });
  return { version, output, synthetic: true };
};
