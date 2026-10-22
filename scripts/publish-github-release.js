const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const { packageInfo, releaseNames, sourceHash, gitState } = require('./build-utils');
const { hashFile } = require('./file-utils');

async function validateRelease(root, identity = { sourceHash, gitState }) {
  const pkg = packageInfo(root);
  const directory = path.join(root, 'release', pkg.version);
  const assets = [];
  // Validate every local file before authentication or any remote call.
  for (const name of releaseNames(pkg.version)) {
    const file = path.join(directory, name);
    if (!fs.existsSync(file) || !fs.statSync(file).isFile() || fs.statSync(file).size === 0) throw new Error('Missing/empty release asset: ' + name);
    assets.push({ name, file, size: fs.statSync(file).size, sha256: await hashFile(file) });
  }
  const metadataFile = path.join(directory, 'latest.yml');
  if (fs.statSync(metadataFile).size > 65536) throw new Error('Oversized update metadata');
  const latest = yaml.load(fs.readFileSync(metadataFile, 'utf8'), { schema: yaml.JSON_SCHEMA });
  const installer = assets.find(asset => asset.name === 'Elektron-YT-Setup-' + pkg.version + '.exe');
  const sha512 = await hashFile(installer.file, 'sha512', 'base64');
  if (!latest || latest.version !== pkg.version || latest.path !== installer.name || latest.sha512 !== sha512
    || !Array.isArray(latest.files) || latest.files.length !== 1 || latest.files[0].url !== installer.name
    || latest.files[0].sha512 !== sha512 || latest.files[0].size !== installer.size) throw new Error('Update metadata/hash mismatch');
  const info = JSON.parse(fs.readFileSync(path.join(directory, 'build-info.json')));
  if (info.version !== pkg.version || !info.targets.includes('portable') || !info.targets.includes('nsis')) throw new Error('Both package targets must be built together');
  if (info.sourceHash !== await identity.sourceHash(root) || info.commit !== identity.gitState(root).commit) throw new Error('Packages do not match current source/commit');
  for (const asset of assets.filter(asset => asset.name !== 'build-info.json')) {
    if (!info.files.some(file => file.name === asset.name && file.sha256 === asset.sha256)) throw new Error('Build provenance mismatch: ' + asset.name);
  }
  const config = pkg.build.publish;
  if (!/^[\w-]+$/.test(config.owner) || !/^[\w.-]+$/.test(config.repo)) throw new Error('Invalid release repository');
  return { version: pkg.version, repo: config.owner + '/' + config.repo, commit: info.commit,
    dirty: info.dirty || identity.gitState(root).dirty, assets };
}

function sameAsset(remote, local) {
  return remote && remote.state === 'uploaded' && remote.size === local.size && remote.digest === 'sha256:' + local.sha256;
}

async function publishRelease(plan, api) {
  if (plan.dirty) throw new Error('Commit the tested source and rebuild before public publication.');
  const base = '/repos/' + plan.repo + '/releases';
  let release = await api.json('GET', base + '/tags/v' + plan.version, undefined, true);
  if (release && !release.draft) {
    if (!plan.assets.every(asset => sameAsset(release.assets.find(item => item.name === asset.name), asset))) {
      throw new Error('Published version conflicts with local assets; create a new version. Public files were not changed.');
    }
    return release;
  }
  if (!release) release = await api.json('POST', base, { tag_name: 'v' + plan.version,
    target_commitish: plan.commit, name: 'v' + plan.version, draft: true, prerelease: false,
    body: 'Reliable playlist analysis, downloads, data recovery and Windows packaging. See CHANGELOG.md for details.' });
  // latest.yml is deliberately uploaded last; the release stays a draft until all files verify.
  for (const asset of plan.assets) {
    const existing = (release.assets || []).find(item => item.name === asset.name);
    if (existing) {
      if (!sameAsset(existing, asset)) throw new Error('Conflicting draft asset: ' + asset.name + '. Draft preserved for inspection.');
      continue;
    }
    const uploaded = await api.upload(release.upload_url, asset);
    if (!sameAsset(uploaded, asset)) throw new Error('Uploaded asset did not verify: ' + asset.name);
  }
  release = await api.json('GET', base + '/' + release.id);
  if (!plan.assets.every(asset => sameAsset(release.assets.find(item => item.name === asset.name), asset))) throw new Error('Draft asset validation failed');
  return api.json('PATCH', base + '/' + release.id, { draft: false });
}

function githubApi(token) {
  const headers = { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json',
    'User-Agent': 'elektron-yt-release', 'X-GitHub-Api-Version': '2022-11-28' };
  async function responseJson(response, allow404) {
    if (allow404 && response.status === 404) return null;
    const text = await response.text();
    if (text.length > 5 * 1024 * 1024) throw new Error('Oversized GitHub response');
    if (!response.ok) throw new Error('GitHub HTTP ' + response.status);
    try { return text ? JSON.parse(text) : {}; } catch (_) { throw new Error('Invalid GitHub JSON response'); }
  }
  return {
    async json(method, endpoint, body, allow404) {
      for (let attempt = 0; ; attempt++) {
        try {
          const response = await fetch('https://api.github.com' + endpoint, { method, headers: { ...headers, 'Content-Type': 'application/json' },
            body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(30000), redirect: 'error' });
          if (method === 'GET' && response.status >= 500 && attempt < 2) { await response.arrayBuffer(); throw new Error('Retryable server failure'); }
          return await responseJson(response, allow404);
        } catch (error) {
          if (method !== 'GET' || attempt >= 2) throw error;
          await new Promise(resolve => setTimeout(resolve, 500 * 2 ** attempt));
        }
      }
    },
    async upload(template, asset) {
      const url = new URL(template.replace(/\{.*$/, ''));
      if (url.protocol !== 'https:' || url.hostname !== 'uploads.github.com') throw new Error('Unexpected GitHub upload host');
      url.searchParams.set('name', asset.name);
      const stream = fs.createReadStream(asset.file);
      try {
        return await responseJson(await fetch(url, { method: 'POST', headers: { ...headers,
          'Content-Type': 'application/octet-stream', 'Content-Length': String(asset.size) },
          body: stream, duplex: 'half', signal: AbortSignal.timeout(180000), redirect: 'error' }));
      } finally { stream.destroy(); }
    }
  };
}

async function main() {
  const plan = await validateRelease(path.resolve(__dirname, '..'));
  if (!process.argv.includes('--publish')) {
    console.log(JSON.stringify({ ...plan, mode: 'dry-run', publishable: !plan.dirty,
      assets: plan.assets.map(({ name, size, sha256 }) => ({ name, size, sha256 })) }, null, 2));
    return;
  }
  const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
  if (!token) throw new Error('GH_TOKEN/GITHUB_TOKEN required for explicit publication.');
  const release = await publishRelease(plan, githubApi(token));
  console.log('Release ready: ' + release.html_url);
}
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { validateRelease, publishRelease, githubApi };
