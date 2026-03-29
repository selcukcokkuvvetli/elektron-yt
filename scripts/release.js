const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: rootDir,
    stdio: 'inherit',
    shell: process.platform === 'win32'
  });

  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

function parseVersionArg() {
  const versionIndex = process.argv.indexOf('--version');
  if (versionIndex >= 0 && process.argv[versionIndex + 1]) {
    return process.argv[versionIndex + 1];
  }

  return null;
}

function getCurrentVersion() {
  return JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8')).version;
}

function main() {
  const requestedVersion = parseVersionArg();
  if (requestedVersion && requestedVersion !== getCurrentVersion()) {
    run('npm', ['version', requestedVersion, '--no-git-tag-version']);
  }

  run('node', ['scripts/generate-icon.js']);
  run('npm', ['run', 'bootstrap:binaries']);
  run('npx', ['electron-builder', '--win', 'portable', 'nsis', '--publish', 'never']);
  run('node', ['scripts/publish-github-release.js']);
}

main();
