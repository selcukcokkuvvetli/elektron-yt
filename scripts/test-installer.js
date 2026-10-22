const assert = require('assert');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const yaml = require('js-yaml');
const asar = require('@electron/asar');
const { packageInfo, gitState } = require('./build-utils');
const { run } = require('./file-utils');
const { downloadFile } = require('./bootstrap-binaries');
const { createWorkspace, killTree } = require('./test-support');
const buildUpdateFixture = require('./build-update-fixture');
const fixtures = require('./installer-fixtures.json');
const { debuggerPort, debuggerArgs, closeRenderer } = require('./electron-test-control');

async function waitUntil(predicate, message, timeoutMs = 90000) {
  const end = Date.now() + timeoutMs;
  while (!await predicate()) {
    if (Date.now() >= end) throw new Error('Timed out: ' + message);
    await new Promise(resolve => setTimeout(resolve, 500));
  }
}
function logs(dataDir) {
  const dir = path.join(dataDir, 'logs');
  return fs.existsSync(dir) ? fs.readdirSync(dir).sort().filter(name => /\.log$/.test(name))
    .map(name => fs.readFileSync(path.join(dir, name), 'utf8')).join('\n') : '';
}
function installedVersion(directory) {
  try { return JSON.parse(asar.extractFile(path.join(directory, 'resources', 'app.asar'), 'package.json')).version; }
  catch (_) { return null; }
}

async function main() {
  // Installs the real product in HKCU. Never run against the user's workstation.
  if (process.platform !== 'win32' || process.env.GITHUB_ACTIONS !== 'true'
    || process.env.RUNNER_ENVIRONMENT !== 'github-hosted'
    || process.env.ELEKTRON_YT_DISPOSABLE_INSTALLER_TEST !== '1') {
    throw new Error('Installer tests require an explicitly enabled disposable GitHub-hosted Windows runner.');
  }
  const root = path.resolve(__dirname, '..');
  const pkg = packageInfo(root);
  const probe = path.join(__dirname, 'installer-probe.ps1');
  const ps = args => run('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', probe, ...args], { timeoutMs: 30000 });
  const snapshot = async () => JSON.parse(await ps(['-Mode', 'snapshot']));
  const before = await snapshot();
  assert.strictEqual(before.registry.length, 0, 'An existing Elektron YT installation must not be modified');
  assert.ok(!before.desktop.exists && !before.startMenu.exists, 'Existing product shortcuts must not be modified');
  const dataDir = path.join(process.env.APPDATA, pkg.name);
  assert.ok(!fs.existsSync(dataDir), 'Existing product data must not be modified');
  const workspace = createWorkspace('installer');
  let requestedInstallDir = path.join(workspace.root, 'Özel Klasör', 'Elektron YT');
  let installDir = requestedInstallDir;
  let executable = path.join(installDir, 'ElektronYT.exe');
  const output = path.join(root, 'release', pkg.version);
  const installer = path.join(output, 'Elektron-YT-Setup-' + pkg.version + '.exe');
  const evidence = path.join(root, 'verification');
  fs.mkdirSync(evidence, { recursive: true });
  const report = { commit: gitState(root).commit, version: pkg.version, platform: os.release(),
    disposableRunner: true, legacyInstallerSha256: fixtures.legacyInstallerSha256,
    publicReleaseModified: false, steps: [], requests: [] };
  report.packageCommit = JSON.parse(fs.readFileSync(path.join(output, 'build-info.json'))).commit;
  const children = new Set();
  const connections = new Set();
  const assets = new Map();
  const currentMetadata = yaml.load(fs.readFileSync(path.join(output, 'latest.yml'), 'utf8'));
  const addAssets = (directory, metadata) => {
    for (const file of metadata.files) {
      assert.strictEqual(path.basename(file.url), file.url);
      const location = path.join(directory, file.url);
      assets.set(file.url, location);
      if (fs.existsSync(location + '.blockmap')) assets.set(file.url + '.blockmap', location + '.blockmap');
    }
  };
  addAssets(output, currentMetadata);
  let metadata = currentMetadata;
  let unavailable = false;
  let feedCounter = 0;
  let activeApp;
  let ownsData = false;
  const server = http.createServer((req, res) => {
    const name = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname).slice(1);
    report.requests.push({ name, range: req.headers.range || null });
    if (name === 'latest.yml') {
      if (unavailable) { res.writeHead(404); res.end('isolated missing feed'); return; }
      const body = yaml.dump(metadata);
      res.writeHead(200, { 'Content-Type': 'text/yaml', 'Content-Length': Buffer.byteLength(body) });
      res.end(body); return;
    }
    const file = assets.get(name);
    if (!file) { res.writeHead(404); res.end(); return; }
    const size = fs.statSync(file).size;
    let start = 0, end = size - 1;
    const range = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range || '');
    if (req.headers.range && !range) { res.writeHead(416); res.end(); return; }
    if (range) { start = Number(range[1]); end = range[2] ? Number(range[2]) : end; }
    if (start > end || end >= size) { res.writeHead(416); res.end(); return; }
    const headers = { 'Content-Type': 'application/octet-stream', 'Accept-Ranges': 'bytes', 'Content-Length': end - start + 1 };
    if (range) headers['Content-Range'] = 'bytes ' + start + '-' + end + '/' + size;
    res.writeHead(range ? 206 : 200, headers);
    if (req.method === 'HEAD') res.end();
    else {
      const stream = fs.createReadStream(file, { start, end });
      stream.on('error', error => res.destroy(error));
      res.on('close', () => stream.destroy());
      stream.pipe(res);
    }
  });
  server.on('connection', socket => { connections.add(socket); socket.once('close', () => connections.delete(socket)); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const feedUrl = 'http://127.0.0.1:' + server.address().port + '/';
  const step = async (name, action) => {
    console.log('INSTALLER: ' + name);
    const result = { name, passed: false };
    report.steps.push(result);
    await action();
    result.passed = true;
  };
  const verifyRegistration = async version => {
    const state = await snapshot();
    assert.strictEqual(state.registry.length, 1, JSON.stringify(state));
    assert.strictEqual(state.registry[0].DisplayVersion, version);
    const uninstallPath = /^"([^"]+)"/.exec(state.registry[0].UninstallString);
    assert.ok(uninstallPath, 'Quoted NSIS uninstaller path missing');
    assert.strictEqual(fs.realpathSync.native(path.dirname(uninstallPath[1])).toLowerCase(), fs.realpathSync.native(installDir).toLowerCase());
    for (const link of [state.desktop, state.startMenu]) {
      assert.strictEqual(link.exists, true);
      assert.strictEqual(fs.realpathSync.native(link.target).toLowerCase(), fs.realpathSync.native(executable).toLowerCase());
    }
    assert.strictEqual(installedVersion(installDir), version);
    report.registrations = report.registrations || [];
    report.registrations.push({ version, ...state });
  };
  const install = async (file, version) => {
    if (version === fixtures.legacyVersion) {
      // The published builder-23 installer truncates its /D value at a space.
      // Keep the legacy CLI fixture space-free; the current installer separately
      // verifies the full Unicode + spaces path above.
      requestedInstallDir = path.join(workspace.root, 'Legacy', 'ElektronYT');
      installDir = requestedInstallDir;
      executable = path.join(installDir, 'ElektronYT.exe');
    }
    // NSIS requires an unquoted /D value at the end of the raw command line.
    // CreateProcess gets the executable separately; no shell is involved.
    await run(file, ['/S', '/currentuser', '/D=' + installDir], { timeoutMs: 180000,
      windowsVerbatimArguments: true, argv0: '"' + file + '"' });
    try {
      await waitUntil(async () => {
        const state = await snapshot();
        const entry = state.registry.find(item => item.DisplayVersion === version);
        const command = entry && /^"([^"]+)"/.exec(entry.UninstallString);
        if (!command) return false;
        const actual = path.dirname(command[1]);
        if (!fs.existsSync(actual) || !fs.existsSync(requestedInstallDir)) return false;
        // Older assisted NSIS builds may append their application directory name.
        // Follow the registered location only when it stays inside our requested folder.
        const relative = path.relative(fs.realpathSync.native(requestedInstallDir), fs.realpathSync.native(actual));
        assert.ok(!relative.startsWith('..') && !path.isAbsolute(relative), 'Installer escaped the requested test folder: ' + actual);
        if (installedVersion(actual) !== version) return false;
        installDir = actual;
        executable = path.join(actual, 'ElektronYT.exe');
        return state.desktop.exists && state.startMenu.exists;
      }, 'installation files, registry and shortcuts ' + version);
    } catch (error) {
      report.installationFailure = { expectedVersion: version, observedVersion: installedVersion(installDir),
        state: await snapshot(), files: fs.existsSync(installDir) ? fs.readdirSync(installDir) : [] };
      throw new Error(error.message + ': ' + JSON.stringify(report.installationFailure));
    }
    await verifyRegistration(version);
  };
  const uninstall = async () => {
    if (!fs.existsSync(executable)) return;
    const names = fs.readdirSync(installDir).filter(name => /^Uninstall.*\.exe$/i.test(name));
    assert.strictEqual(names.length, 1);
    await run(path.join(installDir, names[0]), ['/S', '/currentuser'], { timeoutMs: 120000 });
    await waitUntil(async () => {
      if (fs.existsSync(executable)) return false;
      const state = await snapshot();
      return state.registry.length === 0 && !state.desktop.exists && !state.startMenu.exists;
    }, 'uninstall files, registry and shortcuts');
    const state = await snapshot();
    assert.ok(!state.desktop.exists && !state.startMenu.exists, 'Uninstall left product shortcuts');
  };
  const configureFeed = () => {
    fs.writeFileSync(path.join(installDir, 'resources', 'app-update.yml'), yaml.dump({ provider: 'generic', url: feedUrl,
      useMultipleRangeRequest: false, updaterCacheDirName: 'elektron-yt-ci-' + path.basename(workspace.root) + '-' + (++feedCounter) }));
  };
  const startApp = async (file = executable, targetData = dataDir) => {
    const env = { ...process.env };
    for (const key of ['ELECTRON_RUN_AS_NODE', 'ELECTRON_SMOKE_TEST', 'ELEKTRON_YT_TEST_ROOT', 'ELEKTRON_YT_LOCK_PROBE', 'PORTABLE_EXECUTABLE_DIR']) delete env[key];
    const offset = logs(targetData).length;
    const port = await debuggerPort();
    const child = spawn(file, debuggerArgs(port), { env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    const instance = { child, port, stderr: '', lines: () => logs(targetData).slice(offset) };
    child.stdout.on('data', chunk => { instance.stderr = (instance.stderr + chunk).slice(-65536); });
    child.stderr.on('data', chunk => { instance.stderr = (instance.stderr + chunk).slice(-65536); });
    instance.closed = new Promise(resolve => { child.once('error', error => { instance.error = error; resolve(-1); }); child.once('close', resolve); });
    children.add(instance);
    activeApp = instance;
    return instance;
  };
  const waitLog = async (instance, expression) => waitUntil(() => {
    if (instance.error || instance.child.exitCode !== null) throw new Error('Application exited before expected log: ' + instance.stderr);
    return expression.test(instance.lines());
  }, 'application log ' + expression, 120000);
  const closeApp = async instance => {
    await closeRenderer(instance.port);
    await waitUntil(() => instance.child.exitCode !== null, 'graceful application shutdown', 30000);
    assert.strictEqual(await instance.closed, 0, instance.stderr);
    activeApp = null;
  };
  const seed = () => {
    ownsData = true;
    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(path.join(dataDir, 'jobs.json'), JSON.stringify([
      { id: 'old_completed', url: 'https://youtu.be/legacy', status: 'completed', format: 'video', title: 'Saved video' },
      { id: 'old_failed', url: 'https://youtu.be/legacy-audio', status: 'failed', format: 'audio', retries: 1, errorMessage: 'Fixture download error' }
    ]));
    fs.writeFileSync(path.join(dataDir, 'settings.json'), JSON.stringify({ concurrency: 2, maxRetries: 3,
      jobTimeoutMs: 180000, downloadFolder: workspace.paths.downloadsDir }));
    fs.writeFileSync(path.join(dataDir, 'archive.txt'), 'https://youtu.be/legacy\n' + JSON.stringify({ url: 'https://youtu.be/legacy-audio', format: 'audio' }) + '\n');
    fs.writeFileSync(path.join(workspace.paths.downloadsDir, 'keep-media.mp4'), 'preserved user download');
  };
  let preserved;
  const remember = () => Object.fromEntries(['settings.json', 'archive.txt'].map(name => [name, fs.readFileSync(path.join(dataDir, name), 'utf8')]));
  const verifyData = () => {
    const jobs = JSON.parse(fs.readFileSync(path.join(dataDir, 'jobs.json'), 'utf8'));
    assert.strictEqual(jobs.length, 2);
    assert.strictEqual(jobs.find(job => job.id === 'old_completed').title, 'Saved video');
    assert.strictEqual(jobs.find(job => job.id === 'old_completed').status, 'completed');
    assert.strictEqual(jobs.find(job => job.id === 'old_failed').format, 'audio');
    assert.strictEqual(jobs.find(job => job.id === 'old_failed').retries, 1);
    assert.deepStrictEqual(remember(), preserved);
    assert.strictEqual(fs.readFileSync(path.join(workspace.paths.downloadsDir, 'keep-media.mp4'), 'utf8'), 'preserved user download');
  };
  try {
    await step('Fresh current-user install: Unicode/custom folder, registry and shortcut targets', () => install(installer, pkg.version));
    await step('Installed application: renderer/IPC smoke and real embedded-Node MP4/MP3 runner', async () => {
      await run(process.execPath, [path.join(__dirname, 'smoke-electron.js')], { stdio: 'inherit', timeoutMs: 120000,
        env: { ...process.env, ELEKTRON_YT_SMOKE_EXE: executable } });
      await run(executable, [path.join(__dirname, 'test-runner.js')], { stdio: 'inherit', timeoutMs: 120000,
        env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', ELEKTRON_YT_TEST_BIN_DIR: path.join(installDir, 'resources', 'bin') } });
    });
    await step('Installed normal launch and uninstall preserve real user-data location and downloads', async () => {
      seed(); preserved = remember();
      metadata = currentMetadata; configureFeed();
      const instance = await startApp();
      await waitLog(instance, /Auto update: yeni surum bulunamadi/);
      await closeApp(instance); verifyData();
      await uninstall(); verifyData();
    });
    const legacyInstaller = path.join(workspace.root, 'legacy-setup.exe');
    await step('Install published 1.1.0 after SHA256 verification and create real legacy data', async () => {
      await downloadFile(fixtures.legacyInstallerUrl, legacyInstaller, fixtures.legacyInstallerSha256);
      await install(legacyInstaller, fixtures.legacyVersion);
      seed(); preserved = remember();
      metadata = { ...currentMetadata, version: fixtures.legacyVersion }; configureFeed();
      const instance = await startApp();
      await waitLog(instance, /Auto update: yeni surum bulunamadi/);
      await closeApp(instance); verifyData();
    });
    const applyUpdate = async targetVersion => {
      configureFeed();
      const instance = await startApp();
      await waitLog(instance, new RegExp('Auto update hazir: ' + targetVersion.replace(/\./g, '\\.')));
      await closeApp(instance);
      await waitUntil(() => installedVersion(installDir) === targetVersion, 'installer update applied ' + targetVersion, 180000);
      await new Promise(resolve => setTimeout(resolve, 1000));
      await verifyRegistration(targetVersion); verifyData();
    };
    await step('Published 1.1.0 -> real 1.2.0: loopback feed, automatic download, install on graceful quit', async () => {
      metadata = currentMetadata;
      await applyUpdate(pkg.version);
    });
    let fixture;
    let fixtureMetadata;
    await step('Build private successor installer from current source (no tag or publication)', async () => {
      fixture = await buildUpdateFixture(root, workspace.root, feedUrl, path.join(installDir, 'resources', 'app.asar'));
      report.syntheticUpdateTarget = fixture.version;
      fixtureMetadata = yaml.load(fs.readFileSync(path.join(fixture.output, 'latest.yml'), 'utf8'));
      addAssets(fixture.output, fixtureMetadata);
    });
    await step('Current updater rejects a missing feed without changing installation or data', async () => {
      unavailable = true; configureFeed();
      const instance = await startApp();
      await waitLog(instance, /Auto update (hatasi|kontrol hatasi):/);
      await closeApp(instance); unavailable = false;
      await verifyRegistration(pkg.version); verifyData();
    });
    await step('Current updater rejects incorrect SHA512; closing does not install corrupted update', async () => {
      metadata = JSON.parse(JSON.stringify(fixtureMetadata));
      const invalid = (metadata.sha512[0] === 'A' ? 'B' : 'A') + metadata.sha512.slice(1);
      metadata.sha512 = invalid; metadata.files[0].sha512 = invalid;
      configureFeed();
      const instance = await startApp();
      await waitLog(instance, /(?:checksum|sha512).*?(?:mismatch|uyus)|checksum mismatch/i);
      await closeApp(instance);
      await verifyRegistration(pkg.version); verifyData();
    });
    await step('Current updater -> private successor: download, checksum, quit/install and reopen', async () => {
      metadata = fixtureMetadata;
      await applyUpdate(fixture.version);
      configureFeed();
      const instance = await startApp();
      await waitLog(instance, /Auto update: yeni surum bulunamadi/);
      await closeApp(instance); verifyData();
    });
    await step('Successor uninstall removes registry/shortcuts and preserves data/downloads', async () => {
      await uninstall(); verifyData();
    });
    await step('Real portable launcher uses separate data and disables automatic updates', async () => {
      const dir = path.join(workspace.root, 'portable');
      fs.mkdirSync(dir);
      const file = path.join(dir, 'portable.exe');
      fs.copyFileSync(path.join(output, 'Elektron-YT-Portable-' + pkg.version + '.exe'), file);
      const instance = await startApp(file, path.join(dir, 'data'));
      await waitLog(instance, /Portable build auto update almaz/);
      await closeApp(instance); verifyData();
    });
    report.passed = true;
  } catch (error) {
    report.passed = false;
    report.error = error.stack || String(error);
    if (activeApp) report.applicationOutput = activeApp.stderr;
    throw error;
  } finally {
    report.applicationLogs = logs(dataDir);
    for (const instance of children) { await killTree(instance.child); await instance.closed; }
    try { await uninstall(); } catch (error) { report.cleanupError = error.message; report.passed = false; }
    for (const socket of connections) socket.destroy();
    await new Promise(resolve => server.close(resolve));
    fs.writeFileSync(path.join(evidence, 'installer.json'), JSON.stringify(report, null, 2));
    if (ownsData) {
      assert.strictEqual(path.dirname(dataDir), path.resolve(process.env.APPDATA));
      assert.strictEqual(path.basename(dataDir), pkg.name);
      fs.rmSync(dataDir, { recursive: true, force: true, maxRetries: 5 });
    }
    workspace.cleanup();
  }
  assert.strictEqual(report.passed, true, report.cleanupError);
  console.log('PASS T24/T25/T26 disposable Windows installer and real updater integration; report verification/installer.json');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
