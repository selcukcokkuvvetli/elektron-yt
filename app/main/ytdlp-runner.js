const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { spawn, spawnSync } = require('child_process');

function parsePercent(value) {
  const numeric = String(value || '')
    .replace('%', '')
    .replace(',', '.')
    .trim();
  const parsed = Number(numeric);
  return Number.isFinite(parsed) ? parsed : 0;
}

function killProcessTree(pid) {
  if (!pid) {
    return;
  }

  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/pid', String(pid), '/t', '/f'], {
      windowsHide: true,
      stdio: 'ignore'
    });
    return;
  }

  try {
    process.kill(-pid, 'SIGKILL');
  } catch (error) {
    try {
      process.kill(pid, 'SIGKILL');
    } catch (ignored) {}
  }
}

function normalizeResolvedUrl(entry, fallbackUrl) {
  const candidates = [
    entry && entry.webpage_url,
    entry && entry.original_url,
    entry && entry.url
  ];

  for (let index = 0; index < candidates.length; index += 1) {
    const candidate = candidates[index];
    if (candidate && /^https?:\/\//i.test(candidate)) {
      return candidate;
    }
  }

  if (entry && entry.id) {
    return 'https://www.youtube.com/watch?v=' + entry.id;
  }

  return fallbackUrl || '';
}

class YtDlpRunner {
  constructor(appPaths, logger) {
    this.appPaths = appPaths;
    this.logger = typeof logger === 'function' ? logger : function noop() {};
  }

  ensureYtDlpExists() {
    const ytdlpPath = path.join(this.appPaths.binDir, 'yt-dlp.exe');
    if (!fs.existsSync(ytdlpPath)) {
      throw new Error('yt-dlp.exe bulunamadi. app/bin klasorunu kontrol edin.');
    }

    return ytdlpPath;
  }

  ensureFfmpegExists() {
    const ffmpegPath = path.join(this.appPaths.binDir, 'ffmpeg.exe');
    if (!fs.existsSync(ffmpegPath)) {
      throw new Error('ffmpeg.exe bulunamadi. app/bin klasorunu kontrol edin.');
    }
  }

  buildResolveArgs(inputUrl) {
    return [
      '--dump-single-json',
      '--flat-playlist',
      '--ignore-config',
      '--no-warnings',
      '--extractor-args',
      'youtube:player_client=android',
      inputUrl
    ];
  }

  resolveInput(inputUrl) {
    const ytdlpPath = this.ensureYtDlpExists();
    const result = spawnSync(ytdlpPath, this.buildResolveArgs(inputUrl), {
      cwd: this.appPaths.baseDir,
      windowsHide: true,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024
    });

    if (result.status !== 0) {
      throw new Error((result.stderr || result.stdout || 'Playlist/video analiz edilemedi.').trim());
    }

    const payload = String(result.stdout || '').trim();
    if (!payload) {
      throw new Error('yt-dlp metadata donmedi.');
    }

    const parsed = JSON.parse(payload);
    if (parsed && Array.isArray(parsed.entries)) {
      const playlistUrl = normalizeResolvedUrl(parsed, inputUrl);
      const playlistTitle = parsed.title || parsed.playlist_title || '';
      const items = parsed.entries
        .map(function map(entry, index) {
          const resolvedUrl = normalizeResolvedUrl(entry, '');
          if (!resolvedUrl) {
            return null;
          }

          return {
            url: resolvedUrl,
            title: entry.title || '',
            sourceType: 'playlist',
            playlistUrl: playlistUrl,
            playlistTitle: playlistTitle,
            playlistIndex: Number(entry.playlist_index || entry.index || index + 1),
            originalInputUrl: inputUrl
          };
        })
        .filter(Boolean);

      if (!items.length) {
        throw new Error('Playlist icinden gecerli item cikarilamadi.');
      }

      return {
        sourceType: 'playlist',
        playlistTitle: playlistTitle,
        playlistUrl: playlistUrl,
        originalInputUrl: inputUrl,
        items: items
      };
    }

    return {
      sourceType: 'single',
      originalInputUrl: inputUrl,
      items: [
        {
          url: normalizeResolvedUrl(parsed, inputUrl),
          title: parsed.title || '',
          sourceType: 'single',
          playlistUrl: '',
          playlistTitle: '',
          playlistIndex: null,
          originalInputUrl: inputUrl
        }
      ]
    };
  }

  buildArgs(job, downloadFolder) {
    const args = [
      '--newline',
      '--ignore-config',
      '--no-warnings',
      '--no-playlist',
      '--extractor-args',
      'youtube:player_client=android',
      '--restrict-filenames',
      '--windows-filenames',
      '--ffmpeg-location',
      this.appPaths.binDir,
      '--output',
      path.join(downloadFolder, '%(title)s [%(id)s].%(ext)s'),
      '--print',
      'before_dl:TITLE:%(title)s',
      '--print',
      'after_move:FILEPATH:%(filepath)s',
      '--progress-template',
      'download:PROGRESS:%(progress._percent_str)s|%(progress._speed_str)s|%(progress._eta_str)s',
      '--progress-template',
      'postprocess:PROGRESS:%(progress._percent_str)s|%(progress._speed_str)s|%(progress._eta_str)s'
    ];

    if (job.format === 'audio') {
      args.push(
        '--extract-audio',
        '--audio-format',
        'mp3',
        '--audio-quality',
        '0'
      );
    } else {
      args.push(
        '--format',
        'best[ext=mp4]/best'
      );
    }

    args.push(job.url);
    return args;
  }

  start(job, options) {
    const downloadFolder = options.downloadFolder;
    const onUpdate = options.onUpdate;
    const ytdlpPath = this.ensureYtDlpExists();
    this.ensureFfmpegExists();

    fs.mkdirSync(downloadFolder, { recursive: true });

    const args = this.buildArgs(job, downloadFolder);

    this.logger('Starting yt-dlp for ' + job.url + ' as ' + job.format);

    const child = spawn(ytdlpPath, args, {
      cwd: this.appPaths.baseDir,
      windowsHide: true,
      detached: process.platform !== 'win32'
    });

    let cancelled = false;
    let lastFilePath = '';
    let errorText = '';

    const stdoutReader = readline.createInterface({ input: child.stdout });
    const stderrReader = readline.createInterface({ input: child.stderr });

    const applyLine = function applyLine(line) {
      const normalized = String(line || '').trim();
      if (!normalized) {
        return;
      }

      if (normalized.indexOf('TITLE:') === 0) {
        onUpdate({ title: normalized.slice(6).trim() });
        return;
      }

      if (normalized.indexOf('FILEPATH:') === 0) {
        lastFilePath = normalized.slice(9).trim();
        onUpdate({ outputPath: lastFilePath });
        return;
      }

      if (normalized.indexOf('PROGRESS:') === 0) {
        const pieces = normalized.slice(9).split('|');
        onUpdate({
          progress: parsePercent(pieces[0]),
          speed: (pieces[1] || '').trim() || '-',
          eta: (pieces[2] || '').trim() || '-'
        });
        return;
      }

      if (normalized.indexOf('ERROR:') === 0) {
        errorText = normalized;
      }
    };

    stdoutReader.on('line', applyLine);
    stderrReader.on('line', function onErrorLine(line) {
      const normalized = String(line || '').trim();
      if (!normalized) {
        return;
      }

      if (normalized.indexOf('ERROR:') === 0) {
        errorText = normalized;
      }

      applyLine(normalized);
    });

    const promise = new Promise(function executor(resolve, reject) {
      child.on('error', function onError(error) {
        stdoutReader.close();
        stderrReader.close();
        reject(error);
      });

      child.on('close', function onClose(code) {
        stdoutReader.close();
        stderrReader.close();

        if (cancelled) {
          const error = new Error('Download cancelled');
          error.isCancelled = true;
          reject(error);
          return;
        }

        if (code === 0) {
          resolve({ outputPath: lastFilePath });
          return;
        }

        reject(new Error(errorText || ('yt-dlp exited with code ' + code)));
      });
    });

    return {
      promise: promise,
      cancel: function cancel() {
        cancelled = true;
        killProcessTree(child.pid);
      }
    };
  }
}

module.exports = YtDlpRunner;
