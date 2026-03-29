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
  start(job, options) {
    let cancelled = false;

    const promise = new Promise(function executor(resolve, reject) {
      setTimeout(function update() {
        if (cancelled) {
          const error = new Error('cancelled');
          error.isCancelled = true;
          reject(error);
          return;
        }

        options.onUpdate({
          title: 'Title for ' + job.url,
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

        if (job.url.indexOf('always-fail') >= 0) {
          reject(new Error('Simulated failure'));
          return;
        }

        const outputPath = path.join(paths.downloadsDir, job.id + '.mp4');
        options.onUpdate({
          outputPath: outputPath,
          progress: 100
        });
        fs.writeFileSync(outputPath, 'ok', 'utf8');
        resolve({ outputPath: outputPath });
      }, 30);
    });

    return {
      promise: promise,
      cancel: function cancel() {
        cancelled = true;
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
  const settingsStore = new SettingsStore(paths.settingsFile, {
    concurrency: 2,
    downloadFolder: paths.downloadsDir
  });
  const jobStore = new JobStore(paths.jobsFile);
  const manager = new DownloadManager({
    jobStore: jobStore,
    settingsStore: settingsStore,
    paths: paths,
    runner: new FakeRunner()
  });

  manager.initialize();

  const startResult = manager.startDownloads([
    'https://youtu.be/good-1',
    'https://youtu.be/always-fail',
    'https://youtu.be/good-1'
  ].join('\n'));

  assert.strictEqual(startResult.queued, 2);
  assert.strictEqual(startResult.skipped, 0);

  await delay(120);

  let state = manager.getState();
  assert.strictEqual(state.stats.completed, 1);
  assert.strictEqual(state.stats.failed, 1);
  assert.ok(fs.readFileSync(paths.archiveFile, 'utf8').indexOf('https://youtu.be/good-1') >= 0);

  const retryId = state.jobs.find(function find(job) {
    return job.url.indexOf('always-fail') >= 0;
  }).id;

  manager.retryFailed(retryId);
  await delay(80);

  state = manager.getState();
  assert.strictEqual(state.jobs.filter(function filter(job) {
    return job.url.indexOf('always-fail') >= 0;
  })[0].status, 'failed');

  manager.startDownloads('https://youtu.be/good-1');
  await delay(20);

  state = manager.getState();
  assert.strictEqual(state.stats.skipped, 1);

  manager.dispose();
  console.log('Logic tests passed.');
}

main().catch(function onError(error) {
  console.error(error);
  process.exit(1);
});
