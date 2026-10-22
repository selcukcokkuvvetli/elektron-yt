const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { killProcessTree, cancelledError, spawnManaged } = require('./process-utils');
const { validateUrl, canonicalUrl } = require('./urls');

function numeric(value) {
  const text = String(value == null ? '' : value).replace('%', '').replace(',', '.').trim();
  return text && text !== 'NA' && Number.isFinite(Number(text)) ? Number(text) : null;
}

function resolvedUrl(entry, fallback) {
  for (const candidate of [entry && entry.webpage_url, entry && entry.original_url, entry && entry.url]) {
    if (typeof candidate === 'string' && /^https?:\/\//i.test(candidate)) return canonicalUrl(candidate);
  }
  if (entry && entry.id && /^[\w-]+$/.test(entry.id)) return 'https://www.youtube.com/watch?v=' + entry.id;
  return fallback || '';
}

class YtDlpRunner {
  constructor(appPaths, logger) {
    this.appPaths = appPaths;
    this.logger = typeof logger === 'function' ? logger : () => {};
  }

  ensureYtDlpExists() {
    const target = path.join(this.appPaths.binDir, 'yt-dlp.exe');
    if (!fs.existsSync(target)) throw new Error('yt-dlp.exe bulunamadi. Binary kurulumunu kontrol edin.');
    return target;
  }

  ensureFfmpegExists() {
    if (!fs.existsSync(path.join(this.appPaths.binDir, 'ffmpeg.exe'))) {
      throw new Error('ffmpeg.exe bulunamadi. Binary kurulumunu kontrol edin.');
    }
  }

  buildResolveArgs(inputUrl) {
    validateUrl(inputUrl);
    return ['--dump-single-json', '--flat-playlist', '--ignore-config', '--no-warnings',
      '--cache-dir', path.join(this.appPaths.dataDir || this.appPaths.baseDir, 'yt-dlp-cache'),
      '--no-js-runtimes', '--js-runtimes', 'node:' + (this.appPaths.jsRuntimePath || process.execPath),
      '--ignore-errors', '--', inputUrl];
  }

  resolveInput(inputUrl, options = {}) {
    if (options.signal && options.signal.aborted) return Promise.reject(cancelledError());
    const child = spawnManaged(this.ensureYtDlpExists(), this.buildResolveArgs(inputUrl), {
      cwd: this.appPaths.baseDir, windowsHide: true, detached: process.platform !== 'win32',
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }
    });
    return new Promise((resolve, reject) => {
      let stdout = '';
      let stderr = '';
      let bytes = 0;
      let failure;
      const abort = () => { failure = cancelledError(); killProcessTree(child); };
      const timer = setTimeout(() => {
        failure = new Error('Analiz zaman asimina ugradi.');
        failure.isTimeout = true;
        killProcessTree(child);
      }, options.timeoutMs || 60000);
      const cleanup = () => {
        clearTimeout(timer);
        if (options.signal) options.signal.removeEventListener('abort', abort);
      };
      if (options.signal) options.signal.addEventListener('abort', abort, { once: true });
      child.stdout.setEncoding('utf8');
      child.stdout.on('data', chunk => {
        if (failure) return;
        bytes += Buffer.byteLength(chunk);
        if (bytes > (options.maxBuffer || 64 * 1024 * 1024)) {
          failure = new Error('Analiz ciktisi boyut sinirini asti.');
          killProcessTree(child);
        } else stdout += chunk;
      });
      child.stderr.on('data', chunk => { stderr = (stderr + chunk.toString('utf8')).slice(-16384); });
      child.once('error', error => { cleanup(); reject(error); });
      child.once('close', code => {
        cleanup();
        if (failure) { reject(failure); return; }
        try {
          // --ignore-errors may leave usable entries alongside unavailable videos.
          const parsed = JSON.parse(stdout.trim());
          const result = this.parseMetadata(parsed, inputUrl);
          if (code !== 0) result.warning = stderr.trim() || 'Bazi ogeler analiz edilemedi.';
          resolve(result);
        } catch (error) {
          reject(new Error(stderr.trim() || ('Analiz basarisiz: ' + error.message)));
        }
      });
    });
  }

  parseMetadata(parsed, inputUrl) {
    if (!parsed || typeof parsed !== 'object') throw new Error('Gecersiz metadata.');
    if (Array.isArray(parsed.entries)) {
      const playlistTitle = parsed.title || parsed.playlist_title || '';
      const items = parsed.entries.map((entry, index) => {
        const url = resolvedUrl(entry, '');
        if (!url) return null;
        return { url, title: entry.title || '', sourceType: 'playlist', playlistUrl: inputUrl,
          playlistTitle, playlistIndex: Number(entry.playlist_index || entry.index || index + 1),
          originalInputUrl: inputUrl };
      }).filter(Boolean);
      if (!items.length) throw new Error('Playlist icinden gecerli oge cikarilamadi.');
      return { sourceType: 'playlist', playlistUrl: inputUrl, playlistTitle, originalInputUrl: inputUrl,
        unavailableItems: parsed.entries.length - items.length, items };
    }
    return { sourceType: 'single', originalInputUrl: inputUrl, items: [{
      url: resolvedUrl(parsed, canonicalUrl(inputUrl)), title: parsed.title || '', sourceType: 'single',
      originalInputUrl: inputUrl
    }] };
  }

  buildArgs(job, downloadFolder) {
    validateUrl(job.url);
    const args = ['--newline', '--progress', '--ignore-config', '--no-warnings', '--no-playlist',
      '--cache-dir', path.join(this.appPaths.dataDir || this.appPaths.baseDir, 'yt-dlp-cache'),
      '--no-js-runtimes', '--js-runtimes', 'node:' + (this.appPaths.jsRuntimePath || process.execPath),
      '--restrict-filenames', '--windows-filenames', '--ffmpeg-location', this.appPaths.binDir,
      '--output', path.join(downloadFolder, '%(title)s [%(id)s].%(ext)s'),
      '--print', 'before_dl:TITLE:%(title)s', '--print', 'after_move:FILEPATH:%(filepath)s',
      '--progress-template', 'download:DOWNLOAD:%(progress.downloaded_bytes)s|%(progress.total_bytes,progress.total_bytes_estimate)s|%(progress._percent_str)s|%(progress._speed_str)s|%(progress._eta_str)s|%(info.filename)s',
      '--progress-template', 'postprocess:POSTPROCESS:%(progress.status)s|%(progress.postprocessor)s'];
    if (job.format === 'audio') args.push('--extract-audio', '--audio-format', 'mp3', '--audio-quality', '0');
    else args.push('--format', 'best[ext=mp4]/best');
    args.push('--', job.url);
    return args;
  }

  start(job, options) {
    const executable = this.ensureYtDlpExists();
    this.ensureFfmpegExists();
    fs.mkdirSync(options.downloadFolder, { recursive: true });
    const child = spawnManaged(executable, this.buildArgs(job, options.downloadFolder), {
      cwd: this.appPaths.baseDir, windowsHide: true, detached: process.platform !== 'win32',
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }
    });
    this.logger('Starting ' + job.format + ' download: ' + job.url);
    let cancelled = false;
    let lastFilePath = '';
    let errorText = '';
    let spawnError;
    let stage = 'starting';
    let lastTransfer = '';
    let lastBytes = -1;
    let lastPostprocess = '';
    const readers = [child.stdout, child.stderr].map(input => readline.createInterface({ input }));
    const update = (patch, activity) => {
      if (cancelled) return;
      options.onUpdate(patch, Boolean(activity));
    };
    const applyLine = line => {
      if (cancelled) return;
      line = String(line).trim();
      if (line.startsWith('TITLE:')) {
        update({ title: line.slice(6).trim(), stage: 'starting' }, stage === 'starting');
        stage = 'metadata';
      } else if (line.startsWith('FILEPATH:')) {
        lastFilePath = line.slice(9).trim();
        update({ outputPath: lastFilePath, stage: 'finishing' }, true);
      } else if (line.startsWith('DOWNLOAD:')) {
        const values = line.slice(9).split('|');
        const bytes = numeric(values[0]);
        const progress = numeric(values[2]);
        const transfer = values.slice(5).join('|');
        const activity = bytes !== null && (transfer !== lastTransfer || bytes > lastBytes);
        if (activity) { lastTransfer = transfer; lastBytes = bytes; }
        stage = 'download';
        const patch = { stage, downloadedBytes: bytes, speed: values[3].trim(), eta: values[4].trim() };
        if (progress !== null) patch.progress = Math.max(0, Math.min(100, progress));
        update(patch, activity);
      } else if (line.startsWith('POSTPROCESS:')) {
        const marker = line.slice(12);
        const activity = marker !== lastPostprocess || stage !== 'postprocess';
        stage = 'postprocess';
        lastPostprocess = marker;
        // Postprocessors often have no percent. Do not overwrite the downloaded percentage.
        update({ stage, speed: '-', eta: '-' }, activity);
      } else if (line.startsWith('ERROR:')) errorText = line;
    };
    readers.forEach(reader => reader.on('line', applyLine));
    const promise = new Promise((resolve, reject) => {
      child.once('error', error => { spawnError = error; });
      child.once('close', code => {
        readers.forEach(reader => reader.close());
        if (cancelled) { reject(cancelledError('Download cancelled')); return; }
        if (spawnError) { reject(spawnError); return; }
        if (code !== 0) { reject(new Error(errorText || ('yt-dlp exited with code ' + code))); return; }
        const relative = path.relative(options.downloadFolder, lastFilePath);
        if (!lastFilePath || relative.startsWith('..') || path.isAbsolute(relative)
          || !fs.existsSync(lastFilePath) || !fs.statSync(lastFilePath).isFile()) {
          reject(new Error('Indirme tamamlandi ancak cikti dosyasi dogrulanamadi.')); return;
        }
        resolve({ outputPath: lastFilePath });
      });
    });
    return { promise, cancel() { if (!cancelled) { cancelled = true; killProcessTree(child); } } };
  }
}

module.exports = YtDlpRunner;
