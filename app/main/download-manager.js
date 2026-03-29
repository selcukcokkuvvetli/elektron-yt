const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');
const YtDlpRunner = require('./ytdlp-runner');

function nowIso() {
  return new Date().toISOString();
}

function sanitizeFormat(format) {
  return format === 'audio' ? 'audio' : 'video';
}

function makeArchiveKey(url, format) {
  return JSON.stringify({
    url: url,
    format: sanitizeFormat(format)
  });
}

function parseArchiveLine(line) {
  const trimmed = String(line || '').trim();
  if (!trimmed) {
    return null;
  }

  if (trimmed[0] === '{') {
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && parsed.url) {
        return {
          key: makeArchiveKey(parsed.url, parsed.format),
          url: parsed.url,
          format: sanitizeFormat(parsed.format)
        };
      }
    } catch (error) {
      return null;
    }
  }

  return {
    key: makeArchiveKey(trimmed, 'video'),
    url: trimmed,
    format: 'video'
  };
}

function createJob(url, status, format) {
  const createdAt = nowIso();
  return {
    id: 'job_' + Date.now() + '_' + Math.random().toString(16).slice(2, 8),
    url: url,
    title: '',
    format: sanitizeFormat(format),
    status: status || 'queued',
    progress: 0,
    speed: '-',
    eta: '-',
    errorMessage: '',
    outputPath: '',
    retries: 0,
    createdAt: createdAt,
    updatedAt: createdAt,
    batchId: 'batch_' + Date.now(),
    lastTriedAt: ''
  };
}

function normalizeJob(rawJob) {
  const job = Object.assign(
    createJob(rawJob.url || '', rawJob.status || 'queued', rawJob.format || 'video'),
    rawJob
  );

  job.progress = Number(job.progress) || 0;
  job.speed = job.speed || '-';
  job.eta = job.eta || '-';
  job.errorMessage = job.errorMessage || '';
  job.outputPath = job.outputPath || '';
  job.title = job.title || '';
  job.format = sanitizeFormat(job.format);
  job.retries = Number(job.retries) || 0;
  return job;
}

function buildStats(jobs) {
  const stats = {
    total: jobs.length,
    waiting: 0,
    queued: 0,
    downloading: 0,
    completed: 0,
    failed: 0,
    cancelled: 0,
    skipped: 0,
    video: 0,
    audio: 0
  };

  jobs.forEach(function each(job) {
    if (Object.prototype.hasOwnProperty.call(stats, job.status)) {
      stats[job.status] += 1;
    }

    if (job.format === 'audio') {
      stats.audio += 1;
    } else {
      stats.video += 1;
    }
  });

  return stats;
}

class DownloadManager extends EventEmitter {
  constructor(options) {
    super();
    this.jobStore = options.jobStore;
    this.settingsStore = options.settingsStore;
    this.paths = options.paths;
    this.runner = options.runner || new YtDlpRunner(this.paths, this.log.bind(this));
    this.jobs = [];
    this.activeTasks = new Map();
    this.queue = [];
    this.archiveSet = new Set();
    this.persistTimer = null;
    this.snapshotTimer = null;
    this.settings = null;
    this.logFile = path.join(this.paths.logsDir, 'app-' + nowIso().slice(0, 10) + '.log');
  }

  initialize() {
    this.settings = this.settingsStore.load();
    this.ensureManagedDirectories();
    this.jobs = this.jobStore.load().map(normalizeJob);
    this.archiveSet = this.loadArchive();

    let mutated = false;

    this.jobs = this.jobs.map(function mapJob(job) {
      if (job.status === 'queued' || job.status === 'downloading' || job.status === 'waiting') {
        mutated = true;
        return Object.assign({}, job, {
          status: 'cancelled',
          errorMessage: 'Uygulama yeniden baslatildigi icin islem durduruldu.',
          updatedAt: nowIso()
        });
      }

      return job;
    });

    if (mutated) {
      this.persistNow();
    }

    this.emitSnapshot();
  }

  dispose() {
    this.stopAll();
    this.persistNow();
  }

  ensureManagedDirectories() {
    fs.mkdirSync(this.settings.downloadFolder, { recursive: true });
    fs.mkdirSync(this.getFormatFolder('video'), { recursive: true });
    fs.mkdirSync(this.getFormatFolder('audio'), { recursive: true });
  }

  getFormatFolder(format) {
    return sanitizeFormat(format) === 'audio'
      ? path.join(this.settings.downloadFolder, 'audio')
      : path.join(this.settings.downloadFolder, 'video');
  }

  log(message) {
    const line = '[' + nowIso() + '] ' + message;
    fs.appendFileSync(this.logFile, line + '\n', 'utf8');
    this.emit('log', line);
  }

  loadArchive() {
    if (!fs.existsSync(this.paths.archiveFile)) {
      return new Set();
    }

    const lines = fs.readFileSync(this.paths.archiveFile, 'utf8')
      .split(/\r?\n/)
      .map(parseArchiveLine)
      .filter(Boolean);

    return new Set(lines.map(function map(entry) {
      return entry.key;
    }));
  }

  appendArchive(url, format) {
    const key = makeArchiveKey(url, format);
    if (!url || this.archiveSet.has(key)) {
      return;
    }

    this.archiveSet.add(key);
    fs.appendFileSync(this.paths.archiveFile, key + '\n', 'utf8');
  }

  getState() {
    return {
      jobs: this.jobs.slice(),
      stats: buildStats(this.jobs),
      settings: Object.assign({}, this.settings),
      paths: {
        baseDir: this.paths.baseDir,
        downloadFolder: this.settings.downloadFolder,
        videoFolder: this.getFormatFolder('video'),
        audioFolder: this.getFormatFolder('audio'),
        ytDlpPath: path.join(this.paths.binDir, 'yt-dlp.exe'),
        ffmpegPath: path.join(this.paths.binDir, 'ffmpeg.exe')
      },
      binaries: {
        ytDlp: fs.existsSync(path.join(this.paths.binDir, 'yt-dlp.exe')),
        ffmpeg: fs.existsSync(path.join(this.paths.binDir, 'ffmpeg.exe'))
      }
    };
  }

  scheduleSnapshot() {
    const self = this;
    if (this.snapshotTimer) {
      return;
    }

    this.snapshotTimer = setTimeout(function flush() {
      self.snapshotTimer = null;
      self.emitSnapshot();
    }, 120);
  }

  emitSnapshot() {
    clearTimeout(this.snapshotTimer);
    this.snapshotTimer = null;
    this.emit('snapshot', this.getState());
  }

  persistSoon() {
    const self = this;
    clearTimeout(this.persistTimer);
    this.persistTimer = setTimeout(function flush() {
      self.persistTimer = null;
      self.persistNow();
    }, 250);
  }

  persistNow() {
    clearTimeout(this.persistTimer);
    this.persistTimer = null;
    this.jobStore.save(this.jobs);
  }

  updateSettings(patch) {
    this.settings = this.settingsStore.update(patch);
    this.ensureManagedDirectories();
    this.emitSnapshot();
    return this.getState();
  }

  sanitizeLinks(rawInput) {
    const seen = new Set();
    return String(rawInput || '')
      .split(/\r?\n/)
      .map(function trim(line) {
        return line.trim();
      })
      .filter(Boolean)
      .filter(function dedupe(url) {
        if (seen.has(url)) {
          return false;
        }
        seen.add(url);
        return true;
      });
  }

  hasActiveOrHistoricalUrl(url, format) {
    return this.jobs.some(function hasJob(job) {
      return job.url === url
        && job.format === sanitizeFormat(format)
        && job.status !== 'failed'
        && job.status !== 'cancelled';
    });
  }

  startDownloads(rawInput, format) {
    const jobFormat = sanitizeFormat(format);
    const urls = this.sanitizeLinks(rawInput);
    const createdJobs = [];
    const skippedJobs = [];

    urls.forEach(function each(url) {
      if (this.archiveSet.has(makeArchiveKey(url, jobFormat))) {
        const archiveJob = createJob(url, 'skipped', jobFormat);
        archiveJob.errorMessage = 'Bu link bu formatta daha once indirildi.';
        skippedJobs.push(archiveJob);
        return;
      }

      if (this.hasActiveOrHistoricalUrl(url, jobFormat)) {
        const duplicateJob = createJob(url, 'skipped', jobFormat);
        duplicateJob.errorMessage = 'Bu link bu formatta zaten listede mevcut.';
        skippedJobs.push(duplicateJob);
        return;
      }

      createdJobs.push(createJob(url, 'queued', jobFormat));
    }, this);

    this.jobs = this.jobs.concat(createdJobs, skippedJobs);
    this.queue = this.queue.concat(createdJobs.map(function map(job) {
      return job.id;
    }));

    this.persistSoon();
    this.scheduleSnapshot();
    this.pumpQueue();

    this.log(
      'Queued ' + createdJobs.length + ' ' + jobFormat + ' downloads, skipped ' + skippedJobs.length + ' items.'
    );

    return {
      queued: createdJobs.length,
      skipped: skippedJobs.length,
      totalInput: urls.length,
      format: jobFormat
    };
  }

  clearJobs() {
    this.stopAll();
    this.jobs = [];
    this.queue = [];
    this.persistNow();
    this.emitSnapshot();
    this.log('Job list cleared.');
    return this.getState();
  }

  stopAll() {
    const ids = Array.from(this.activeTasks.keys());
    this.queue = [];

    this.jobs = this.jobs.map(function cancelQueued(job) {
      if (job.status === 'queued' || job.status === 'waiting') {
        return Object.assign({}, job, {
          status: 'cancelled',
          errorMessage: 'Kullanici tarafindan durduruldu.',
          updatedAt: nowIso()
        });
      }

      return job;
    });

    ids.forEach(function cancelTask(id) {
      const activeState = this.activeTasks.get(id);
      if (activeState) {
        activeState.cancel();
        this.cleanupActiveTask(id);
      }
    }, this);

    this.persistSoon();
    this.emitSnapshot();
    this.log('Active downloads stopped.');
    return this.getState();
  }

  retryFailed(targetJobId) {
    const targetSet = targetJobId ? new Set([targetJobId]) : null;
    let queuedCount = 0;

    this.jobs = this.jobs.map(function retry(job) {
      const shouldRetry = (job.status === 'failed' || job.status === 'cancelled')
        && (!targetSet || targetSet.has(job.id));

      if (!shouldRetry) {
        return job;
      }

      if ((job.retries || 0) >= this.settings.maxRetries) {
        return Object.assign({}, job, {
          errorMessage: 'Max retry limitine ulasildi.',
          updatedAt: nowIso()
        });
      }

      queuedCount += 1;
      this.queue.push(job.id);
      return Object.assign({}, job, {
        status: 'queued',
        progress: 0,
        speed: '-',
        eta: '-',
        errorMessage: '',
        updatedAt: nowIso()
      });
    }, this);

    this.persistSoon();
    this.scheduleSnapshot();
    this.pumpQueue();
    this.log('Retry queued for ' + queuedCount + ' jobs.');

    return {
      retried: queuedCount
    };
  }

  findJob(jobId) {
    return this.jobs.find(function find(job) {
      return job.id === jobId;
    });
  }

  updateJob(jobId, patch) {
    this.jobs = this.jobs.map(function map(job) {
      if (job.id !== jobId) {
        return job;
      }

      return Object.assign({}, job, patch, {
        updatedAt: nowIso()
      });
    });

    this.persistSoon();
    this.scheduleSnapshot();
  }

  cleanupActiveTask(jobId) {
    const activeState = this.activeTasks.get(jobId);
    if (!activeState) {
      return;
    }

    clearTimeout(activeState.timeoutHandle);
    this.activeTasks.delete(jobId);
  }

  scheduleTimeout(jobId) {
    const self = this;
    const activeState = this.activeTasks.get(jobId);
    if (!activeState) {
      return;
    }

    clearTimeout(activeState.timeoutHandle);
    activeState.timeoutHandle = setTimeout(function onTimeout() {
      const state = self.activeTasks.get(jobId);
      if (!state) {
        return;
      }

      state.timedOut = true;
      state.cancel();
    }, Number(this.settings.jobTimeoutMs) || 180000);
  }

  pumpQueue() {
    const concurrency = Number(this.settings.concurrency) || 3;

    while (this.activeTasks.size < concurrency && this.queue.length > 0) {
      const jobId = this.queue.shift();
      const job = this.findJob(jobId);

      if (!job || job.status !== 'queued') {
        continue;
      }

      this.startJob(job);
    }
  }

  startJob(job) {
    const nextRetryCount = (job.retries || 0) + 1;
    if (nextRetryCount > this.settings.maxRetries) {
      this.updateJob(job.id, {
        status: 'failed',
        errorMessage: 'Max retry limitine ulasildi.'
      });
      return;
    }

    this.updateJob(job.id, {
      status: 'downloading',
      lastTriedAt: nowIso(),
      retries: nextRetryCount,
      errorMessage: '',
      speed: '-',
      eta: '-'
    });

    let task;
    const currentJob = this.findJob(job.id) || job;

    try {
      task = this.runner.start(currentJob, {
        downloadFolder: this.getFormatFolder(currentJob.format),
        onUpdate: function onUpdate(patch) {
          this.scheduleTimeout(job.id);
          this.updateJob(job.id, patch);
        }.bind(this)
      });
    } catch (error) {
      this.updateJob(job.id, {
        status: 'failed',
        errorMessage: error.message
      });
      this.log('Runner failed to start for ' + job.url + ': ' + error.message);
      return;
    }

    this.activeTasks.set(job.id, {
      cancel: task.cancel,
      promise: task.promise,
      timeoutHandle: null,
      timedOut: false
    });
    this.scheduleTimeout(job.id);

    task.promise.then(function onComplete(result) {
      this.cleanupActiveTask(job.id);
      this.appendArchive(job.url, currentJob.format);
      this.updateJob(job.id, {
        status: 'completed',
        progress: 100,
        speed: '-',
        eta: '0s',
        outputPath: result && result.outputPath ? result.outputPath : '',
        errorMessage: ''
      });
      this.log('Completed ' + currentJob.format + ' download ' + job.url);
      this.pumpQueue();
    }.bind(this)).catch(function onFailure(error) {
      const activeState = this.activeTasks.get(job.id);
      const timedOut = activeState && activeState.timedOut;
      this.cleanupActiveTask(job.id);
      this.updateJob(job.id, {
        status: error && error.isCancelled && !timedOut ? 'cancelled' : 'failed',
        errorMessage: timedOut ? 'Job zaman asimina ugradi.' : (error ? error.message : 'Bilinmeyen hata')
      });
      this.log('Failed ' + job.url + ': ' + (timedOut ? 'timeout' : (error ? error.message : 'Unknown error')));
      this.pumpQueue();
    }.bind(this));
  }
}

DownloadManager.makeArchiveKey = makeArchiveKey;
DownloadManager.sanitizeFormat = sanitizeFormat;

module.exports = DownloadManager;
