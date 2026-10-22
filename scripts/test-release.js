const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { createWorkspace } = require('./test-support');
const { hashFile } = require('./file-utils');
const { assertVersion, releaseNames } = require('./build-utils');
const { validateRelease, publishRelease } = require('./publish-github-release');
const { verifyEntries } = require('./bootstrap-binaries');

function fakeApi() {
  let release = null;
  let uploads = 0;
  const calls = [];
  const api = {
    calls, failUpload: 0,
    get release() { return release; },
    set release(value) { release = value; },
    async json(method, endpoint, body) {
      calls.push({ method, endpoint });
      if (method === 'POST') release = { id: 1, draft: true, upload_url: 'https://uploads.github.com/fixture{?name,label}', assets: [] };
      if (method === 'PATCH') Object.assign(release, body);
      return release && JSON.parse(JSON.stringify(release));
    },
    async upload(url, asset) {
      calls.push({ method: 'UPLOAD', name: asset.name });
      if (++uploads === api.failUpload) throw new Error('Simulated upload failure');
      const remote = { name: asset.name, size: asset.size, digest: 'sha256:' + asset.sha256, state: 'uploaded' };
      release.assets.push(remote);
      return remote;
    }
  };
  return api;
}

async function main() {
  const workspace = createWorkspace('release');
  const root = workspace.root;
  const version = '1.2.0';
  const output = path.join(root, 'release', version);
  const identity = { sourceHash: async () => 'fixture-source', gitState: () => ({ commit: 'a'.repeat(40), dirty: false }) };
  try {
    fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ version, build: { publish: { owner: 'fixture', repo: 'fixture' } } }));
    fs.writeFileSync(path.join(root, 'package-lock.json'), JSON.stringify({ version, packages: { '': { version } } }));
    fs.mkdirSync(output, { recursive: true });
    for (const name of releaseNames(version).filter(name => !['latest.yml', 'build-info.json'].includes(name))) fs.writeFileSync(path.join(output, name), name);
    const installer = 'Elektron-YT-Setup-' + version + '.exe';
    const sha512 = await hashFile(path.join(output, installer), 'sha512', 'base64');
    const metadata = { version, path: installer, sha512, files: [{ url: installer, sha512, size: fs.statSync(path.join(output, installer)).size }] };
    fs.writeFileSync(path.join(output, 'latest.yml'), JSON.stringify(metadata));
    const info = { version, commit: 'a'.repeat(40), dirty: false, sourceHash: 'fixture-source', targets: ['portable', 'nsis'], files: [] };
    for (const name of releaseNames(version).filter(name => name !== 'build-info.json')) info.files.push({ name, sha256: await hashFile(path.join(output, name)) });
    fs.writeFileSync(path.join(output, 'build-info.json'), JSON.stringify(info));
    const plan = await validateRelease(root, identity);
    assert.strictEqual(plan.assets.at(-1).name, 'latest.yml');
    const api = fakeApi();
    await publishRelease(plan, api);
    assert.strictEqual(api.release.draft, false);
    assert.strictEqual(api.calls.filter(call => call.method === 'UPLOAD').at(-1).name, 'latest.yml');
    const changes = api.calls.filter(call => call.method !== 'GET').length;
    await publishRelease(plan, api);
    assert.strictEqual(api.calls.filter(call => call.method !== 'GET').length, changes);
    console.log('PASS T23 complete draft publishes once; matching public release is unchanged');

    const interrupted = fakeApi();
    interrupted.failUpload = 2;
    await assert.rejects(publishRelease(plan, interrupted), /Simulated/);
    assert.strictEqual(interrupted.release.draft, true);
    assert.ok(!interrupted.calls.some(call => call.method === 'PATCH'));
    await publishRelease(plan, interrupted);
    assert.strictEqual(interrupted.release.draft, false);
    assert.strictEqual(interrupted.release.assets.length, plan.assets.length);
    console.log('PASS T23 interrupted upload stays draft and resumes without deleting files');

    const conflicting = fakeApi();
    conflicting.release = { draft: false, assets: [] };
    await assert.rejects(publishRelease(plan, conflicting), /conflicts/);
    assert.ok(conflicting.calls.every(call => call.method === 'GET'));
    const dirty = fakeApi();
    await assert.rejects(publishRelease({ ...plan, dirty: true }, dirty), /Commit/);
    assert.strictEqual(dirty.calls.length, 0);
    console.log('PASS T23 public conflicts and uncommitted builds cannot publish');

    const missing = path.join(output, installer);
    fs.unlinkSync(missing);
    const noCalls = fakeApi();
    await assert.rejects((async () => publishRelease(await validateRelease(root, identity), noCalls))(), /Missing/);
    assert.strictEqual(noCalls.calls.length, 0);
    fs.writeFileSync(missing, installer);
    fs.writeFileSync(path.join(output, 'latest.yml'), JSON.stringify({ ...metadata, sha512: 'invalid' }));
    await assert.rejects(validateRelease(root, identity), /metadata\/hash/);
    fs.writeFileSync(path.join(output, 'latest.yml'), JSON.stringify(metadata));
    await assert.rejects(validateRelease(root, { ...identity, sourceHash: async () => 'other-source' }), /current source/);
    for (const value of ['1.2.0&whoami', '01.2.0', '--version', '1.2']) assert.throws(() => assertVersion(value));
    console.log('PASS T22 missing/hash/provenance/version validation happens before remote mutation');

    const binary = [{ version: 'fixture', entries: [{ to: 'bin/missing.exe', sha256: '0'.repeat(64) }] }];
    await assert.rejects(verifyEntries(workspace.paths.dataDir, binary), /missing/);
    fs.mkdirSync(path.join(workspace.paths.dataDir, 'bin'));
    fs.writeFileSync(path.join(workspace.paths.dataDir, 'bin', 'missing.exe'), 'corrupt');
    await assert.rejects(verifyEntries(workspace.paths.dataDir, binary), /mismatch/);
    console.log('PASS T21 missing/corrupt binaries fail preflight');
  } finally { workspace.cleanup(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
