const assert = require('assert');
const fs = require('fs');
const http = require('http');
const path = require('path');
const { spawn } = require('child_process');
const DownloadManager = require('../app/main/download-manager');
const YtDlpRunner = require('../app/main/ytdlp-runner');
const JobStore = require('../app/main/job-store');
const SettingsStore = require('../app/main/settings-store');
const { createWorkspace, waitFor, killTree } = require('./test-support');

async function runBinary(executable, args) {
  const child = spawn(executable, args, { windowsHide: true });
  let stderr = '';
  child.stderr.on('data', chunk => { stderr += chunk; });
  let timer;
  try {
    await new Promise((resolve, reject) => {
      timer = setTimeout(() => killTree(child).then(() => reject(new Error('Fixture process timeout'))), 20000);
      child.once('error', reject);
      child.once('close', code => code === 0 ? resolve() : reject(new Error(stderr || ('Exit ' + code))));
    });
  } finally { clearTimeout(timer); await killTree(child); }
}

async function main() {
  const workspace = createWorkspace('runner');
  const paths = { ...workspace.paths, binDir: process.env.ELEKTRON_YT_TEST_BIN_DIR
    ? path.resolve(process.env.ELEKTRON_YT_TEST_BIN_DIR) : path.resolve(__dirname, '..', 'app', 'bin') };
  const runner = new YtDlpRunner(paths);
  runner.ensureYtDlpExists();
  runner.ensureFfmpegExists();
  const sample = path.join(workspace.root, 'sample.mp4');
  let manager;
  let liveTask;
  let slowBytes = 0;
  let stalledBytes = 0;
  let pendingRequested = false;
  const unicodeTitle = 'İğdır Şarkı Çığ Özgür';
  const unicodeUrl = '/' + encodeURIComponent(unicodeTitle) + '.mp4';
  const sockets = new Set();
  const server = http.createServer((req, res) => {
    if (req.url === '/pending') { pendingRequested = true; return; }
    const isSample = req.url === '/sample.mp4' || req.url === unicodeUrl;
    const data = isSample ? fs.readFileSync(sample) : Buffer.alloc(512 * 1024, 42);
    res.writeHead(200, { 'Content-Type': 'video/mp4', 'Content-Length': data.length });
    if (req.method === 'HEAD') { res.end(); return; }
    if (isSample) { res.end(data); return; }
    if (req.url === '/stalled.mp4') { res.write(data.subarray(0, 32768)); stalledBytes += 32768; return; }
    let offset = 0;
    const timer = setInterval(() => {
      if (res.destroyed) { clearInterval(timer); return; }
      const chunk = data.subarray(offset, offset + 8192);
      offset += chunk.length;
      slowBytes += chunk.length;
      res.write(chunk);
      if (offset >= data.length) { clearInterval(timer); res.end(); }
    }, 60);
    res.once('close', () => clearInterval(timer));
  });
  server.on('connection', socket => { sockets.add(socket); socket.once('close', () => sockets.delete(socket)); });
  try {
    await runBinary(path.join(paths.binDir, 'ffmpeg.exe'), ['-hide_banner', '-loglevel', 'error',
      '-f', 'lavfi', '-i', 'color=c=black:s=320x240:r=10:d=2', '-f', 'lavfi', '-i',
      'sine=frequency=440:duration=2', '-c:v', 'libx264', '-c:a', 'aac', '-shortest', sample]);
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const base = 'http://127.0.0.1:' + server.address().port;
    const resolved = await runner.resolveInput(base + '/sample.mp4');
    assert.strictEqual(resolved.items.length, 1);
    assert.ok(resolved.items[0].title);
    console.log('PASS T05 real asynchronous metadata');

    const unicodeMetadata = await runner.resolveInput(base + unicodeUrl);
    assert.strictEqual(unicodeMetadata.items[0].title, unicodeTitle);
    console.log('PASS UTF-8 metadata preserves Turkish titles');

    for (const format of ['video', 'audio']) {
      const updates = [];
      liveTask = runner.start({ url: base + '/sample.mp4', format }, {
        downloadFolder: path.join(workspace.root, 'Türk Marşları – İstanbul', format), onUpdate: patch => updates.push(patch)
      });
      const result = await liveTask.promise;
      liveTask = null;
      assert.ok(fs.existsSync(result.outputPath));
      assert.strictEqual(path.extname(result.outputPath), format === 'audio' ? '.mp3' : '.mp4');
      assert.ok(result.outputPath.includes('Türk Marşları – İstanbul'));
      assert.ok(updates.some(patch => patch.stage === 'download' && patch.progress > 0));
      assert.ok(updates.filter(patch => patch.stage === 'postprocess').every(patch => patch.progress === undefined));
      if (format === 'audio') {
        await runBinary(path.join(paths.binDir, 'ffmpeg.exe'), ['-v', 'error', '-i', result.outputPath, '-f', 'null', '-']);
      }
      console.log('PASS ' + (format === 'video' ? 'T01' : 'T02') + ' real ' + format + ' output/progress in a Turkish folder');
    }

    const updates = [];
    const wrappedRunner = { start(job, options) {
      return runner.start(job, { ...options, onUpdate(patch, activity) { updates.push(patch); options.onUpdate(patch, activity); } });
    } };
    manager = new DownloadManager({ paths, runner: wrappedRunner, jobStore: new JobStore(paths.jobsFile),
      settingsStore: new SettingsStore(paths.settingsFile, { concurrency: 1, maxRetries: 3, jobTimeoutMs: 1600,
        startupTimeoutMs: 20000, postprocessTimeoutMs: 30000, downloadFolder: paths.downloadsDir }),
      resolver: { resolveInput: async url => ({ sourceType: 'single', items: [{ url }] }) } });
    manager.initialize();
    const started = Date.now();
    await manager.startDownloads(base + '/slow.mp4', 'video');
    await waitFor(() => manager.jobs[0].status === 'completed' || manager.jobs[0].status === 'failed', 'slow download', 20000);
    assert.strictEqual(manager.jobs[0].status, 'completed', manager.jobs[0].errorMessage);
    assert.ok(Date.now() - started > 1600);
    assert.ok(slowBytes >= 512 * 1024);
    assert.ok(updates.some(patch => patch.progress > 0 && patch.progress < 100));
    console.log('PASS T03 active transfer outlives idle timeout');

    await manager.startDownloads(base + '/stalled.mp4', 'video');
    const stalled = manager.jobs[1];
    await waitFor(() => stalled.status === 'failed', 'stalled download timeout', 15000);
    assert.strictEqual(stalled.errorMessage, 'Job zaman asimina ugradi.');
    assert.ok(stalledBytes > 0);
    console.log('PASS T04 stalled transfer is killed');

    const controller = new AbortController();
    const analysis = runner.resolveInput(base + '/pending', { signal: controller.signal, timeoutMs: 10000 });
    // Attach rejection handling before deliberately aborting.
    const rejected = assert.rejects(analysis, error => error.isCancelled === true);
    await waitFor(() => pendingRequested, 'pending metadata connection', 10000);
    controller.abort();
    await rejected;
    await assert.rejects(runner.resolveInput(base + '/pending', { timeoutMs: 200 }), /zaman asimina/);
    console.log('PASS T07 real analysis cancellation and timeout');

    const partial = runner.parseMetadata({ title: 'Partial', entries: [null, { id: 'available', title: 'Available' }] },
      'https://youtube.com/playlist?list=fixture');
    assert.strictEqual(partial.items.length, 1);
    assert.strictEqual(partial.unavailableItems, 1);
    console.log('PASS T08 partial playlist retains available items');
  } finally {
    if (liveTask) { liveTask.cancel(); await liveTask.promise.catch(() => {}); }
    if (manager) await manager.dispose();
    for (const socket of sockets) socket.destroy();
    if (server.listening) await new Promise(resolve => server.close(resolve));
    workspace.cleanup();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
