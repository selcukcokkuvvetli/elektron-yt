const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { assertSender, assertJobId, safeOutput, documentPath, validatePreferences } = require('../app/main/ipc-validation');
const { validateUrl, canonicalUrl } = require('../app/main/urls');
const { createWorkspace } = require('./test-support');

const workspace = createWorkspace('security');
try {
  const html = path.join(workspace.root, 'index.html');
  fs.writeFileSync(html, '<!doctype html>');
  const mainFrame = { url: pathToFileURL(html).href, processId: 1, routingId: 1 };
  const webContents = { mainFrame };
  const window = { isDestroyed: () => false, webContents };
  assert.doesNotThrow(() => assertSender({ sender: webContents, senderFrame: mainFrame }, window, mainFrame.url));
  assert.throws(() => assertSender({ sender: webContents, senderFrame: { ...mainFrame, routingId: 2 } }, window, mainFrame.url), /yetkisiz/);
  assert.throws(() => assertSender({ sender: {}, senderFrame: mainFrame }, window, mainFrame.url), /yetkisiz/);
  assert.throws(() => assertJobId('bad"]'), /kimligi/);
  assert.deepStrictEqual(validatePreferences({ preferredFormat: 'audio' }), { preferredFormat: 'audio' });
  for (const payload of [null, [], {}, { preferredFormat: 'exe' }, { preferredFormat: 'audio', downloadFolder: 'C:/Windows' }, { concurrency: 10 }]) {
    assert.throws(() => validatePreferences(payload), /arayüz tercihi/);
  }
  assert.strictEqual(documentPath(mainFrame.url), documentPath(pathToFileURL(fs.realpathSync(html)).href));
  assert.throws(() => documentPath(mainFrame.url + '?unexpected'), /kayna/);
  for (const url of ['--exec=unexpected', 'file:///C:/Windows', 'https://user:password@example.com']) assert.throws(() => validateUrl(url));
  assert.strictEqual(canonicalUrl('https://youtu.be/fixture?t=4'), canonicalUrl('https://youtube.com/watch?v=fixture'));
  assert.strictEqual(canonicalUrl('https://youtube.com/shorts/fixture'), canonicalUrl('https://youtube.com/watch?v=fixture'));
  const file = path.join(workspace.paths.downloadsDir, 'fixture.mp4');
  fs.writeFileSync(file, 'fixture');
  const job = { status: 'completed', outputPath: file, downloadRoot: workspace.paths.downloadsDir };
  assert.strictEqual(safeOutput(job), fs.realpathSync(file));
  assert.strictEqual(safeOutput({ ...job, status: 'failed' }), null);
  const executable = path.join(workspace.paths.downloadsDir, 'fixture.exe');
  fs.writeFileSync(executable, 'fixture');
  assert.strictEqual(safeOutput({ ...job, outputPath: executable }), null);
  const external = path.join(workspace.root, 'outside.mp4');
  fs.writeFileSync(external, 'fixture');
  assert.strictEqual(safeOutput({ ...job, outputPath: external }), null);
  console.log('PASS T18 sender/frame, payload identities, URLs and media path validation');
} finally { workspace.cleanup(); }
