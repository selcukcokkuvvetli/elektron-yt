const assert = require('assert');
const fs = require('fs');
const path = require('path');
const JobStore = require('../app/main/job-store');
const SettingsStore = require('../app/main/settings-store');
const { createWorkspace } = require('./test-support');
const workspace = createWorkspace('stores');
const { jobsFile, settingsFile, dataDir, downloadsDir } = workspace.paths;
const job = id => ({ id, url: 'https://www.youtube.com/watch?v=' + id, status: 'completed', format: 'video' });
try {
  const jobs = new JobStore(jobsFile);
  assert.deepStrictEqual(jobs.load(), []);
  jobs.save([job('first')]);
  jobs.save([job('second')]);
  assert.strictEqual(JSON.parse(fs.readFileSync(jobsFile + '.bak'))[0].id, 'first');
  fs.writeFileSync(jobsFile, '[{"id":"partial"');
  const recovered = new JobStore(jobsFile);
  assert.strictEqual(recovered.load()[0].id, 'first');
  assert.ok(recovered.warnings.some(line => line.includes('yedek yuklendi')));
  assert.ok(fs.readdirSync(dataDir).some(file => file.startsWith('jobs.json.corrupt-')));
  assert.strictEqual(fs.readFileSync(jobsFile, 'utf8'), '[{"id":"partial"');
  recovered.save([job('recovered')]);
  assert.strictEqual(new JobStore(jobsFile).load()[0].id, 'recovered');
  console.log('PASS T14 truncated JSON preserves source and recovers backup');

  fs.writeFileSync(jobsFile, JSON.stringify([null, job('valid'), job('valid'), { ...job('numeric'), id: 123 }]));
  const partial = new JobStore(jobsFile);
  assert.deepStrictEqual(partial.load().map(item => item.id), ['valid']);
  assert.ok(partial.warnings.length >= 3);
  console.log('PASS T14 null/duplicate/invalid jobs are isolated');

  jobs.save([job('before-failure')]);
  const before = fs.readFileSync(jobsFile, 'utf8');
  const originalRename = fs.renameSync;
  try {
    fs.renameSync = (source, target) => {
      if (target === jobsFile) { const error = new Error('simulated permission failure'); error.code = 'EACCES'; throw error; }
      return originalRename(source, target);
    };
    assert.throws(() => jobs.save([job('after-failure')]), /simulated permission/);
    assert.strictEqual(fs.readFileSync(jobsFile, 'utf8'), before);
    assert.ok(!fs.readdirSync(dataDir).some(file => file.includes('.tmp-')));
  } finally { fs.renameSync = originalRename; }
  console.log('PASS T15 failed atomic replacement preserves current data');

  const defaults = { concurrency: 3, maxRetries: 3, jobTimeoutMs: 180000, downloadFolder: downloadsDir };
  const settings = new SettingsStore(settingsFile, defaults);
  assert.strictEqual(settings.load().concurrency, 3);
  settings.update({ concurrency: 5 });
  assert.strictEqual(new SettingsStore(settingsFile, defaults).load().concurrency, 5);
  assert.throws(() => settings.update({ concurrency: -1 }), /Gecersiz/);
  fs.writeFileSync(settingsFile, JSON.stringify({ concurrency: -10, maxRetries: 'bad', downloadFolder: 'relative' }));
  const invalid = new SettingsStore(settingsFile, defaults);
  assert.deepStrictEqual(invalid.load(), defaults);
  assert.ok(invalid.warnings.length >= 3);
  console.log('PASS T16 settings boundaries and fallback');

  fs.writeFileSync(jobsFile, JSON.stringify([{ id: 'legacy', url: 'https://youtu.be/legacy', status: 'failed' }]));
  assert.strictEqual(new JobStore(jobsFile).load()[0].id, 'legacy');
  fs.writeFileSync(jobsFile, JSON.stringify([{ id: 'legacy_analysis', url: '--invalid', status: 'failed', errorMessage: 'Analiz hatasi: invalid' }]));
  assert.strictEqual(new JobStore(jobsFile).load()[0].id, 'legacy_analysis');
  console.log('PASS T16 legacy records remain readable');
} finally { workspace.cleanup(); }
