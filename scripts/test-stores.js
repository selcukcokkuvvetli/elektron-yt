const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const JobStore = require('../app/main/job-store');
const SettingsStore = require('../app/main/settings-store');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'elektron-yt-stores-'));
const jobsFile = path.join(tempDir, 'jobs.json');
const settingsFile = path.join(tempDir, 'settings.json');

const jobStore = new JobStore(jobsFile);
const settingsStore = new SettingsStore(settingsFile, {
  concurrency: 3,
  downloadFolder: 'downloads'
});

assert.deepStrictEqual(jobStore.load(), []);

jobStore.save([
  {
    id: 'job-1',
    url: 'https://example.com',
    status: 'queued'
  }
]);

assert.strictEqual(jobStore.load()[0].id, 'job-1');
assert.strictEqual(settingsStore.load().concurrency, 3);

settingsStore.update({
  concurrency: 5
});

assert.strictEqual(settingsStore.load().concurrency, 5);
assert.strictEqual(settingsStore.load().downloadFolder, 'downloads');

console.log('Store tests passed.');
