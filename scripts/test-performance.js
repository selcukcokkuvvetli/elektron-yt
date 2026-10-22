const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');
const results = [];
for (const count of [300, 1000, 5000]) {
  const result = spawnSync(process.execPath, [path.join(__dirname, 'smoke-electron.js')], {
    encoding: 'utf8', timeout: 45000, env: { ...process.env, ELEKTRON_YT_SMOKE_JOBS: String(count) }, windowsHide: true
  });
  if (result.status !== 0) throw new Error(result.stdout + '\n' + result.stderr);
  const match = result.stdout.match(/SMOKE_REPORT (.+)/);
  if (!match) throw new Error('Missing renderer report');
  results.push(JSON.parse(match[1]));
  console.log('PASS T19/T20 ' + match[1]);
}
fs.mkdirSync(path.resolve(__dirname, '..', 'verification'), { recursive: true });
fs.writeFileSync(path.resolve(__dirname, '..', 'verification', 'performance.json'), JSON.stringify({
  node: process.version, platform: process.platform, arch: process.arch, results
}, null, 2));
