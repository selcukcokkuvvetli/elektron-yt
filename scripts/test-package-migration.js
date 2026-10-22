const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { packageInfo } = require('./build-utils');
const { createWorkspace, waitFor, killTree } = require('./test-support');

async function main() {
  const root = path.resolve(__dirname, '..');
  const { version } = packageInfo(root);
  const workspace = createWorkspace('packaged-legacy');
  const legacy = [
    { id: 'legacy_done', url: 'https://youtu.be/legacy', status: 'completed', title: 'Legacy completed' },
    { id: 'legacy_pending', url: 'https://youtu.be/pending', status: 'downloading' },
    { id: 'legacy_analysis', url: 'https://youtube.com/playlist?list=fixture', status: 'failed', errorMessage: 'Analiz hatasi: unavailable' }
  ];
  const settings = JSON.stringify({ concurrency: 2, maxRetries: 3, downloadFolder: workspace.paths.downloadsDir });
  const archive = 'https://youtu.be/legacy\n' + JSON.stringify({ url: 'https://youtube.com/watch?v=legacy-audio', format: 'audio' }) + '\n';
  const results = [];
  try {
    for (const executable of ['win-unpacked/ElektronYT.exe', 'Elektron-YT-Portable-' + version + '.exe']) {
      // Each target starts with legacy records, then reopens its migrated records.
      fs.writeFileSync(workspace.paths.jobsFile, JSON.stringify(legacy));
      fs.writeFileSync(workspace.paths.settingsFile, settings);
      fs.writeFileSync(workspace.paths.archiveFile, archive);
      for (let launch = 1; launch <= 2; launch++) {
        for (const marker of ['lock-ready', 'lock-quit']) fs.rmSync(path.join(workspace.root, marker), { force: true });
        const env = { ...process.env, ELECTRON_SMOKE_TEST: '1', ELEKTRON_YT_LOCK_PROBE: '1', ELEKTRON_YT_TEST_ROOT: workspace.root };
        delete env.ELECTRON_RUN_AS_NODE;
        const child = spawn(path.join(root, 'release', version, executable), [], { env, cwd: root, windowsHide: true, stdio: 'ignore' });
        const closed = new Promise((resolve, reject) => { child.once('error', reject); child.once('close', resolve); });
        try {
          await waitFor(() => fs.existsSync(path.join(workspace.root, 'lock-ready')), 'legacy package ready', 45000);
          fs.writeFileSync(path.join(workspace.root, 'lock-quit'), 'quit');
          await waitFor(() => child.exitCode !== null, 'legacy package shutdown', 15000);
          assert.strictEqual(await closed, 0);
          const jobs = JSON.parse(fs.readFileSync(workspace.paths.jobsFile, 'utf8'));
          assert.strictEqual(jobs.length, 3);
          assert.strictEqual(jobs.find(job => job.id === 'legacy_done').format, 'video');
          assert.strictEqual(jobs.find(job => job.id === 'legacy_done').title, 'Legacy completed');
          assert.strictEqual(jobs.find(job => job.id === 'legacy_pending').status, 'cancelled');
          assert.strictEqual(jobs.find(job => job.id === 'legacy_analysis').failureStage, 'analysis');
          assert.strictEqual(fs.readFileSync(workspace.paths.settingsFile, 'utf8'), settings);
          assert.strictEqual(fs.readFileSync(workspace.paths.archiveFile, 'utf8'), archive);
          results.push({ executable, launch, jobsPreserved: jobs.length, settingsUnchanged: true, archiveUnchanged: true });
        } finally { await killTree(child); await closed; }
      }
    }
    const evidenceDir = path.join(root, 'verification');
    fs.mkdirSync(evidenceDir, { recursive: true });
    fs.writeFileSync(path.join(evidenceDir, 'package-migration.json'), JSON.stringify({
      date: new Date().toISOString(), version, results, installedUpgradeTested: false
    }, null, 2));
    console.log('PASS T25 packaged legacy fixtures: unpacked + portable, two launches each; jobs/settings/archive preserved. Installed upgrade remains pending.');
  } finally { workspace.cleanup(); }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
