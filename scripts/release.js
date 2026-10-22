const path = require('path');
const { assertVersion, packageInfo } = require('./build-utils');
const { run } = require('./file-utils');
async function main() {
  const root = path.resolve(__dirname, '..');
  const index = process.argv.indexOf('--version');
  if (index >= 0) {
    const version = assertVersion(process.argv[index + 1]);
    const npm = process.env.npm_execpath || path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js');
    if (version !== packageInfo(root).version) {
      await run(process.execPath, [npm, 'version', version, '--no-git-tag-version'], { cwd: root, stdio: 'inherit' });
    }
  }
  for (const [script, args] of [['test-all.js', ['--binaries']], ['build.js', ['--target', 'all']],
    ['test-packages.js', []], ['publish-github-release.js', ['--dry-run']]]) {
    await run(process.execPath, [path.join(__dirname, script), ...args], { cwd: root, stdio: 'inherit' });
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
