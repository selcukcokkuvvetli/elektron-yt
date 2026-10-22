const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const { hashFile, contained } = require('./file-utils');

function assertVersion(version) {
  if (typeof version !== 'string' || !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version)) {
    throw new Error('Stable SemVer required (example: 1.2.0).');
  }
  return version;
}
function packageInfo(root) {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json')));
  assertVersion(pkg.version);
  const lock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json')));
  if (lock.version !== pkg.version || lock.packages[''].version !== pkg.version) throw new Error('Manifest/lock version mismatch');
  return pkg;
}
function releaseNames(version) {
  assertVersion(version);
  return ['Elektron-YT-Portable-' + version + '.exe', 'Elektron-YT-Setup-' + version + '.exe',
    'Elektron-YT-Setup-' + version + '.exe.blockmap', 'build-info.json', 'latest.yml'];
}
async function sourceHash(root) {
  const files = ['package.json', 'package-lock.json', 'build/icon.ico', 'build/icon.png'];
  const walk = dir => {
    for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
      const relative = dir + '/' + entry.name;
      if (entry.isDirectory()) walk(relative);
      else if (!relative.startsWith('app/bin/')) files.push(relative);
    }
  };
  walk('app');
  walk('scripts');
  const hash = crypto.createHash('sha256');
  for (const file of files.sort()) hash.update(file + '\0' + await hashFile(contained(root, file)) + '\n');
  return hash.digest('hex');
}
function gitState(root) {
  const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8', windowsHide: true }).trim();
  const dirty = !!execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8', windowsHide: true }).trim();
  return { commit, dirty };
}

module.exports = { assertVersion, packageInfo, releaseNames, sourceHash, gitState };
