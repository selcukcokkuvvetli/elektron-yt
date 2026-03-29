const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const binDir = path.join(rootDir, 'app', 'bin');

function ensureDir(target) {
  fs.mkdirSync(target, { recursive: true });
}

function runPowerShell(command) {
  return spawnSync('powershell', [
    '-NoProfile',
    '-Command',
    command
  ], {
    stdio: 'inherit'
  });
}

function findFileRecursive(baseDir, filename) {
  const entries = fs.readdirSync(baseDir, { withFileTypes: true });

  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    const candidate = path.join(baseDir, entry.name);
    if (entry.isDirectory()) {
      const found = findFileRecursive(candidate, filename);
      if (found) {
        return found;
      }
    } else if (entry.name.toLowerCase() === filename.toLowerCase()) {
      return candidate;
    }
  }

  return null;
}

function main() {
  ensureDir(binDir);

  const force = process.argv.indexOf('--force') >= 0;
  const ytDlpPath = path.join(binDir, 'yt-dlp.exe');
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'elektron-yt-'));
  const ytDlpTempPath = path.join(tempDir, 'download.bin');
  const ffmpegPath = path.join(binDir, 'ffmpeg.exe');
  const ffmpegZip = path.join(tempDir, 'ffmpeg.zip');
  const extractDir = path.join(tempDir, 'ffmpeg');

  let result = { status: 0 };

  if (!fs.existsSync(ytDlpPath) || force) {
    console.log('Downloading yt-dlp.exe...');
    result = runPowerShell(
      'Invoke-WebRequest -Uri "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe" -OutFile "' + ytDlpTempPath + '"'
    );

    if (result.status !== 0) {
      throw new Error('yt-dlp indirilemedi.');
    }

    fs.copyFileSync(ytDlpTempPath, ytDlpPath);
  }

  if (!fs.existsSync(ffmpegPath) || force) {
    console.log('Downloading ffmpeg bundle...');
    result = runPowerShell(
      'Invoke-WebRequest -Uri "https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip" -OutFile "' + ffmpegZip + '"'
    );

    if (result.status !== 0) {
      throw new Error('ffmpeg arsivi indirilemedi.');
    }

    ensureDir(extractDir);
    result = runPowerShell(
      'Expand-Archive -LiteralPath "' + ffmpegZip + '" -DestinationPath "' + extractDir + '" -Force'
    );

    if (result.status !== 0) {
      throw new Error('ffmpeg arsivi acilamadi.');
    }

    const locatedFfmpeg = findFileRecursive(extractDir, 'ffmpeg.exe');

    if (!locatedFfmpeg) {
      throw new Error('ffmpeg.exe arsiv icinde bulunamadi.');
    }

    fs.copyFileSync(locatedFfmpeg, ffmpegPath);
  }

  console.log('Binary setup complete:');
  console.log(' - ' + ytDlpPath);
  console.log(' - ' + ffmpegPath);
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
