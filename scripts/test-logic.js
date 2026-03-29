const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const JobStore = require('../app/main/job-store');
const SettingsStore = require('../app/main/settings-store');
const DownloadManager = require('../app/main/download-manager');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'elektron-yt-logic-'));
const paths = {
  baseDir: tempDir,
  runtimeDir: tempDir,
  dataDir: path.join(tempDir, 'data'),
  logsDir: path.join(tempDir, 'data', 'logs'),
  downloadsDir: path.join(tempDir, 'downloads'),
  jobsFile: path.join(tempDir, 'data', 'jobs.json'),
  settingsFile: path.join(tempDir, 'data', 'settings.json'),
  archiveFile: path.join(tempDir, 'data', 'archive.txt'),
  binDir: path.join(tempDir, 'bin')
};

[paths.dataDir, paths.logsDir, paths.downloadsDir, paths.binDir].forEach(function each(dir) {
  fs.mkdirSync(dir, { recursive: true });
});

fs.writeFileSync(paths.jobsFile, '[]', 'utf8');
fs.writeFileSync(paths.settingsFile, '{}', 'utf8');
fs.writeFileSync(paths.archiveFile, '', 'utf8');

class FakeRunner {
  resolveInput(inputUrl) {
    if (inputUrl.indexOf('playlist-invalid') >= 0) {
      throw new Error('Playlist cozumlenemedi');
    }

    if (inputUrl.indexOf('playlist-good') >= 0) {
      return {
        sourceType: 'playlist',
        playlistTitle: 'Playlist Test',
        playlistUrl: inputUrl,
        originalInputUrl: inputUrl,
        items: [
          {
            url: 'https://youtu.be/playlist-item-1',
            title: 'Playlist 1',
            sourceType: 'playlist',
            playlistUrl: inputUrl,
            playlistTitle: 'Playlist Test',
            playlistIndex: 1,
            originalInputUrl: inputUrl
          },
          {
            url: 'https://youtu.be/playlist-item-2',
            title: 'Playlist 2',
            sourceType: 'playlist',
            playlistUrl: inputUrl,
            playlistTitle: 'Playlist Test',
            playlistIndex: 2,
            originalInputUrl: inputUrl
          }
        ]
      };
    }

    return {
      sourceType: 'single',
      originalInputUrl: inputUrl,
      items: [
        {
          url: inputUrl,
          title: 'Title for ' + inputUrl,
          sourceType: 'single',
          playlistUrl: '',
          playlistTitle: '',
          playlistIndex: null,
          originalInputUrl: inputUrl
        }
      ]
    };
  }

  start(job, options) {
    let cancelled = false;
    let rejectPromise = null;

    const promise = new Promise(function executor(resolve, reject) {
      rejectPromise = reject;

      if (job.url.indexOf('timeout') >= 0) {
        return;
      }

      setTimeout(function update() {
        if (cancelled) {
          const error = new Error('cancelled');
          error.isCancelled = true;
          reject(error);
          return;
        }

        options.onUpdate({
          title: job.title || ('Title for ' + job.url),
          progress: 55,
          speed: '1.0MiB/s',
          eta: '00:03'
        });
      }, 10);

      setTimeout(function finish() {
        if (cancelled) {
          const error = new Error('cancelled');
          error.isCancelled = true;
          reject(error);
          return;
        }

        if (job.url.indexOf('always-fail') >= 0 || job.url.indexOf('playlist-item-2') >= 0) {
          reject(new Error('Simulated failure'));
          return;
        }

        const extension = job.format === 'audio' ? '.mp3' : '.mp4';
        const outputPath = path.join(options.downloadFolder, job.id + extension);
        options.onUpdate({
          outputPath: outputPath,
          progress: 100
        });
        fs.mkdirSync(options.downloadFolder, { recursive: true });
        fs.writeFileSync(outputPath, 'ok', 'utf8');
        resolve({ outputPath: outputPath });
      }, 30);
    });

    return {
      promise: promise,
      cancel: function cancel() {
        cancelled = true;
        if (rejectPromise) {
          const error = new Error('cancelled');
          error.isCancelled = true;
          rejectPromise(error);
          rejectPromise = null;
        }
      }
    };
  }
}

async function delay(ms) {
  await new Promise(function wait(resolve) {
    setTimeout(resolve, ms);
  });
}

async function main() {
  const fakeRunner = new FakeRunner();
  const settingsStore = new SettingsStore(paths.settingsFile, {
    concurrency: 2,
    downloadFolder: paths.downloadsDir,
    maxRetries: 3,
    jobTimeoutMs: 40
  });
  const jobStore = new JobStore(paths.jobsFile);
  const manager = new DownloadManager({
    jobStore: jobStore,
    settingsStore: settingsStore,
    paths: paths,
    runner: fakeRunner,
    resolver: fakeRunner
  });

  manager.initialize();

  const mixedResult = await manager.startDownloads([
    'https://youtu.be/good-1',
    'https://example.com/playlist-good',
    'https://example.com/playlist-invalid'
  ].join('\n'), 'video');

  assert.strictEqual(mixedResult.queued, 3);
  assert.strictEqual(mixedResult.failedInputs, 1);
  assert.strictEqual(mixedResult.playlistsResolved, 1);
  assert.strictEqual(mixedResult.playlistItems, 2);

  const audioResult = await manager.startDownloads('https://example.com/playlist-good-audio', 'audio');
  assert.strictEqual(audioResult.queued, 2);
  assert.strictEqual(audioResult.format, 'audio');

  await delay(180);

  let state = manager.getState();
  assert.strictEqual(state.stats.completed, 3);
  assert.strictEqual(state.stats.failed, 3);
  assert.strictEqual(state.stats.video, 4);
  assert.strictEqual(state.stats.audio, 2);
  assert.strictEqual(state.stats.playlists, 5);
  assert.ok(fs.readFileSync(paths.archiveFile, 'utf8').indexOf('"format":"video"') >= 0);
  assert.ok(fs.readFileSync(paths.archiveFile, 'utf8').indexOf('"format":"audio"') >= 0);

  const playlistJob = state.jobs.find(function find(job) {
    return job.sourceType === 'playlist' && job.playlistIndex === 1;
  });
  assert.strictEqual(playlistJob.playlistTitle, 'Playlist Test');
  assert.strictEqual(playlistJob.originalInputUrl.indexOf('playlist-good') >= 0, true);

  const retryId = state.jobs.find(function find(job) {
    return job.url.indexOf('playlist-item-2') >= 0 && job.format === 'video';
  }).id;

  manager.retryFailed(retryId);
  await delay(80);
  manager.retryFailed(retryId);
  await delay(80);
  manager.retryFailed(retryId);
  await delay(80);

  state = manager.getState();
  assert.strictEqual(state.jobs.filter(function filter(job) {
    return job.url.indexOf('playlist-item-2') >= 0 && job.format === 'video';
  })[0].retries, 3);

  const retryResult = manager.retryFailed(retryId);
  assert.strictEqual(retryResult.retried, 0);

  await manager.startDownloads('https://example.com/playlist-good', 'video');
  await delay(20);

  state = manager.getState();
  assert.strictEqual(state.stats.skipped >= 1, true);

  await manager.startDownloads('https://youtu.be/timeout-case', 'video');
  await delay(120);

  state = manager.getState();
  assert.strictEqual(state.jobs.filter(function filter(job) {
    return job.url.indexOf('timeout-case') >= 0;
  })[0].errorMessage, 'Job zaman asimina ugradi.');

  manager.dispose();
  console.log('Logic tests passed.');
}

main().catch(function onError(error) {
  console.error(error);
  process.exit(1);
});
