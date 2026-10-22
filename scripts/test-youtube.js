// Optional external-service check. Deliberately excluded from deterministic tests/CI.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Runner = require('../app/main/ytdlp-runner');
const { createWorkspace } = require('./test-support');

async function main() {
  const workspace = createWorkspace('youtube');
  const results = [];
  let task;
  let timer;
  try {
    const runner = new Runner({ ...workspace.paths, binDir: path.resolve(__dirname, '..', 'app', 'bin') });
    const input = process.env.ELEKTRON_YT_TEST_VIDEO || 'https://www.youtube.com/watch?v=jNQXAC9IVRw';
    const resolved = await runner.resolveInput(input, { timeoutMs: 60000 });
    assert.strictEqual(resolved.sourceType, 'single');
    for (const format of ['video', 'audio']) {
      let progress = false;
      task = runner.start({ url: resolved.items[0].url, format }, {
        downloadFolder: path.join(workspace.paths.downloadsDir, format),
        onUpdate: patch => { if (patch.progress > 0) progress = true; }
      });
      timer = setTimeout(() => task.cancel(), 90000);
      const result = await task.promise;
      clearTimeout(timer);
      task = null;
      assert.ok(progress && fs.existsSync(result.outputPath));
      results.push({ format, title: resolved.items[0].title, bytes: fs.statSync(result.outputPath).size,
        extension: path.extname(result.outputPath), passed: true });
      console.log('PASS external YouTube ' + JSON.stringify(results.at(-1)));
    }
    if (process.env.ELEKTRON_YT_TEST_PLAYLIST) {
      const playlist = await runner.resolveInput(process.env.ELEKTRON_YT_TEST_PLAYLIST, { timeoutMs: 60000 });
      assert.strictEqual(playlist.sourceType, 'playlist');
      assert.ok(playlist.items.length > 0);
      results.push({ playlist: true, items: playlist.items.length, passed: true });
    }
  } finally {
    clearTimeout(timer);
    if (task) { task.cancel(); await task.promise.catch(() => {}); }
    fs.mkdirSync(path.resolve(__dirname, '..', 'verification'), { recursive: true });
    fs.writeFileSync(path.resolve(__dirname, '..', 'verification', 'youtube.json'), JSON.stringify({ results }, null, 2));
    workspace.cleanup();
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
