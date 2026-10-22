const fs = require('fs');
const os = require('os');
const path = require('path');
const { Readable } = require('stream');
const { pipeline } = require('stream/promises');
const { hashFile, contained, run } = require('./file-utils');
const manifest = require('../app/binaries.json');
const appDir = path.resolve(__dirname, '..', 'app');

async function verifyEntries(root = appDir, downloads = manifest.downloads) {
  const verified = [];
  for (const download of downloads) for (const entry of download.entries) {
    const file = contained(root, entry.to);
    if (!fs.existsSync(file)) throw new Error('Binary/license missing: ' + entry.to + '. Run npm run bootstrap:binaries.');
    if (await hashFile(file) !== entry.sha256) throw new Error('SHA256 mismatch: ' + entry.to);
    if (entry.versionArgs) {
      const output = await run(file, entry.versionArgs, { timeoutMs: 15000 });
      if (!output.includes(entry.versionText)) throw new Error('Version mismatch: ' + entry.to);
      verified.push({ file: entry.to, version: download.version, sha256: entry.sha256 });
    }
  }
  return verified;
}

async function downloadFile(url, destination, expected) {
  if (new URL(url).protocol !== 'https:') throw new Error('HTTPS required for binary download');
  const response = await fetch(url, { signal: AbortSignal.timeout(180000) });
  if (!response.ok) throw new Error('Binary download failed: HTTP ' + response.status);
  await pipeline(Readable.fromWeb(response.body), fs.createWriteStream(destination, { flags: 'wx' }));
  if (await hashFile(destination) !== expected) throw new Error('Downloaded checksum mismatch');
}

async function main() {
  if (process.argv.includes('--check')) { console.log(JSON.stringify(await verifyEntries(), null, 2)); return; }
  require('./build-process-host')();
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'elektron-yt-bootstrap-'));
  const quote = value => "'" + value.replace(/'/g, "''") + "'";
  const replacements = [];
  try {
    for (let index = 0; index < manifest.downloads.length; index++) {
      const download = manifest.downloads[index];
      try {
        if (!process.argv.includes('--force')) { await verifyEntries(appDir, [download]); continue; }
      } catch (_) {}
      const archive = contained(root, 'download-' + index + (download.archive ? '.zip' : '.bin'));
      console.log('Preparing ' + download.id + ' ' + download.version);
      await downloadFile(download.url, archive, download.sha256);
      let extracted;
      if (download.archive) {
        extracted = contained(root, 'extract-' + index);
        await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
          'Expand-Archive -LiteralPath ' + quote(archive) + ' -DestinationPath ' + quote(extracted)], { timeoutMs: 180000 });
      }
      for (const entry of download.entries) {
        const source = extracted ? contained(extracted, entry.from) : archive;
        if (await hashFile(source) !== entry.sha256) throw new Error('Extracted checksum mismatch: ' + entry.to);
        replacements.push({ source, destination: contained(appDir, entry.to) });
      }
    }
    // Every downloaded artifact has been verified before replacing any installed file.
    for (const { source, destination } of replacements) {
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      const temporary = destination + '.tmp-' + process.pid;
      try {
        fs.copyFileSync(source, temporary);
        fs.renameSync(temporary, destination);
      } finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
    }
    console.log(JSON.stringify(await verifyEntries(), null, 2));
  } finally {
    if (path.dirname(root) !== path.resolve(os.tmpdir()) || !path.basename(root).startsWith('elektron-yt-bootstrap-')) throw new Error('Unsafe cleanup');
    fs.rmSync(root, { recursive: true, force: true, maxRetries: 5 });
  }
}
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { verifyEntries, downloadFile };
