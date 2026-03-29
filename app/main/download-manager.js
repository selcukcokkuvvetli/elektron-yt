const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');
const YtDlpRunner = require('./ytdlp-runner');

function nowIso() {
  return new Date().toISOString();
}

function createJob(url, status) {
  const createdAt = nowIso();
  return {
    id: 'job_' + Date.now() + '_' + Math.random().toString(16).slice(2, 8),
    url: url,
    title: '',
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
  const job = Object.assign(createJob(rawJob.url || '', rawJob.status || 'queued'), rawJob);
  job.progress = Number(job.progress) || 0;
  job.speed = job.speed || '-';
  job.eta = job.eta || '-';
  job.errorMessage = job.errorMessage || '';
  job.outputPath = job.outputPath || '';
  job.title = job.title || '';
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
    skipped: 0
  };

  jobs.forEach(function each(job) {
    if (Object.prototype.hasOwnProperty.call(stats, job.status)) {
      stats[job.status] += 1;
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
    this.settings = null;
    this.logFile = path.join(this.paths.logsDir, 'app-' + nowIso().slice(0, 10) + '.log');
  }

  initialize() {
    this.settings = this.settingsStore.load();
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
      .map(function trim(line) {
        return line.trim();
      })
      .filter(Boolean);

    return new Set(lines);
  }

  appendArchive(url) {
    if (!url || this.archiveSet.has(url)) {
      return;
    }

    this.archiveSet.add(url);
    fs.appendFileSync(this.paths.archiveFile, url + '\n', 'utf8');
  }

  getState() {
    return {
      jobs: this.jobs.slice(),
      stats: buildStats(this.jobs),
      settings: Object.assign({}, this.settings),
      paths: {
        baseDir: this.paths.baseDir,
        downloadFolder: this.settings.downloadFolder,
        ytDlpPath: path.join(this.paths.binDir, 'yt-dlp.exe'),
        ffmpegPath: path.join(this.paths.binDir, 'ffmpeg.exe')
      },
      binaries: {
        ytDlp: fs.existsSync(path.join(this.paths.binDir, 'yt-dlp.exe')),
        ffmpeg: fs.existsSync(path.join(this.paths.binDir, 'ffmpeg.exe'))
      }
    };
  }

  emitSnapshot() {
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
    if (!fs.existsSync(this.settings.downloadFolder)) {
      fs.mkdirSync(this.settings.downloadFolder, { recursive: true });
    }
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

  hasActiveOrHistoricalUrl(url) {
    return this.jobs.some(function hasJob(job) {
      return job.url === url && job.status !== 'failed' && job.status !== 'cancelled';
    });
  }

  startDownloads(rawInput) {
    const urls = this.sanitizeLinks(rawInput);
    const createdJobs = [];
    const skippedJobs = [];

    urls.forEach(function each(url) {
      if (this.archiveSet.has(url)) {
        const job = createJob(url, 'skipped');
        job.errorMessage = 'Bu link daha once indirildi.';
        skippedJobs.push(job);
        return;
      }

      if (this.hasActiveOrHistoricalUrl(url)) {
        const job = createJob(url, 'skipped');
        job.errorMessage = 'Bu link zaten listede mevcut.';
        skippedJobs.push(job);
        return;
      }

      createdJobs.push(createJob(url, 'queued'));
    }, this);

    this.jobs = this.jobs.concat(createdJobs, skippedJobs);
    this.queue = this.queue.concat(createdJobs.map(function map(job) {
      return job.id;
    }));

    this.persistSoon();
    this.emitSnapshot();
    this.pumpQueue();

    this.log('Queued ' + createdJobs.length + ' downloads, skipped ' + skippedJobs.length + ' items.');

    return {
      queued: createdJobs.length,
      skipped: skippedJobs.length,
      totalInput: urls.length
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
      const task = this.activeTasks.get(id);
      if (task) {
        task.cancel();
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
    this.emitSnapshot();
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
    this.emitSnapshot();
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
    this.updateJob(job.id, {
      status: 'downloading',
      lastTriedAt: nowIso(),
      retries: (job.retries || 0) + 1,
      errorMessage: '',
      speed: '-',
      eta: '-'
    });

    let task;
    const currentJob = this.findJob(job.id) || job;

    try {
      task = this.runner.start(currentJob, {
        downloadFolder: this.settings.downloadFolder,
        onUpdate: function onUpdate(patch) {
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

    this.activeTasks.set(job.id, task);

    task.promise.then(function onComplete(result) {
      this.activeTasks.delete(job.id);
      this.appendArchive(job.url);
      this.updateJob(job.id, {
        status: 'completed',
        progress: 100,
        speed: '-',
        eta: '0s',
        outputPath: result && result.outputPath ? result.outputPath : '',
        errorMessage: ''
      });
      this.log('Completed ' + job.url);
      this.pumpQueue();
    }.bind(this)).catch(function onFailure(error) {
      this.activeTasks.delete(job.id);
      this.updateJob(job.id, {
        status: error && error.isCancelled ? 'cancelled' : 'failed',
        errorMessage: error ? error.message : 'Bilinmeyen hata'
      });
      this.log('Failed ' + job.url + ': ' + (error ? error.message : 'Unknown error'));
      this.pumpQueue();
    }.bind(this));
  }
}

module.exports = DownloadManager;
