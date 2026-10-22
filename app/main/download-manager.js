const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { EventEmitter } = require('events');
const YtDlpRunner = require('./ytdlp-runner');
const { canonicalUrl, validateUrl } = require('./urls');

const nowIso = () => new Date().toISOString();
const sanitizeFormat = format => format === 'audio' ? 'audio' : 'video';
function makeArchiveKey(url, format) {
  return JSON.stringify({ url: canonicalUrl(url), format: sanitizeFormat(format) });
}
function looksLikePlaylistUrl(url) {
  try { const parsed = new URL(url); return parsed.searchParams.has('list') || parsed.pathname.includes('/playlist'); }
  catch (_) { return false; }
}
function createJob(url, status, format, extra = {}) {
  const timestamp = nowIso();
  return { id: 'job_' + crypto.randomBytes(12).toString('hex'), url, title: '', format: sanitizeFormat(format),
    sourceType: 'single', playlistUrl: '', playlistTitle: '', playlistIndex: null, originalInputUrl: url,
    status: status || 'queued', stage: 'starting', progress: 0, speed: '-', eta: '-', errorMessage: '',
    outputPath: '', downloadRoot: '', retries: 0, failureStage: '', createdAt: timestamp, updatedAt: timestamp,
    batchId: 'batch_' + crypto.randomBytes(8).toString('hex'), lastTriedAt: '', ...extra };
}
function normalizeJob(raw) {
  const job = createJob(raw.url, raw.status, raw.format);
  for (const key of Object.keys(job)) {
    if (raw[key] !== undefined && typeof raw[key] === typeof job[key]) job[key] = raw[key];
  }
  job.playlistIndex = Number.isFinite(Number(raw.playlistIndex)) && raw.playlistIndex !== null ? Number(raw.playlistIndex) : null;
  job.progress = Math.max(0, Math.min(100, Number(raw.progress) || 0));
  job.retries = Math.max(0, Math.min(10, Math.floor(Number(raw.retries) || 0)));
  job.format = sanitizeFormat(job.format);
  job.sourceType = job.sourceType === 'playlist' ? 'playlist' : 'single';
  // Older analysis failures did not carry an explicit stage.
  if (!job.failureStage && (/^Analiz hatasi:/.test(job.errorMessage)
    || (job.sourceType === 'playlist' && !job.playlistUrl && job.playlistIndex === null))) job.failureStage = 'analysis';
  return job;
}
function buildStats(jobs) {
  const stats = { total: jobs.length, waiting: 0, queued: 0, downloading: 0, completed: 0, failed: 0,
    cancelled: 0, skipped: 0, video: 0, audio: 0, playlists: 0 };
  for (const job of jobs) {
    if (Object.prototype.hasOwnProperty.call(stats, job.status)) stats[job.status]++;
    stats[job.format === 'audio' ? 'audio' : 'video']++;
    if (job.sourceType === 'playlist') stats.playlists++;
  }
  return stats;
}

class DownloadManager extends EventEmitter {
  constructor(options) {
    super();
    this.jobStore = options.jobStore;
    this.settingsStore = options.settingsStore;
    this.paths = options.paths;
    this.runner = options.runner || new YtDlpRunner(this.paths, this.log.bind(this));
    this.resolver = options.resolver || this.runner;
    this.jobs = [];
    this.jobIndex = new Map();
    this.blockingKeys = new Map();
    this.activeTasks = new Map();
    this.activeAnalyses = new Map();
    this.analysisQueue = [];
    this.queue = [];
    this.archiveSet = new Set();
    this.persistTimer = null;
    this.snapshotTimer = null;
    this.settings = null;
    this.storageWarnings = [];
    this.revision = 0;
    this.dirtyJobs = new Set();
    this.removedJobIds = new Set();
    this.generation = 0;
    this.disposed = false;
    this.logFile = path.join(this.paths.logsDir, 'app-' + nowIso().slice(0, 10) + '.log');
  }

  initialize() {
    this.settings = this.settingsStore.load();
    this.ensureManagedDirectories();
    try {
      const cutoff = Date.now() - 30 * 86400000;
      for (const name of fs.readdirSync(this.paths.logsDir)) {
        const file = path.join(this.paths.logsDir, name);
        if (/^app-\d{4}-\d{2}-\d{2}\.log(?:\.1)?$/.test(name) && fs.statSync(file).mtimeMs < cutoff) fs.unlinkSync(file);
      }
    } catch (error) { this.storageError(error); }
    this.jobs = this.jobStore.load().map(normalizeJob);
    this.reindex();
    this.storageWarnings.push(...(this.jobStore.warnings || []), ...(this.settingsStore.warnings || []));
    this.archiveSet = this.loadArchive();
    let changed = false;
    for (const job of this.jobs) {
      if (['queued', 'downloading', 'waiting'].includes(job.status)) {
        Object.assign(job, { status: 'cancelled', errorMessage: 'Uygulama yeniden baslatildigi icin islem durduruldu.', updatedAt: nowIso() });
        changed = true;
      }
    }
    this.reindex();
    if (changed) this.persistNow();
    this.emitSnapshot();
  }

  blockingKey(job) {
    return job && job.failureStage !== 'analysis' && ['queued', 'waiting', 'downloading', 'completed'].includes(job.status)
      ? makeArchiveKey(job.url, job.format) : null;
  }
  adjustKey(key, amount) {
    if (!key) return;
    const count = (this.blockingKeys.get(key) || 0) + amount;
    if (count > 0) this.blockingKeys.set(key, count);
    else this.blockingKeys.delete(key);
  }
  reindex() {
    this.jobIndex = new Map(this.jobs.map(job => [job.id, job]));
    this.blockingKeys = new Map();
    for (const job of this.jobs) this.adjustKey(this.blockingKey(job), 1);
  }

  dispose() {
    if (this.disposePromise) return this.disposePromise;
    this.disposed = true;
    this.stopAll();
    clearTimeout(this.snapshotTimer);
    clearTimeout(this.persistTimer);
    this.snapshotTimer = this.persistTimer = null;
    this.persistNow();
    this.disposePromise = Promise.allSettled([
      ...Array.from(this.activeTasks.values(), task => task.promise),
      ...Array.from(this.activeAnalyses.values(), task => task.running)
    ]);
    return this.disposePromise;
  }

  ensureManagedDirectories() {
    for (const dir of [this.settings.downloadFolder, this.getFormatFolder('video'), this.getFormatFolder('audio')]) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }
  getFormatFolder(format) { return path.join(this.settings.downloadFolder, sanitizeFormat(format) === 'audio' ? 'audio' : 'video'); }

  storageError(error) {
    const message = 'Veri kayit hatasi: ' + error.message;
    if (!this.storageWarnings.includes(message)) this.storageWarnings.push(message);
    this.storageWarnings = this.storageWarnings.slice(-30);
    this.emit('log', '[' + nowIso() + '] ' + message);
    this.scheduleSnapshot();
  }

  log(message) {
    const line = '[' + nowIso() + '] ' + message;
    try {
      // Bound each day's disk log as well as the renderer log buffer.
      if (fs.existsSync(this.logFile) && fs.statSync(this.logFile).size > 2 * 1024 * 1024) {
        fs.renameSync(this.logFile, this.logFile + '.1');
      }
      fs.appendFileSync(this.logFile, line + '\n', 'utf8');
    } catch (error) { this.storageError(error); }
    this.emit('log', line);
  }

  loadArchive() {
    const result = new Set();
    try {
      if (!fs.existsSync(this.paths.archiveFile)) return result;
      for (const line of fs.readFileSync(this.paths.archiveFile, 'utf8').split(/\r?\n/)) {
        if (!line.trim()) continue;
        try {
          const entry = line.trim().startsWith('{') ? JSON.parse(line) : { url: line.trim(), format: 'video' };
          result.add(makeArchiveKey(entry.url, entry.format));
        } catch (_) { this.storageWarnings.push('Gecersiz arsiv satiri atlandi.'); }
      }
    } catch (error) { this.storageError(error); }
    return result;
  }

  appendArchive(url, format) {
    const key = makeArchiveKey(url, format);
    if (this.archiveSet.has(key)) return;
    fs.appendFileSync(this.paths.archiveFile, key + '\n', 'utf8');
    this.archiveSet.add(key);
  }

  getState() {
    return { revision: this.revision, jobs: this.jobs.map(job => ({ ...job })), stats: buildStats(this.jobs), settings: { ...this.settings },
      analysis: { active: this.activeAnalyses.size, waiting: this.analysisQueue.length },
      warnings: this.storageWarnings.slice(-30),
      paths: { baseDir: this.paths.baseDir, downloadFolder: this.settings.downloadFolder,
        videoFolder: this.getFormatFolder('video'), audioFolder: this.getFormatFolder('audio'),
        ytDlpPath: path.join(this.paths.binDir, 'yt-dlp.exe'), ffmpegPath: path.join(this.paths.binDir, 'ffmpeg.exe') },
      binaries: { ytDlp: fs.existsSync(path.join(this.paths.binDir, 'yt-dlp.exe')),
        ffmpeg: fs.existsSync(path.join(this.paths.binDir, 'ffmpeg.exe')) } };
  }
  scheduleSnapshot() {
    if (this.disposed || this.snapshotTimer) return;
    this.snapshotTimer = setTimeout(() => {
      this.snapshotTimer = null;
      this.emit('delta', { revision: ++this.revision,
        jobs: [...this.dirtyJobs].map(id => this.findJob(id)).filter(Boolean).map(job => ({ ...job })),
        removed: [...this.removedJobIds], stats: buildStats(this.jobs),
        analysis: { active: this.activeAnalyses.size, waiting: this.analysisQueue.length },
        warnings: this.storageWarnings.slice(-30) });
      this.dirtyJobs.clear();
      this.removedJobIds.clear();
    }, 120);
  }
  emitSnapshot() {
    clearTimeout(this.snapshotTimer);
    this.snapshotTimer = null;
    if (!this.disposed) {
      this.revision++;
      this.dirtyJobs.clear();
      this.removedJobIds.clear();
      this.emit('snapshot', this.getState());
    }
  }
  persistSoon() {
    if (this.disposed || this.persistTimer) return;
    this.persistTimer = setTimeout(() => { this.persistTimer = null; this.persistNow(); }, 500);
  }
  persistNow() {
    clearTimeout(this.persistTimer);
    this.persistTimer = null;
    try { this.jobStore.save(this.jobs); } catch (error) { this.storageError(error); }
  }
  updateSettings(patch) {
    if (patch.downloadFolder) fs.mkdirSync(patch.downloadFolder, { recursive: true });
    this.settings = this.settingsStore.update(patch);
    this.ensureManagedDirectories();
    this.emitSnapshot();
    return this.getState();
  }
  sanitizeLinks(rawInput) {
    const links = [...new Set(String(rawInput || '').split(/\r?\n/).map(line => line.trim()).filter(Boolean))];
    if (links.some(link => link.length > 8192)) throw new Error('Her link en fazla 8192 karakter olabilir.');
    return links;
  }

  hasActiveOrHistoricalUrl(url, format, excludeId) {
    const key = makeArchiveKey(url, format);
    const excluded = this.findJob(excludeId);
    return (this.blockingKeys.get(key) || 0) > (this.blockingKey(excluded) === key ? 1 : 0);
  }

  createFailedAnalysisJob(url, format, message) {
    return createJob(url, 'failed', format, { failureStage: 'analysis', retries: 1,
      sourceType: looksLikePlaylistUrl(url) ? 'playlist' : 'single', errorMessage: 'Analiz hatasi: ' + message });
  }
  createJobFromResolvedItem(item, format, batchId) {
    return createJob(canonicalUrl(item.url), 'queued', format, { title: item.title || '',
      sourceType: item.sourceType === 'playlist' ? 'playlist' : 'single', playlistUrl: item.playlistUrl || '',
      playlistTitle: item.playlistTitle || '', playlistIndex: item.playlistIndex == null ? null : Number(item.playlistIndex),
      originalInputUrl: item.originalInputUrl || item.url, batchId });
  }
  addJob(job) {
    this.jobs.push(job);
    this.jobIndex.set(job.id, job);
    this.adjustKey(this.blockingKey(job), 1);
    this.dirtyJobs.add(job.id);
  }

  queueAnalysis(url, format, retryJob) {
    if (this.disposed) return Promise.resolve({ cancelled: 1 });
    return new Promise(resolve => {
      let finished = false;
      const entry = { url, format, retryJob, id: crypto.randomBytes(8).toString('hex'),
        generation: this.generation, controller: new AbortController(), finish(result) {
          if (!finished) { finished = true; resolve(result); }
        } };
      this.analysisQueue.push(entry);
      this.pumpAnalysis();
      this.scheduleSnapshot();
    });
  }

  pumpAnalysis() {
    while (!this.disposed && this.activeAnalyses.size < (this.settings.analysisConcurrency || 1) && this.analysisQueue.length) {
      const entry = this.analysisQueue.shift();
      if (entry.generation !== this.generation) { entry.finish({ cancelled: 1 }); continue; }
      this.activeAnalyses.set(entry.id, entry);
      entry.running = this.runAnalysis(entry).finally(() => {
        this.activeAnalyses.delete(entry.id);
        this.pumpAnalysis();
        this.scheduleSnapshot();
      });
    }
  }

  async runAnalysis(entry) {
    const result = { queued: 0, skipped: 0, failedInputs: 0, playlistsResolved: 0, playlistItems: 0, cancelled: 0 };
    try {
      validateUrl(entry.url);
      this.log('Giris analiz ediliyor: ' + entry.url);
      const options = { signal: entry.controller.signal, timeoutMs: this.settings.analysisTimeoutMs || 60000 };
      const resolved = typeof this.resolver.resolveInput === 'function'
        ? await this.resolver.resolveInput(entry.url, options)
        : { sourceType: 'single', items: [{ url: entry.url }] };
      if (entry.generation !== this.generation || this.disposed || entry.controller.signal.aborted) return;
      if (!resolved || !Array.isArray(resolved.items) || !resolved.items.length) throw new Error('Gecerli oge bulunamadi.');
      if (resolved.sourceType === 'playlist') {
        result.playlistsResolved = 1;
        result.playlistItems = resolved.items.length;
      }
      if (resolved.warning || resolved.unavailableItems) this.log(resolved.warning || (resolved.unavailableItems + ' playlist ogesi erisilemiyor.'));
      const batchId = 'batch_' + entry.id;
      // No await between dedupe and append: other analysis results cannot interleave this commit.
      const prepared = resolved.items.map(item => this.createJobFromResolvedItem(item, entry.format, batchId));
      if (entry.retryJob) {
        this.jobs = this.jobs.filter(job => job.id !== entry.retryJob.id);
        this.removedJobIds.add(entry.retryJob.id);
        this.reindex();
      }
      for (const job of prepared) {
        const key = makeArchiveKey(job.url, job.format);
        if (this.archiveSet.has(key) || this.blockingKeys.has(key)) {
          job.status = 'skipped';
          job.errorMessage = this.archiveSet.has(key) ? 'Bu link bu formatta daha once indirildi.' : 'Bu link bu formatta zaten listede mevcut.';
          result.skipped++;
        } else {
          this.queue.push(job.id);
          result.queued++;
        }
        this.addJob(job);
      }
      this.persistSoon();
      this.scheduleSnapshot();
      this.pumpQueue();
      this.log(result.queued + ' ' + entry.format + ' isi kuyruga eklendi, ' + result.skipped + ' oge atlandi.');
      entry.finish(result);
    } catch (error) {
      if (entry.generation !== this.generation || this.disposed || entry.controller.signal.aborted || error.isCancelled) {
        entry.finish({ cancelled: 1 });
        return;
      }
      const job = entry.retryJob;
      if (job) this.updateJob(job.id, { status: 'failed', failureStage: 'analysis', errorMessage: 'Analiz hatasi: ' + error.message });
      else this.addJob(this.createFailedAnalysisJob(entry.url, entry.format, error.message));
      this.persistSoon();
      this.scheduleSnapshot();
      this.log('Analiz basarisiz: ' + error.message);
      result.failedInputs = 1;
      entry.finish(result);
    } finally {
      // stopAll resolves cancelled batches even if a custom resolver ignores AbortSignal.
      if (entry.generation !== this.generation || this.disposed) entry.finish({ cancelled: 1 });
    }
  }

  async startDownloads(rawInput, format) {
    const urls = this.sanitizeLinks(rawInput);
    if (urls.length > 5000) throw new Error('Bir seferde en fazla 5000 giris eklenebilir.');
    const jobFormat = sanitizeFormat(format);
    const results = await Promise.all(urls.map(url => this.queueAnalysis(url, jobFormat)));
    const total = { queued: 0, skipped: 0, failedInputs: 0, playlistsResolved: 0, playlistItems: 0, cancelled: 0,
      totalInput: urls.length, format: jobFormat };
    for (const result of results) for (const key of ['queued', 'skipped', 'failedInputs', 'playlistsResolved', 'playlistItems', 'cancelled']) total[key] += result[key] || 0;
    return total;
  }

  clearJobs() {
    this.stopAll();
    this.jobs = [];
    this.reindex();
    this.persistNow();
    this.emitSnapshot();
    return this.getState();
  }

  stopAll() {
    this.generation++;
    this.queue = [];
    for (const entry of this.analysisQueue.splice(0)) entry.finish({ cancelled: 1 });
    for (const entry of this.activeAnalyses.values()) {
      entry.controller.abort();
      entry.finish({ cancelled: 1 });
    }
    for (const [id, state] of this.activeTasks) {
      state.cancelReason = 'user';
      clearTimeout(state.timeoutHandle);
      state.cancel();
    }
    for (const job of this.jobs) {
      if (['queued', 'waiting', 'downloading'].includes(job.status)) {
        this.updateJob(job.id, { status: 'cancelled', errorMessage: 'Kullanici tarafindan durduruldu.' });
      }
    }
    this.persistSoon();
    this.emitSnapshot();
    return this.getState();
  }

  async retryFailed(targetJobId) {
    let retried = 0;
    const analyses = [];
    for (const job of this.jobs.slice()) {
      if ((targetJobId && job.id !== targetJobId) || !['failed', 'cancelled'].includes(job.status) || this.activeTasks.has(job.id)) continue;
      if (job.retries >= this.settings.maxRetries) {
        this.updateJob(job.id, { errorMessage: 'Max retry limitine ulasildi.' });
        continue;
      }
      if (job.failureStage === 'analysis') {
        this.updateJob(job.id, { status: 'waiting', retries: job.retries + 1, errorMessage: '' });
        analyses.push(this.queueAnalysis(job.originalInputUrl || job.url, job.format, job));
      } else {
        const key = makeArchiveKey(job.url, job.format);
        if (this.archiveSet.has(key) || this.hasActiveOrHistoricalUrl(job.url, job.format, job.id)) {
          this.updateJob(job.id, { status: 'skipped', errorMessage: 'Bu link bu formatta zaten mevcut.' });
          continue;
        }
        this.updateJob(job.id, { status: 'queued', progress: 0, outputPath: '', errorMessage: '', speed: '-', eta: '-' });
        this.queue.push(job.id);
      }
      retried++;
    }
    this.persistSoon();
    this.pumpQueue();
    await Promise.all(analyses);
    return { retried };
  }

  findJob(id) { return this.jobIndex.get(id); }
  updateJob(id, patch) {
    const job = this.findJob(id);
    if (!job) return;
    const oldKey = this.blockingKey(job);
    Object.assign(job, patch, { updatedAt: nowIso() });
    const newKey = this.blockingKey(job);
    if (oldKey !== newKey) { this.adjustKey(oldKey, -1); this.adjustKey(newKey, 1); }
    this.dirtyJobs.add(id);
    this.persistSoon();
    this.scheduleSnapshot();
  }
  cleanupActiveTask(id, expected) {
    const state = this.activeTasks.get(id);
    if (!state || (expected && expected !== state)) return;
    clearTimeout(state.timeoutHandle);
    this.activeTasks.delete(id);
  }
  scheduleTimeout(id, state) {
    if (this.activeTasks.get(id) !== state || state.cancelReason) return;
    clearTimeout(state.timeoutHandle);
    const job = this.findJob(id);
    const timeout = job && job.stage === 'postprocess'
      ? (this.settings.postprocessTimeoutMs || 600000)
      : job && job.stage === 'starting' ? (this.settings.startupTimeoutMs || Math.max(this.settings.jobTimeoutMs, 30000))
        : this.settings.jobTimeoutMs;
    state.timeoutHandle = setTimeout(() => {
      if (this.activeTasks.get(id) !== state) return;
      state.cancelReason = 'timeout';
      state.cancel();
    }, timeout || 180000);
  }
  pumpQueue() {
    while (!this.disposed && this.activeTasks.size < this.settings.concurrency && this.queue.length) {
      const job = this.findJob(this.queue.shift());
      if (job && job.status === 'queued') this.startJob(job);
    }
  }
  startJob(job) {
    if (job.retries >= this.settings.maxRetries) {
      this.updateJob(job.id, { status: 'failed', errorMessage: 'Max retry limitine ulasildi.' });
      return;
    }
    const state = { generation: this.generation, timeoutHandle: null, cancelReason: '', lastProgress: -1,
      cancel: () => {}, promise: Promise.resolve() };
    const current = () => !this.disposed && this.activeTasks.get(job.id) === state
      && state.generation === this.generation && !state.cancelReason;
    this.activeTasks.set(job.id, state);
    const downloadRoot = this.getFormatFolder(job.format);
    this.updateJob(job.id, { status: 'downloading', stage: 'starting', lastTriedAt: nowIso(), retries: job.retries + 1,
      failureStage: '', downloadRoot, errorMessage: '', speed: '-', eta: '-' });
    let task;
    try {
      task = this.runner.start({ ...job }, { downloadFolder: downloadRoot, onUpdate: (patch, activity) => {
        if (!current()) return;
        // Custom runners without the activity argument use increasing progress as a fallback.
        if (activity === undefined) {
          activity = typeof patch.progress === 'number' && patch.progress > state.lastProgress;
          if (activity) state.lastProgress = patch.progress;
          if (patch.progress !== undefined && !patch.stage) patch.stage = 'download';
        }
        this.updateJob(job.id, patch);
        if (activity) this.scheduleTimeout(job.id, state);
      } });
      state.cancel = task.cancel;
      state.promise = task.promise;
      this.scheduleTimeout(job.id, state);
    } catch (error) {
      this.cleanupActiveTask(job.id, state);
      this.updateJob(job.id, { status: 'failed', failureStage: 'download', errorMessage: error.message });
      return;
    }
    task.promise.then(result => {
      if (!current()) return;
      if (!result || !result.outputPath || !fs.existsSync(result.outputPath)) throw new Error('Cikti dosyasi bulunamadi.');
      this.updateJob(job.id, { status: 'completed', progress: 100, speed: '-', eta: '0s',
        outputPath: result.outputPath, failureStage: '', errorMessage: '' });
      try { this.appendArchive(job.url, job.format); } catch (error) { this.storageError(error); }
      this.log('Indirme tamamlandi: ' + job.url);
    }).catch(error => {
      if (this.disposed || this.activeTasks.get(job.id) !== state || state.generation !== this.generation) return;
      const cancelled = state.cancelReason === 'user' || (error.isCancelled && state.cancelReason !== 'timeout');
      this.updateJob(job.id, { status: cancelled ? 'cancelled' : 'failed', failureStage: 'download',
        errorMessage: state.cancelReason === 'timeout' ? 'Job zaman asimina ugradi.' : error.message });
    }).finally(() => {
      this.cleanupActiveTask(job.id, state);
      if (!this.disposed) this.pumpQueue();
    });
  }
}

DownloadManager.makeArchiveKey = makeArchiveKey;
DownloadManager.sanitizeFormat = sanitizeFormat;
module.exports = DownloadManager;
