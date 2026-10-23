const assert = require('assert');
const fs = require('fs');
const path = require('path');
const DownloadManager = require('../app/main/download-manager');
const JobStore = require('../app/main/job-store');
const SettingsStore = require('../app/main/settings-store');
const YtDlpRunner = require('../app/main/ytdlp-runner');
const { createWorkspace, waitFor } = require('./test-support');

function deferred() {
  let resolve, reject;
  const promise = new Promise((a, b) => { resolve = a; reject = b; });
  return { promise, resolve, reject };
}

async function scenario(name, test, seed) {
  const workspace = createWorkspace('engine');
  if (seed) seed(workspace);
  const tasks = [];
  const runner = { start(job, options) {
    const task = deferred();
    tasks.push({ job, options, task, finish() {
      const outputPath = path.join(options.downloadFolder, job.id + (job.format === 'audio' ? '.mp3' : '.mp4'));
      fs.writeFileSync(outputPath, 'fixture');
      task.resolve({ outputPath });
    } });
    return { promise: task.promise, cancel() {
      const error = new Error('cancelled'); error.isCancelled = true; task.reject(error);
    } };
  } };
  const settingsStore = new SettingsStore(workspace.paths.settingsFile, {
    concurrency: 2, maxRetries: 3, jobTimeoutMs: 100, startupTimeoutMs: 100,
    downloadFolder: workspace.paths.downloadsDir, analysisConcurrency: 1
  });
  const manager = new DownloadManager({ paths: workspace.paths, settingsStore,
    jobStore: new JobStore(workspace.paths.jobsFile), runner,
    resolver: { resolveInput: async url => ({ sourceType: 'single', items: [{ url }] }) } });
  manager.initialize();
  try { await test(manager, tasks, workspace); console.log('PASS ' + name); }
  finally { await manager.dispose(); await new Promise(resolve => setImmediate(resolve)); workspace.cleanup(); }
}

async function main() {
  const parser = new YtDlpRunner({ baseDir: '.' });
  const watchList = 'https://www.youtube.com/watch?v=fixture&list=fixture-list';
  assert.throws(() => parser.parseMetadata({ id: 'fixture', title: 'Single fallback' }, watchList), /PLAYLIST_UNAVAILABLE/);
  assert.strictEqual(parser.parseMetadata({ id: 'fixture' }, 'https://youtu.be/fixture').sourceType, 'single');
  assert.strictEqual(parser.parseMetadata({ entries: [{ id: 'first' }, null, { id: 'second' }] }, watchList).items.length, 2);
  await scenario('UI-3 unavailable playlist never queues a silent single video; explicit video still works', async (manager, tasks) => {
    const result = await manager.startDownloads(watchList, 'audio');
    assert.strictEqual(result.failedInputs, 1);
    assert.strictEqual(result.queued, 0);
    assert.strictEqual(tasks.length, 0);
    assert.strictEqual(manager.jobs[0].url, watchList);
    assert.match(manager.jobs[0].errorMessage, /PLAYLIST_UNAVAILABLE/);
    assert.strictEqual((await manager.startDownloads('https://www.youtube.com/watch?v=fixture', 'audio')).queued, 1);
    assert.strictEqual(tasks[0].job.format, 'audio');
  });
  await scenario('T09/T10 overlapping playlists and concurrent starts', async (manager, tasks) => {
    manager.resolver.resolveInput = async url => ({ sourceType: 'playlist', items: [
      { url: 'https://youtu.be/shared', sourceType: 'playlist', playlistUrl: url, playlistTitle: 'Fixture', playlistIndex: 1 }
    ] });
    const [a, b] = await Promise.all([manager.startDownloads('https://youtube.com/playlist?list=a', 'video'),
      manager.startDownloads('https://youtube.com/playlist?list=b', 'video')]);
    assert.strictEqual(a.queued + b.queued, 1);
    assert.strictEqual(a.skipped + b.skipped, 1);
    assert.strictEqual(tasks.length, 1);
  });

  await scenario('T11 canonical video/audio archive keys', async (manager, tasks) => {
    await manager.startDownloads('https://youtu.be/shared', 'video');
    tasks[0].finish();
    await waitFor(() => manager.getState().stats.completed === 1, 'completed video');
    assert.strictEqual((await manager.startDownloads('https://www.youtube.com/watch?v=shared&t=3', 'video')).skipped, 1);
    assert.strictEqual((await manager.startDownloads('https://youtu.be/shared', 'audio')).queued, 1);
    assert.strictEqual(tasks[1].job.format, 'audio');
  });

  await scenario('T06 stop/clear ignores a late analysis result', async manager => {
    let analysis = deferred();
    manager.resolver.resolveInput = () => analysis.promise;
    let start = manager.startDownloads('https://youtu.be/late', 'video');
    manager.stopAll();
    assert.strictEqual((await start).cancelled, 1);
    analysis.resolve({ sourceType: 'single', items: [{ url: 'https://youtu.be/late' }] });
    await waitFor(() => manager.activeAnalyses.size === 0, 'stopped analysis cleanup');
    assert.strictEqual(manager.jobs.length, 0);
    analysis = deferred();
    start = manager.startDownloads('https://youtu.be/late', 'video');
    manager.clearJobs();
    await start;
    analysis.resolve({ sourceType: 'single', items: [{ url: 'https://youtu.be/late' }] });
    await waitFor(() => manager.activeAnalyses.size === 0, 'cleared analysis cleanup');
    assert.strictEqual(manager.jobs.length, 0);
  });

  await scenario('T12 analysis retry invokes resolver, item retry preserves format', async (manager, tasks) => {
    let calls = 0;
    manager.resolver.resolveInput = async url => {
      if (++calls === 1) throw new Error('metadata unavailable');
      return { sourceType: 'playlist', items: [{ url: 'https://youtu.be/retry-item', sourceType: 'playlist',
        playlistUrl: url, playlistTitle: 'Retry fixture', playlistIndex: 1 }] };
    };
    await manager.startDownloads('https://youtube.com/playlist?list=retry', 'audio');
    const failed = manager.jobs[0];
    assert.strictEqual(failed.failureStage, 'analysis');
    await manager.retryFailed(failed.id);
    assert.strictEqual(calls, 2);
    assert.strictEqual(tasks.length, 1);
    assert.ok(tasks[0].job.url.includes('retry-item'));
    tasks[0].task.reject(new Error('download failure'));
    await waitFor(() => manager.activeTasks.size === 0, 'failed task cleanup');
    await manager.retryFailed(tasks[0].job.id);
    assert.strictEqual(tasks[1].job.format, 'audio');
    assert.strictEqual(tasks[1].job.playlistTitle, 'Retry fixture');
    assert.strictEqual(tasks[1].job.playlistIndex, 1);
  });

  await scenario('T13 skipped row does not block a cancelled item', async (manager, tasks) => {
    await manager.startDownloads('https://youtu.be/cancelled', 'video');
    await manager.startDownloads('https://youtu.be/cancelled', 'video');
    manager.stopAll();
    await waitFor(() => manager.activeTasks.size === 0, 'cancel cleanup');
    assert.strictEqual((await manager.startDownloads('https://youtu.be/cancelled', 'video')).queued, 1);
    assert.strictEqual(tasks.length, 2);
    // A callback retained by a cancelled runner must never change the old job.
    tasks[0].options.onUpdate({ progress: 99, title: 'stale' }, true);
    assert.strictEqual(manager.findJob(tasks[0].job.id).status, 'cancelled');
    assert.notStrictEqual(manager.findJob(tasks[0].job.id).title, 'stale');
  });

  await scenario('T04 identical progress does not postpone inactivity forever', async (manager, tasks) => {
    await manager.startDownloads('https://youtu.be/stalled', 'video');
    const repeat = setInterval(() => tasks[0].options.onUpdate({ progress: 1 }), 10);
    try {
      await waitFor(() => manager.jobs[0].status === 'failed', 'inactivity timeout');
      assert.strictEqual(manager.jobs[0].errorMessage, 'Job zaman asimina ugradi.');
      assert.strictEqual(manager.activeTasks.size, 0);
    } finally { clearInterval(repeat); }
  });

  await scenario('T08 invalid CLI-like input is an analysis error', async (manager, tasks) => {
    await assert.rejects(manager.startDownloads('https://example.com/' + 'a'.repeat(8192), 'video'), /8192/);
    assert.strictEqual(manager.jobs.length, 0, 'Oversized input must not poison persisted jobs');
    const result = await manager.startDownloads('--exec=unexpected\nfile:///C:/Windows/not-a-url', 'video');
    assert.strictEqual(result.failedInputs, 2);
    assert.strictEqual(tasks.length, 0);
    assert.strictEqual(manager.jobs[0].failureStage, 'analysis');
  });

  await scenario('T16/T25 legacy jobs and both archive formats survive startup', async manager => {
    assert.strictEqual(manager.findJob('legacy_done').format, 'video');
    assert.strictEqual(manager.findJob('legacy_pending').status, 'cancelled');
    assert.strictEqual(manager.findJob('legacy_analysis').failureStage, 'analysis');
    assert.strictEqual((await manager.startDownloads('https://youtube.com/watch?v=legacy', 'video')).skipped, 1);
    assert.strictEqual((await manager.startDownloads('https://youtu.be/legacy-audio', 'audio')).skipped, 1);
    manager.persistNow();
    const reloaded = new JobStore(manager.paths.jobsFile).load();
    assert.strictEqual(reloaded.find(job => job.id === 'legacy_done').format, 'video');
  }, workspace => {
    fs.writeFileSync(workspace.paths.jobsFile, JSON.stringify([
      { id: 'legacy_done', url: 'https://youtu.be/legacy', status: 'completed' },
      { id: 'legacy_pending', url: 'https://youtu.be/pending', status: 'downloading' },
      { id: 'legacy_analysis', url: 'https://youtube.com/playlist?list=fixture', status: 'failed', errorMessage: 'Analiz hatasi: unavailable' }
    ]));
    fs.writeFileSync(workspace.paths.archiveFile, 'https://youtu.be/legacy\n'
      + JSON.stringify({ url: 'https://youtube.com/watch?v=legacy-audio', format: 'audio' }) + '\n');
  });
}

main().catch(error => { console.error(error); process.exitCode = 1; });
