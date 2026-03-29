const path = require('path');
const { spawn } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const electronExe = path.join(rootDir, 'node_modules', 'electron', 'dist', 'electron.exe');
const env = Object.assign({}, process.env, {
  ELECTRON_SMOKE_TEST: '1'
});

delete env.ELECTRON_RUN_AS_NODE;

const child = spawn(electronExe, ['.'], {
  cwd: rootDir,
  env: env,
  stdio: 'inherit'
});

const timeout = setTimeout(function onTimeout() {
  child.kill();
  process.exit(1);
}, 20000);

child.on('exit', function onExit(code) {
  clearTimeout(timeout);
  process.exit(code);
});
