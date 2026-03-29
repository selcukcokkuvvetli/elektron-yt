const fs = require('fs');
const path = require('path');
const https = require('https');
const { spawnSync } = require('child_process');

const rootDir = path.resolve(__dirname, '..');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function getPackageInfo() {
  const pkg = readJson(path.join(rootDir, 'package.json'));
  const repoPath = pkg.build && pkg.build.publish
    ? (pkg.build.publish.owner + '/' + pkg.build.publish.repo)
    : new URL(pkg.repository.url).pathname.replace(/^\/|\.git$/g, '');

  return {
    version: pkg.version,
    repoPath: repoPath
  };
}

function getGitCredentialAuth() {
  const repositoryUrl = readJson(path.join(rootDir, 'package.json')).repository.url;
  const url = new URL(repositoryUrl);
  const input = [
    'protocol=' + url.protocol.replace(':', ''),
    'host=' + url.host,
    'path=' + url.pathname.replace(/^\//, ''),
    ''
  ].join('\n');
  const result = spawnSync('git', ['credential', 'fill'], {
    cwd: rootDir,
    input: input + '\n',
    encoding: 'utf8'
  });

  if (result.status !== 0) {
    return null;
  }

  const values = {};
  String(result.stdout || '').split(/\r?\n/).forEach(function each(line) {
    const parts = line.split('=');
    if (parts.length >= 2) {
      values[parts[0]] = parts.slice(1).join('=');
    }
  });

  if (!values.username || !values.password) {
    return null;
  }

  return 'Basic ' + Buffer.from(values.username + ':' + values.password).toString('base64');
}

function getAuthHeader() {
  if (process.env.GITHUB_TOKEN || process.env.GH_TOKEN) {
    return 'token ' + (process.env.GITHUB_TOKEN || process.env.GH_TOKEN);
  }

  return getGitCredentialAuth();
}

function requestJson(options, body) {
  return new Promise(function executor(resolve, reject) {
    const request = https.request(options, function onResponse(response) {
      const chunks = [];
      response.on('data', function onData(chunk) {
        chunks.push(chunk);
      });
      response.on('end', function onEnd() {
        const text = Buffer.concat(chunks).toString('utf8');
        const parsed = text ? JSON.parse(text) : {};
        if (response.statusCode >= 200 && response.statusCode < 300) {
          resolve(parsed);
          return;
        }

        const error = new Error('GitHub API error ' + response.statusCode + ': ' + text);
        reject(error);
      });
    });

    request.on('error', reject);

    if (body) {
      request.write(body);
    }

    request.end();
  });
}

function uploadAsset(uploadUrl, assetPath, authHeader) {
  const fileName = path.basename(assetPath).replace(/ /g, '-');
  const uploadTarget = new URL(uploadUrl.replace('{?name,label}', '?name=' + encodeURIComponent(fileName)));
  const fileBuffer = fs.readFileSync(assetPath);

  return new Promise(function executor(resolve, reject) {
    const request = https.request({
      protocol: uploadTarget.protocol,
      hostname: uploadTarget.hostname,
      path: uploadTarget.pathname + uploadTarget.search,
      method: 'POST',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/octet-stream',
        'Content-Length': fileBuffer.length,
        'User-Agent': 'elektron-yt-release-script',
        'Accept': 'application/vnd.github+json'
      }
    }, function onResponse(response) {
      const chunks = [];
      response.on('data', function onData(chunk) {
        chunks.push(chunk);
      });
      response.on('end', function onEnd() {
        const text = Buffer.concat(chunks).toString('utf8');
        if (response.statusCode >= 200 && response.statusCode < 300) {
          resolve(JSON.parse(text));
          return;
        }

        reject(new Error('Asset upload failed ' + response.statusCode + ': ' + text));
      });
    });

    request.on('error', reject);
    request.write(fileBuffer);
    request.end();
  });
}

async function main() {
  const authHeader = getAuthHeader();
  if (!authHeader) {
    throw new Error('GitHub publish icin GH_TOKEN/GITHUB_TOKEN veya git credential bulunamadi.');
  }

  const info = getPackageInfo();
  const tagName = 'v' + info.version;
  const releaseBody = [
    '## Highlights',
    '- Video ve MP3 formatli toplu indirme',
    '- Portable ve NSIS installer paketleri',
    '- Installer build icin GitHub Releases tabanli auto update'
  ].join('\n');

  let release = null;
  try {
    release = await requestJson({
      hostname: 'api.github.com',
      path: '/repos/' + info.repoPath + '/releases/tags/' + tagName,
      method: 'GET',
      headers: {
        'Authorization': authHeader,
        'User-Agent': 'elektron-yt-release-script',
        'Accept': 'application/vnd.github+json'
      }
    });
  } catch (error) {
    if (error.message.indexOf('404') < 0) {
      throw error;
    }
  }

  if (!release) {
    release = await requestJson({
      hostname: 'api.github.com',
      path: '/repos/' + info.repoPath + '/releases',
      method: 'POST',
      headers: {
        'Authorization': authHeader,
        'User-Agent': 'elektron-yt-release-script',
        'Accept': 'application/vnd.github+json',
        'Content-Type': 'application/json'
      }
    }, JSON.stringify({
      tag_name: tagName,
      target_commitish: 'main',
      name: tagName,
      body: releaseBody,
      draft: false,
      prerelease: false
    }));
  } else {
    release = await requestJson({
      hostname: 'api.github.com',
      path: '/repos/' + info.repoPath + '/releases/' + release.id,
      method: 'PATCH',
      headers: {
        'Authorization': authHeader,
        'User-Agent': 'elektron-yt-release-script',
        'Accept': 'application/vnd.github+json',
        'Content-Type': 'application/json'
      }
    }, JSON.stringify({
      name: tagName,
      body: releaseBody,
      draft: false,
      prerelease: false
    }));
  }

  const assets = [
    path.join(rootDir, 'release', 'Elektron-YT-Portable-' + info.version + '.exe'),
    path.join(rootDir, 'release', 'Elektron-YT-Setup-' + info.version + '.exe'),
    path.join(rootDir, 'release', 'Elektron-YT-Setup-' + info.version + '.exe.blockmap'),
    path.join(rootDir, 'release', 'latest.yml')
  ];

  for (let index = 0; index < (release.assets || []).length; index += 1) {
    const asset = release.assets[index];
    const localName = assets.map(function map(assetPath) {
      return path.basename(assetPath).replace(/ /g, '-');
    });
    if (localName.indexOf(asset.name) >= 0) {
      await requestJson({
        hostname: 'api.github.com',
        path: '/repos/' + info.repoPath + '/releases/assets/' + asset.id,
        method: 'DELETE',
        headers: {
          'Authorization': authHeader,
          'User-Agent': 'elektron-yt-release-script',
          'Accept': 'application/vnd.github+json'
        }
      });
    }
  }

  for (let index = 0; index < assets.length; index += 1) {
    const assetPath = assets[index];
    if (!fs.existsSync(assetPath)) {
      throw new Error('Release asset bulunamadi: ' + assetPath);
    }
    await uploadAsset(release.upload_url, assetPath, authHeader);
  }

  console.log('GitHub release hazir: ' + release.html_url);
}

main().catch(function onError(error) {
  console.error(error.message);
  process.exit(1);
});
