const assert = require('assert');
const { EventEmitter } = require('events');
const setup = require('../app/main/auto-updater');
const before = process.env.PORTABLE_EXECUTABLE_DIR;
try {
  delete process.env.PORTABLE_EXECUTABLE_DIR;
  let checks = 0, downloads = 0;
  const updater = new EventEmitter();
  updater.checkForUpdates = async () => { checks++; };
  updater.downloadUpdate = async () => { downloads++; };
  const logs = [];
  setup({ app: { isPackaged: false }, updater, logger: line => logs.push(line) });
  assert.strictEqual(checks, 0);
  process.env.PORTABLE_EXECUTABLE_DIR = 'fixture';
  setup({ app: { isPackaged: true }, updater, logger: line => logs.push(line) });
  assert.strictEqual(checks, 0);
  delete process.env.PORTABLE_EXECUTABLE_DIR;
  setup({ app: { isPackaged: true }, updater, logger: line => logs.push(line) });
  assert.strictEqual(checks, 1);
  assert.strictEqual(updater.autoInstallOnAppQuit, true);
  assert.strictEqual(updater.allowPrerelease, false);
  updater.emit('update-available', { version: '1.2.1' });
  assert.strictEqual(downloads, 1);
  updater.emit('update-downloaded', { version: '1.2.1' });
  updater.emit('error', new Error('fixture network failure'));
  assert.ok(logs.some(line => line.includes('fixture network failure')));
  assert.ok(logs.some(line => line.includes('kapaninca kurulacak')));
  console.log('PASS updater dev/portable/installer routing and event handling (isolated update feed still pending)');
} finally {
  if (before === undefined) delete process.env.PORTABLE_EXECUTABLE_DIR;
  else process.env.PORTABLE_EXECUTABLE_DIR = before;
}
