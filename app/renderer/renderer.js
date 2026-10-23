const PAGE_SIZE = 100;
const MAX_LOGS = 200;
const state = { jobs: [], jobMap: new Map(), stats: {}, settings: {}, paths: {}, binaries: {}, analysis: {},
  warnings: [], logs: [], selectedFormat: 'video', revision: -1, page: 0, uiGeneration: 0, filter: 'all', search: '', detailId: null };
const refs = {};
const rows = new Map();
let displayedIds = '';
let statsSignature = '';
let resyncing = false;
let pendingStart = null;
let initialized = false;
let preferenceGeneration = 0;
let searchTimer;
let dialogOrigin;
let previousActivity = null;
const statusNames = { queued: 'Sırada', waiting: 'Sırada', downloading: 'İndiriliyor', completed: 'Tamamlandı',
  failed: 'İndirilemedi', cancelled: 'Durduruldu', skipped: 'Atlandı' };
function escapeHtml(value) {
  return String(value == null ? '' : value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function formatLabel(format) { return format === 'audio' ? 'MP3' : 'Video'; }
function isActive(job) { return ['queued', 'waiting', 'downloading'].includes(job.status); }
function statusLabel(job) {
  if (job.status === 'downloading') {
    if (job.stage === 'postprocess') return job.format === 'audio' ? 'MP3’e dönüştürülüyor' : 'Video hazırlanıyor';
    if (['starting', 'metadata'].includes(job.stage)) return 'Hazırlanıyor';
    if (job.stage === 'finishing') return 'Dosya doğrulanıyor';
  }
  return statusNames[job.status] || 'Bilinmeyen durum';
}
function errorLabel(job) {
  const text = job.errorMessage || '';
  if (/removed.*copyright|copyright removal/i.test(text)) return 'Video YouTube’dan kaldırılmış.';
  if (/private video/i.test(text)) return 'Bu video gizli.';
  if (/video unavailable/i.test(text)) return 'Video şu anda erişilemiyor.';
  if (/PLAYLIST_UNAVAILABLE|playlist does not exist|playlist.*private/i.test(text)) return 'Listeye erişilemedi. Paylaşım bağlantısını ve görünürlüğünü kontrol et.';
  if (/zaman asimina|timeout|timed out/i.test(text)) return 'İşlem zaman aşımına uğradı.';
  return text ? 'İşlem tamamlanamadı. Ayrıntıları inceleyebilirsin.' : '';
}
function syncControls() {
  refs.startButton.disabled = !initialized || Boolean(pendingStart) || !refs.urlInput.value.trim();
  refs.stopButton.disabled = !(state.jobs.some(isActive) || state.analysis.active || state.analysis.waiting || pendingStart);
  refs.retryButton.disabled = !state.jobs.some(job => ['failed', 'cancelled'].includes(job.status) && job.retries < (state.settings.maxRetries || 3));
  refs.clearButton.disabled = !state.jobs.length && !state.analysis.active && !state.analysis.waiting;
  refs.formatHint.textContent = 'Yeni öğeler ' + formatLabel(state.selectedFormat) + ' olarak eklenecek.';
}
function renderStats() {
  const s = state.stats;
  const signature = JSON.stringify([s, state.analysis]);
  if (signature === statsSignature) return;
  statsSignature = signature;
  const completed = Number(s.completed || 0), total = Number(s.total || 0);
  const active = Number(s.queued || 0) + Number(s.waiting || 0) + Number(s.downloading || 0);
  const analysing = Number(state.analysis.active || 0) + Number(state.analysis.waiting || 0);
  if (previousActivity && total > 0) {
    if (previousActivity.active > 0 && active === 0 && analysing === 0) refs.lastMessage.textContent = 'İşlemler tamamlandı: ' + completed + ' parça indirildi, ' + Number(s.failed || 0) + ' parça indirilemedi.';
    else if (Number(s.failed || 0) > previousActivity.failed) refs.lastMessage.textContent = 'Bir parça indirilemedi. İndirilemeyen filtresinden ayrıntıları inceleyebilirsin.';
  }
  previousActivity = { active, failed: Number(s.failed || 0) };
  refs.batchLabel.textContent = analysing ? 'Bağlantılar inceleniyor…' : active ? 'İndirmeler sürüyor' : total ? 'İşlemler tamamlandı' : 'İndirmeye hazırsın';
  refs.batchCount.textContent = total ? completed + ' / ' + total + ' indirildi' : '';
  refs.batchProgress.max = Math.max(1, total);
  if (analysing && !total) refs.batchProgress.removeAttribute('value'); else refs.batchProgress.value = completed;
  refs.statsGrid.innerHTML = [['İndirildi', completed], ['İndiriliyor', s.downloading || 0], ['Sırada', (s.queued || 0) + (s.waiting || 0)],
    ['İndirilemedi', s.failed || 0, 'failed-count'], ['Atlandı', s.skipped || 0], ['Durduruldu', s.cancelled || 0]]
    .filter(([, value], index) => index === 0 || value > 0).map(([label, value, cls]) => '<span class="' + (cls || '') + '">' + Number(value) + ' ' + label.toLocaleLowerCase('tr') + '</span>').join('');
  refs.countAll.textContent = total; refs.countActive.textContent = active; refs.countCompleted.textContent = completed; refs.countFailed.textContent = Number(s.failed || 0);
}
function renderMeta() {
  const folder = state.settings.downloadFolder || 'Klasör seçilmedi';
  refs.downloadFolder.textContent = folder; refs.downloadFolder.title = folder;
  refs.settingsFolder.textContent = folder;
  refs.settingsConcurrency.textContent = String(state.settings.concurrency || 3);
  refs.settingsRetries.textContent = String(state.settings.maxRetries || 3);
  refs.ytDlpStatus.textContent = 'yt-dlp: ' + (state.binaries.ytDlp ? 'hazır' : 'eksik');
  refs.ffmpegStatus.textContent = 'ffmpeg: ' + (state.binaries.ffmpeg ? 'hazır' : 'eksik');
  const ready = state.binaries.ytDlp && state.binaries.ffmpeg;
  refs.toolsStatus.textContent = ready ? 'İndirme araçları hazır' : 'İndirme araçları eksik';
  refs.toolsStatus.classList.toggle('fail', !ready);
  const analyses = (state.analysis.active || 0) + (state.analysis.waiting || 0);
  refs.analysisStatus.textContent = analyses ? analyses + ' bağlantı inceleniyor…' : '';
  refs.summaryText.textContent = state.jobs.length ? state.jobs.length + ' parça · MP3 ve video kuyruğu' : 'Bağlantını ekle, indirmelerini buradan takip et.';
  refs.storageWarning.hidden = !state.warnings.length; refs.storageWarning.textContent = state.warnings.join(' ');
  const recovery = state.jobs.filter(job => {
    if (job.failureStage !== 'analysis' || !/PLAYLIST_UNAVAILABLE/.test(job.errorMessage)) return false;
    try { const url = new URL(job.url); return ['www.youtube.com', 'youtube.com', 'music.youtube.com', 'm.youtube.com'].includes(url.hostname) && Boolean(url.searchParams.get('v')); } catch (_) { return false; }
  });
  refs.playlistRecovery.hidden = recovery.length !== 1;
  refs.singleVideoButton.dataset.jobId = recovery.length === 1 ? recovery[0].id : '';
  syncControls();
}
function buildActions(job) {
  const id = escapeHtml(job.id);
  const actions = [];
  if (['failed', 'cancelled'].includes(job.status)) actions.push('<button data-action="retry" data-job-id="' + id + '"'
    + (job.retries >= (state.settings.maxRetries || 3) ? ' disabled title="Deneme sınırına ulaşıldı"' : '') + '>Yeniden dene</button>');
  if (job.status === 'completed' && job.outputPath) {
    actions.push('<button data-action="open-file" data-job-id="' + id + '">Dosyayı aç</button>');
    actions.push('<button data-action="open-folder" data-job-id="' + id + '">Klasör</button>');
  }
  actions.push('<button data-action="details" data-job-id="' + id + '" aria-label="Parça ayrıntıları">⋯</button>');
  return actions.join('');
}
function updateJobRow(row, job, index) {
  const focusAction = row.contains(document.activeElement) ? document.activeElement.dataset.action : null;
  const progress = Math.max(0, Math.min(100, Number(job.progress) || 0));
  const downloading = job.status === 'downloading';
  const measurable = downloading && job.stage === 'download';
  const cls = Object.hasOwn(statusNames, job.status) ? job.status : '';
  const note = job.status === 'failed' ? errorLabel(job) : job.status === 'skipped' ? job.errorMessage : measurable ? [job.speed, job.eta && job.eta !== '-' ? 'Kalan: ' + job.eta : ''].filter(value => value && value !== '-').join(' · ') : '';
  row.innerHTML = '<td class="row-index">' + (index + 1) + '</td><td><span class="job-title" title="' + escapeHtml(job.title || job.url) + '">' + escapeHtml(job.title || job.url || 'Başlık hazırlanıyor…')
    + '</span><span class="job-meta"><span class="format-chip">' + formatLabel(job.format) + '</span><span class="playlist-name">' + escapeHtml(job.playlistTitle || (job.sourceType === 'playlist' ? 'Playlist' : 'Tek video'))
    + (job.playlistIndex == null ? '' : ' · ' + Number(job.playlistIndex) + '. parça') + '</span></span></td><td><div class="status-label ' + cls + '"><span>' + escapeHtml(statusLabel(job)) + '</span>'
    + (measurable ? '<span>%' + Math.round(progress) + '</span>' : '') + '</div>'
    + (downloading ? '<progress class="job-progress" max="100"' + (measurable ? ' value="' + progress + '"' : '') + ' aria-label="' + escapeHtml(statusLabel(job)) + '"></progress>' : '')
    + (note ? '<div class="job-note">' + escapeHtml(note) + '</div>' : '') + '</td><td><div class="row-actions">' + buildActions(job) + '</div></td>';
  if (focusAction) row.querySelector('[data-action="' + focusAction + '"]')?.focus({ preventScroll: true });
}
function filteredJobs() {
  return state.jobs.filter(job => state.filter === 'all' || (state.filter === 'active' ? isActive(job) : job.status === state.filter))
    .filter(job => !state.search || [job.title, job.url, job.playlistTitle].some(value => String(value || '').toLocaleLowerCase('tr').includes(state.search)));
}
function renderJobs() {
  const focused = refs.jobsBody.contains(document.activeElement) ? { id: document.activeElement.dataset.jobId, action: document.activeElement.dataset.action } : null;
  const filtered = filteredJobs();
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  state.page = Math.max(0, Math.min(state.page, pages - 1));
  refs.pageInfo.textContent = (state.page + 1) + ' / ' + pages;
  refs.previousPage.disabled = state.page === 0; refs.nextPage.disabled = state.page >= pages - 1;
  refs.visibleCount.textContent = filtered.length + ' / ' + state.jobs.length + ' parça';
  const offset = state.page * PAGE_SIZE;
  const visible = filtered.slice(offset, offset + PAGE_SIZE);
  const ids = visible.map(job => job.id).join('|');
  const fragment = ids !== displayedIds ? document.createDocumentFragment() : null;
  const wanted = new Set(visible.map(job => job.id));
  for (const [id] of rows) if (!wanted.has(id)) rows.delete(id);
  visible.forEach((job, index) => {
    const signature = JSON.stringify([job, offset + index, state.settings.maxRetries]);
    let cached = rows.get(job.id);
    if (!cached) { const row = document.createElement('tr'); row.dataset.jobId = job.id; cached = { row, signature: '' }; rows.set(job.id, cached); }
    if (cached.signature !== signature) { updateJobRow(cached.row, job, offset + index); cached.signature = signature; }
    if (fragment) fragment.appendChild(cached.row);
  });
  if (!visible.length) refs.jobsBody.innerHTML = '<tr><td colspan="4" class="empty">' + (state.jobs.length ? 'Bu görünümde parça bulunamadı.' : 'İlk bağlantını ekleyerek başlayabilirsin.') + '</td></tr>';
  else if (fragment) refs.jobsBody.replaceChildren(fragment);
  displayedIds = ids;
  if (focused?.id && focused.action) refs.jobsBody.querySelector('button[data-job-id="' + CSS.escape(focused.id) + '"][data-action="' + focused.action + '"]')?.focus({ preventScroll: true });
}
function renderJobDetails() {
  if (!state.detailId) return;
  const job = state.jobMap.get(state.detailId);
  if (!job) { refs.jobDialog.close(); return; }
  refs.jobDialogTitle.textContent = job.title || 'Parça ayrıntıları';
  const entries = [['Durum', statusLabel(job)], ['Biçim', formatLabel(job.format)], ['Bağlantı', job.url], ['Playlist', job.playlistTitle || '—'],
    ['Playlist sırası', job.playlistIndex == null ? '—' : String(job.playlistIndex)], ['Dosya', job.outputPath || 'Henüz hazır değil'],
    ['Deneme', job.retries + ' / ' + (state.settings.maxRetries || 3)], ['Açıklama', errorLabel(job) || '—'], ['Teknik ayrıntı', job.errorMessage || 'Hata yok']];
  refs.jobDetails.replaceChildren(...entries.flatMap(([label, text]) => { const dt = document.createElement('dt'), dd = document.createElement('dd'); dt.textContent = label; dd.textContent = text; return [dt, dd]; }));
}
function render() { renderMeta(); renderStats(); renderJobs(); renderJobDetails(); }
function renderLogs() { refs.logBox.textContent = state.logs.length ? state.logs.slice(-14).join('\n') : 'Hazır'; }
function addLog(line) { state.logs.push(String(line)); if (state.logs.length > MAX_LOGS) state.logs.splice(0, state.logs.length - MAX_LOGS); renderLogs(); }
function applySnapshot(snapshot) {
  if (snapshot.revision < state.revision) return;
  state.revision = snapshot.revision; state.jobMap = new Map((snapshot.jobs || []).map(job => [job.id, job])); state.jobs = [...state.jobMap.values()];
  for (const key of ['stats', 'settings', 'paths', 'binaries', 'analysis']) state[key] = snapshot[key] || {};
  state.warnings = snapshot.warnings || [];
  if (!initialized) { state.selectedFormat = state.settings.preferredFormat === 'audio' ? 'audio' : 'video'; refs.formatInputs.forEach(input => { input.checked = input.value === state.selectedFormat; }); initialized = true; }
  render();
}
function applyDelta(delta) {
  if (delta.revision <= state.revision) return;
  if (state.revision < 0 || delta.revision !== state.revision + 1) {
    if (!resyncing) { resyncing = true; window.appApi.bootstrap().then(applySnapshot).catch(showError).finally(() => { resyncing = false; }); } return;
  }
  for (const id of delta.removed || []) state.jobMap.delete(id);
  for (const job of delta.jobs || []) state.jobMap.set(job.id, job);
  state.jobs = [...state.jobMap.values()]; state.revision = delta.revision; state.stats = delta.stats; state.analysis = delta.analysis; state.warnings = delta.warnings || []; render();
}
function showError(error) { const message = error.message || String(error); refs.lastMessage.textContent = message; refs.actionError.textContent = message; refs.actionError.hidden = false; }
async function action(task) { try { return await task(); } catch (error) { showError(error); } }
async function startDownloads() {
  const text = refs.urlInput.value.trim(); if (!text || pendingStart) return;
  const generation = ++state.uiGeneration, token = Symbol('start'); pendingStart = token; syncControls(); refs.actionError.hidden = true;
  refs.lastMessage.textContent = 'Bağlantılar inceleniyor…';
  try {
    const result = await window.appApi.startDownloads(text, state.selectedFormat);
    if (generation !== state.uiGeneration) return;
    refs.lastMessage.textContent = result.queued + ' parça ' + formatLabel(result.format) + ' olarak kuyruğa alındı; ' + result.skipped + ' atlandı; ' + result.failedInputs + ' analiz hatası; ' + result.cancelled + ' iptal.';
    if (result.failedInputs === 0 && result.cancelled === 0 && refs.urlInput.value.trim() === text) refs.urlInput.value = '';
    state.page = 0; state.filter = 'all'; state.search = ''; refs.searchInput.value = ''; updateFilters(); renderJobs();
  } finally { if (pendingStart === token) pendingStart = null; syncControls(); }
}
function updateFilters() { refs.filterButtons.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.filter === state.filter))); }
function openDialog(dialog, origin = document.activeElement) { dialogOrigin = origin; if (!dialog.open) dialog.showModal(); }
function bindEvents() {
  document.querySelector('.skip-link').addEventListener('click', event => { event.preventDefault(); refs.queueTitle.focus(); });
  refs.urlInput.addEventListener('input', syncControls);
  refs.startButton.addEventListener('click', () => action(startDownloads));
  refs.stopButton.addEventListener('click', () => action(async () => { state.uiGeneration++; await window.appApi.stopDownloads(); refs.lastMessage.textContent = 'İşlemler durduruldu.'; }));
  refs.clearButton.addEventListener('click', () => {
    refs.clearDialogText.textContent = state.jobs.some(isActive) || state.analysis.active || state.analysis.waiting ? 'Çalışan indirmeler ve analizler durdurulacak, listedeki kayıtlar kaldırılacak.' : 'Listedeki kayıtlar kaldırılacak.';
    refs.queueMenu.open = false; openDialog(refs.clearDialog, refs.queueMenu.querySelector('summary'));
  });
  refs.confirmClearButton.addEventListener('click', () => action(async () => {
    refs.confirmClearButton.disabled = true;
    try { state.uiGeneration++; await window.appApi.clearJobs(); refs.clearDialog.close(); refs.lastMessage.textContent = 'Liste temizlendi.'; }
    finally { refs.confirmClearButton.disabled = false; }
  }));
  refs.retryButton.addEventListener('click', () => action(async () => { const result = await window.appApi.retryFailed(); refs.queueMenu.open = false; refs.lastMessage.textContent = result.retried + ' parça yeniden denemeye alındı.'; }));
  refs.openFolderButton.addEventListener('click', () => action(async () => { const error = await window.appApi.openDownloadsFolder(); if (error) throw new Error(error); }));
  for (const button of [refs.pickFolderButton, refs.settingsPickFolderButton]) button.addEventListener('click', () => action(() => window.appApi.pickDownloadFolder()));
  refs.settingsButton.addEventListener('click', () => openDialog(refs.settingsDialog));
  refs.formatInputs.forEach(input => input.addEventListener('change', () => action(async () => {
    const previous = state.selectedFormat, generation = ++preferenceGeneration;
    state.selectedFormat = input.value; syncControls();
    try { await window.appApi.setPreferences({ preferredFormat: input.value }); }
    catch (error) { if (generation === preferenceGeneration) { state.selectedFormat = previous; refs.formatInputs.forEach(item => { item.checked = item.value === previous; }); syncControls(); } throw error; }
  })));
  refs.filterButtons.forEach(button => button.addEventListener('click', () => { state.filter = button.dataset.filter; state.page = 0; updateFilters(); renderJobs(); }));
  refs.searchInput.addEventListener('input', () => { clearTimeout(searchTimer); searchTimer = setTimeout(() => { state.search = refs.searchInput.value.trim().toLocaleLowerCase('tr'); state.page = 0; renderJobs(); }, 100); });
  refs.previousPage.addEventListener('click', () => { state.page--; renderJobs(); }); refs.nextPage.addEventListener('click', () => { state.page++; renderJobs(); });
  refs.jobsBody.addEventListener('click', event => {
    const button = event.target.closest('button[data-action]'); if (!button || button.disabled) return;
    action(async () => { const id = button.dataset.jobId;
      if (button.dataset.action === 'details') { state.detailId = id; renderJobDetails(); openDialog(refs.jobDialog, button); return; }
      if (button.dataset.action === 'retry') return window.appApi.retryFailed(id);
      const error = await (button.dataset.action === 'open-file' ? window.appApi.openJobFile(id) : window.appApi.openJobFolder(id)); if (error) throw new Error(error);
    });
  });
  refs.singleVideoButton.addEventListener('click', () => action(async () => {
    const job = state.jobMap.get(refs.singleVideoButton.dataset.jobId); if (!job) return;
    const url = new URL(job.url); if (!url.searchParams.get('v') || !['www.youtube.com', 'youtube.com', 'music.youtube.com', 'm.youtube.com'].includes(url.hostname)) throw new Error('Bu bağlantıda tek video adresi bulunamadı.');
    refs.urlInput.value = 'https://www.youtube.com/watch?v=' + encodeURIComponent(url.searchParams.get('v'));
    syncControls(); await startDownloads();
  }));
  document.querySelectorAll('[data-close-dialog]').forEach(button => button.addEventListener('click', () => refs[button.dataset.closeDialog].close()));
  for (const dialog of [refs.jobDialog, refs.clearDialog, refs.settingsDialog]) dialog.addEventListener('close', () => {
    if (dialog === refs.jobDialog) state.detailId = null;
    let target = dialogOrigin;
    if (target?.dataset.jobId) target = refs.jobsBody.querySelector('button[data-job-id="' + CSS.escape(target.dataset.jobId) + '"][data-action="' + target.dataset.action + '"]');
    if (target?.isConnected && target.getClientRects().length) target.focus({ preventScroll: true }); else refs.queueTitle.focus({ preventScroll: true });
  });
  window.appApi.onSnapshot(applySnapshot); window.appApi.onDelta(applyDelta); window.appApi.onLog(addLog);
}
window.addEventListener('DOMContentLoaded', async () => {
  for (const id of ['urlInput','startButton','stopButton','retryButton','clearButton','openFolderButton','pickFolderButton','statsGrid','jobsBody','downloadFolder','ytDlpStatus','ffmpegStatus','logBox','lastMessage','summaryText','previousPage','nextPage','pageInfo','storageWarning','actionError','playlistRecovery','singleVideoButton','toolsStatus','analysisStatus','formatHint','countAll','countActive','countCompleted','countFailed','batchLabel','batchCount','batchProgress','visibleCount','queueMenu','queueTitle','searchInput','jobDialog','jobDialogTitle','jobDetails','clearDialog','clearDialogText','confirmClearButton','settingsButton','settingsDialog','settingsFolder','settingsConcurrency','settingsRetries','settingsPickFolderButton']) refs[id] = document.getElementById(id);
  refs.formatInputs = [...document.querySelectorAll('input[name="downloadFormat"]')]; refs.filterButtons = [...document.querySelectorAll('[data-filter]')];
  bindEvents();
  try { applySnapshot(await window.appApi.bootstrap()); renderLogs(); document.documentElement.dataset.ready = 'true'; }
  catch (error) { showError(error); throw error; }
});
