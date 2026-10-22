const PAGE_SIZE = 100;
const MAX_LOGS = 200;
const state = { jobs: [], jobMap: new Map(), stats: {}, settings: {}, paths: {}, binaries: {},
  analysis: {}, warnings: [], logs: [], selectedFormat: 'video', revision: -1, page: 0, uiGeneration: 0 };
const refs = {};
const rows = new Map();
let displayedIds = '';
let statsSignature = '';
let resyncing = false;

function escapeHtml(value) {
  return String(value == null ? '' : value).replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function formatLabel(format) { return format === 'audio' ? 'MP3' : 'Video'; }
function renderStats() {
  const signature = JSON.stringify(state.stats);
  if (signature === statsSignature) return;
  statsSignature = signature;
  refs.statsGrid.innerHTML = [['Toplam', 'total'], ['Kuyrukta', 'queued'], ['Indiriliyor', 'downloading'],
    ['Tamamlandi', 'completed'], ['Hatali', 'failed'], ['Video', 'video'], ['MP3', 'audio'], ['Playlist ogesi', 'playlists']]
    .map(([label, key]) => '<article class="stat-card"><span class="meta-label">' + label
      + '</span><strong>' + Number(state.stats[key] || 0) + '</strong></article>').join('');
}
function renderMeta() {
  refs.downloadFolder.textContent = state.settings.downloadFolder || '-';
  refs.ytDlpStatus.textContent = state.binaries.ytDlp ? 'yt-dlp hazir' : 'yt-dlp eksik';
  refs.ffmpegStatus.textContent = state.binaries.ffmpeg ? 'ffmpeg hazir' : 'ffmpeg eksik';
  refs.ytDlpStatus.className = 'pill ' + (state.binaries.ytDlp ? 'ok' : 'fail');
  refs.ffmpegStatus.className = 'pill ' + (state.binaries.ffmpeg ? 'ok' : 'fail');
  const analyses = (state.analysis.active || 0) + (state.analysis.waiting || 0);
  refs.summaryText.textContent = state.jobs.length + ' is' + (analyses ? ', ' + analyses + ' giris analiz ediliyor' : '');
  refs.storageWarning.hidden = !state.warnings.length;
  refs.storageWarning.textContent = state.warnings.join(' ');
}
function buildActions(job) {
  const actions = [];
  if (['failed', 'cancelled'].includes(job.status)) {
    const exhausted = job.retries >= (state.settings.maxRetries || 3);
    actions.push('<button data-action="retry" data-job-id="' + escapeHtml(job.id) + '"'
      + (exhausted ? ' disabled title="Deneme sinirina ulasildi"' : '') + '>Yeniden dene</button>');
  }
  if (job.status === 'completed' && job.outputPath) {
    for (const [action, label] of [['open-file', 'Dosyayi ac'], ['open-folder', 'Klasoru ac']]) {
      actions.push('<button data-action="' + action + '" data-job-id="' + escapeHtml(job.id) + '">' + label + '</button>');
    }
  }
  return actions.join('') || '-';
}
function updateJobRow(row, job, index) {
  row.innerHTML = '<td>' + (index + 1) + '</td><td><span class="format-chip">' + formatLabel(job.format) + '</span></td>'
    + '<td>' + escapeHtml(job.title || '-') + '</td><td class="mono">' + escapeHtml(job.url) + '</td>'
    + '<td>' + escapeHtml(job.playlistTitle || '-') + '</td><td>' + escapeHtml(job.playlistIndex == null ? '-' : job.playlistIndex) + '</td>'
    + '<td><span class="status ' + escapeHtml(job.status) + '">' + escapeHtml(job.status)
    + (job.status === 'downloading' && job.stage === 'postprocess' ? ' / donusturuluyor' : '') + '</span></td>'
    + '<td>' + Math.round(job.progress || 0) + '%</td><td>' + escapeHtml(job.speed || '-') + '</td>'
    + '<td>' + escapeHtml(job.eta || '-') + '</td><td class="error">' + escapeHtml(job.errorMessage || '-') + '</td>'
    + '<td><div class="row-actions">' + buildActions(job) + '</div></td>';
}
function renderJobs() {
  const pages = Math.max(1, Math.ceil(state.jobs.length / PAGE_SIZE));
  state.page = Math.max(0, Math.min(state.page, pages - 1));
  refs.pageInfo.textContent = (state.page + 1) + ' / ' + pages;
  refs.previousPage.disabled = state.page === 0;
  refs.nextPage.disabled = state.page >= pages - 1;
  const offset = state.page * PAGE_SIZE;
  const visible = state.jobs.slice(offset, offset + PAGE_SIZE);
  const ids = visible.map(job => job.id).join('|');
  const structureChanged = ids !== displayedIds;
  const fragment = structureChanged ? document.createDocumentFragment() : null;
  const wanted = new Set(visible.map(job => job.id));
  for (const [id] of rows) if (!wanted.has(id)) rows.delete(id);
  visible.forEach((job, index) => {
    const signature = JSON.stringify([job, offset + index, state.settings.maxRetries]);
    let cached = rows.get(job.id);
    if (!cached) {
      const row = document.createElement('tr');
      row.dataset.jobId = job.id;
      cached = { row, signature: '' };
      rows.set(job.id, cached);
    }
    if (cached.signature !== signature) { updateJobRow(cached.row, job, offset + index); cached.signature = signature; }
    if (fragment) fragment.appendChild(cached.row);
  });
  if (!visible.length) {
    if (refs.jobsBody.querySelector('tr[data-job-id]') || !refs.jobsBody.querySelector('.empty')) {
      refs.jobsBody.innerHTML = '<tr><td colspan="12" class="empty">Henuz is yok.</td></tr>';
    }
  } else if (fragment || !refs.jobsBody.querySelector('tr[data-job-id]')) {
    refs.jobsBody.replaceChildren(fragment);
  }
  displayedIds = ids;
}
function render() { renderMeta(); renderStats(); renderJobs(); }
function renderLogs() { refs.logBox.textContent = state.logs.length ? state.logs.slice(-14).join('\n') : 'Hazir'; }
function addLog(line) {
  state.logs.push(String(line));
  if (state.logs.length > MAX_LOGS) state.logs.splice(0, state.logs.length - MAX_LOGS);
  renderLogs();
}
function applySnapshot(snapshot) {
  if (snapshot.revision < state.revision) return;
  state.revision = snapshot.revision;
  state.jobMap = new Map((snapshot.jobs || []).map(job => [job.id, job]));
  state.jobs = [...state.jobMap.values()];
  for (const key of ['stats', 'settings', 'paths', 'binaries', 'analysis']) state[key] = snapshot[key] || {};
  state.warnings = snapshot.warnings || [];
  render();
}
function applyDelta(delta) {
  if (delta.revision <= state.revision) return;
  if (state.revision < 0 || delta.revision !== state.revision + 1) {
    if (!resyncing) {
      resyncing = true;
      window.appApi.bootstrap().then(applySnapshot).catch(showError).finally(() => { resyncing = false; });
    }
    return;
  }
  for (const id of delta.removed || []) state.jobMap.delete(id);
  for (const job of delta.jobs || []) state.jobMap.set(job.id, job);
  state.jobs = [...state.jobMap.values()];
  state.revision = delta.revision;
  state.stats = delta.stats;
  state.analysis = delta.analysis;
  state.warnings = delta.warnings || [];
  render();
}
function showError(error) { refs.lastMessage.textContent = error.message || String(error); }
async function action(task) { try { return await task(); } catch (error) { showError(error); } }
async function startDownloads() {
  const text = refs.urlInput.value.trim();
  if (!text) { refs.lastMessage.textContent = 'Baslatmak icin en az bir link girin.'; return; }
  const generation = ++state.uiGeneration;
  refs.startButton.disabled = true;
  refs.lastMessage.textContent = 'Girisler analiz ediliyor...';
  try {
    const result = await window.appApi.startDownloads(text, state.selectedFormat);
    if (generation !== state.uiGeneration) return;
    refs.lastMessage.textContent = result.queued + ' is ' + formatLabel(result.format) + ' olarak kuyruga alindi; '
      + result.skipped + ' oge atlandi; ' + result.failedInputs + ' analiz hatasi; ' + result.cancelled + ' iptal.';
    if (refs.urlInput.value.trim() === text) refs.urlInput.value = '';
  } finally { refs.startButton.disabled = false; }
}
function bindEvents() {
  refs.startButton.addEventListener('click', () => action(startDownloads));
  refs.stopButton.addEventListener('click', () => action(async () => {
    state.uiGeneration++;
    await window.appApi.stopDownloads();
    refs.lastMessage.textContent = 'Islemler durduruldu.';
  }));
  refs.clearButton.addEventListener('click', () => action(async () => {
    state.uiGeneration++;
    await window.appApi.clearJobs();
    refs.lastMessage.textContent = 'Liste temizlendi.';
  }));
  refs.retryButton.addEventListener('click', () => action(async () => {
    const result = await window.appApi.retryFailed();
    refs.lastMessage.textContent = result.retried + ' is yeniden denemeye alindi.';
  }));
  refs.openFolderButton.addEventListener('click', () => action(async () => {
    const error = await window.appApi.openDownloadsFolder(); if (error) throw new Error(error);
  }));
  refs.pickFolderButton.addEventListener('click', () => action(() => window.appApi.pickDownloadFolder()));
  refs.formatInputs.forEach(input => input.addEventListener('change', () => {
    state.selectedFormat = document.querySelector('input[name="downloadFormat"]:checked').value;
  }));
  refs.previousPage.addEventListener('click', () => { state.page--; renderJobs(); });
  refs.nextPage.addEventListener('click', () => { state.page++; renderJobs(); });
  refs.jobsBody.addEventListener('click', event => {
    const button = event.target.closest('button[data-action]');
    if (!button || button.disabled) return;
    action(async () => {
      const id = button.dataset.jobId;
      if (button.dataset.action === 'retry') return window.appApi.retryFailed(id);
      const error = await (button.dataset.action === 'open-file' ? window.appApi.openJobFile(id) : window.appApi.openJobFolder(id));
      if (error) throw new Error(error);
    });
  });
  window.appApi.onSnapshot(applySnapshot);
  window.appApi.onDelta(applyDelta);
  window.appApi.onLog(addLog);
}
window.addEventListener('DOMContentLoaded', async () => {
  for (const id of ['urlInput', 'startButton', 'stopButton', 'retryButton', 'clearButton', 'openFolderButton',
    'pickFolderButton', 'statsGrid', 'jobsBody', 'downloadFolder', 'ytDlpStatus', 'ffmpegStatus', 'logBox',
    'lastMessage', 'summaryText', 'previousPage', 'nextPage', 'pageInfo', 'storageWarning']) refs[id] = document.getElementById(id);
  refs.formatInputs = [...document.querySelectorAll('input[name="downloadFormat"]')];
  bindEvents();
  try { applySnapshot(await window.appApi.bootstrap()); renderLogs(); document.documentElement.dataset.ready = 'true'; }
  catch (error) { showError(error); throw error; }
});
