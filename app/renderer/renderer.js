const state = {
  jobs: [],
  stats: {},
  settings: {},
  paths: {},
  binaries: {},
  logs: [],
  selectedFormat: 'video',
  previousJobSignatures: new Map()
};

const refs = {};

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatCount(value) {
  return Number(value || 0).toString();
}

function formatLabel(format) {
  return format === 'audio' ? 'MP3' : 'Video';
}

function buildJobSignature(job) {
  return [
    job.id,
    job.format,
    job.title,
    job.status,
    job.progress,
    job.speed,
    job.eta,
    job.errorMessage,
    job.outputPath
  ].join('|');
}

function renderStats() {
  const items = [
    ['Toplam', state.stats.total],
    ['Queued', state.stats.queued],
    ['Downloading', state.stats.downloading],
    ['Completed', state.stats.completed],
    ['Failed', state.stats.failed],
    ['Video', state.stats.video],
    ['MP3', state.stats.audio]
  ];

  refs.statsGrid.innerHTML = items.map(function map(item) {
    return '<article class="stat-card">'
      + '<span class="meta-label">' + escapeHtml(item[0]) + '</span>'
      + '<strong>' + escapeHtml(formatCount(item[1])) + '</strong>'
      + '</article>';
  }).join('');
}

function renderMeta() {
  refs.downloadFolder.textContent = state.settings.downloadFolder || '-';
  refs.ytDlpStatus.textContent = state.binaries.ytDlp ? 'yt-dlp hazir' : 'yt-dlp eksik';
  refs.ffmpegStatus.textContent = state.binaries.ffmpeg ? 'ffmpeg hazir' : 'ffmpeg eksik';
  refs.ytDlpStatus.className = 'pill ' + (state.binaries.ytDlp ? 'ok' : 'fail');
  refs.ffmpegStatus.className = 'pill ' + (state.binaries.ffmpeg ? 'ok' : 'fail');
  refs.summaryText.textContent = state.jobs.length + ' job yuklu';
}

function buildActions(job) {
  const actions = [];

  if (job.status === 'failed' || job.status === 'cancelled') {
    actions.push('<button data-action="retry" data-job-id="' + escapeHtml(job.id) + '">Retry</button>');
  }

  if (job.outputPath) {
    actions.push('<button data-action="open-file" data-job-id="' + escapeHtml(job.id) + '">Open File</button>');
    actions.push('<button data-action="open-folder" data-job-id="' + escapeHtml(job.id) + '">Open Folder</button>');
  }

  return actions.join('') || '-';
}

function createJobRow(job, index) {
  const row = document.createElement('tr');
  row.setAttribute('data-job-id', job.id);
  updateJobRow(row, job, index);
  return row;
}

function updateJobRow(row, job, index) {
  row.innerHTML = '<td>' + (index + 1) + '</td>'
    + '<td><span class="format-chip">' + escapeHtml(formatLabel(job.format)) + '</span></td>'
    + '<td>' + escapeHtml(job.title || '-') + '</td>'
    + '<td class="mono">' + escapeHtml(job.url) + '</td>'
    + '<td><span class="status ' + escapeHtml(job.status) + '">' + escapeHtml(job.status) + '</span></td>'
    + '<td>' + escapeHtml(String(Math.round(job.progress || 0))) + '%</td>'
    + '<td>' + escapeHtml(job.speed || '-') + '</td>'
    + '<td>' + escapeHtml(job.eta || '-') + '</td>'
    + '<td class="error">' + escapeHtml(job.errorMessage || '-') + '</td>'
    + '<td><div class="row-actions">' + buildActions(job) + '</div></td>';
}

function renderJobs() {
  if (!state.jobs.length) {
    refs.jobsBody.innerHTML = '<tr><td colspan="10" class="empty">Henuz job yok.</td></tr>';
    state.previousJobSignatures.clear();
    return;
  }

  const fragment = document.createDocumentFragment();
  const seenIds = new Set();

  state.jobs.forEach(function each(job, index) {
    const signature = buildJobSignature(job);
    const existingRow = refs.jobsBody.querySelector('tr[data-job-id="' + job.id + '"]');
    let row = existingRow;

    if (!row) {
      row = createJobRow(job, index);
    } else if (state.previousJobSignatures.get(job.id) !== signature) {
      updateJobRow(row, job, index);
    } else if (row.firstElementChild && row.firstElementChild.textContent !== String(index + 1)) {
      updateJobRow(row, job, index);
    }

    state.previousJobSignatures.set(job.id, signature);
    seenIds.add(job.id);
    fragment.appendChild(row);
  });

  Array.from(refs.jobsBody.querySelectorAll('tr[data-job-id]')).forEach(function eachRow(row) {
    const jobId = row.getAttribute('data-job-id');
    if (!seenIds.has(jobId)) {
      state.previousJobSignatures.delete(jobId);
    }
  });

  refs.jobsBody.innerHTML = '';
  refs.jobsBody.appendChild(fragment);
}

function renderLogs() {
  refs.logBox.textContent = state.logs.length ? state.logs.slice(-14).join('\n') : 'Hazir';
}

function applySnapshot(snapshot) {
  state.jobs = snapshot.jobs || [];
  state.stats = snapshot.stats || {};
  state.settings = snapshot.settings || {};
  state.paths = snapshot.paths || {};
  state.binaries = snapshot.binaries || {};
  renderMeta();
  renderStats();
  renderJobs();
}

function getSelectedFormat() {
  const selected = document.querySelector('input[name="downloadFormat"]:checked');
  return selected ? selected.value : 'video';
}

async function startDownloads() {
  const text = refs.urlInput.value.trim();
  if (!text) {
    refs.lastMessage.textContent = 'Baslatmak icin en az bir link girin.';
    return;
  }

  const result = await window.appApi.startDownloads(text, state.selectedFormat);
  refs.lastMessage.textContent = result.queued + ' link ' + formatLabel(result.format) + ' olarak kuyruga alindi, '
    + result.skipped + ' link atlandi.';
  refs.urlInput.value = '';
}

async function bootstrap() {
  const snapshot = await window.appApi.bootstrap();
  applySnapshot(snapshot);
  renderLogs();
}

function bindEvents() {
  refs.startButton.addEventListener('click', function onStart() {
    startDownloads().catch(function onError(error) {
      refs.lastMessage.textContent = error.message;
    });
  });

  refs.stopButton.addEventListener('click', function onStop() {
    window.appApi.stopDownloads();
  });

  refs.retryButton.addEventListener('click', function onRetry() {
    window.appApi.retryFailed();
  });

  refs.clearButton.addEventListener('click', function onClear() {
    window.appApi.clearJobs();
  });

  refs.openFolderButton.addEventListener('click', function onOpenFolder() {
    window.appApi.openDownloadsFolder();
  });

  refs.pickFolderButton.addEventListener('click', function onPickFolder() {
    window.appApi.pickDownloadFolder();
  });

  refs.formatInputs.forEach(function each(input) {
    input.addEventListener('change', function onChange() {
      state.selectedFormat = getSelectedFormat();
      refs.lastMessage.textContent = 'Aktif format: ' + formatLabel(state.selectedFormat);
    });
  });

  refs.jobsBody.addEventListener('click', function onRowAction(event) {
    const button = event.target.closest('button[data-action]');
    if (!button) {
      return;
    }

    const jobId = button.getAttribute('data-job-id');
    const action = button.getAttribute('data-action');

    if (action === 'retry') {
      window.appApi.retryFailed(jobId);
      return;
    }

    if (action === 'open-file') {
      window.appApi.openJobFile(jobId);
      return;
    }

    if (action === 'open-folder') {
      window.appApi.openJobFolder(jobId);
    }
  });

  window.appApi.onSnapshot(function onSnapshot(snapshot) {
    applySnapshot(snapshot);
  });

  window.appApi.onLog(function onLog(line) {
    state.logs.push(line);
    refs.lastMessage.textContent = line;
    renderLogs();
  });
}

window.addEventListener('DOMContentLoaded', function onReady() {
  refs.urlInput = document.getElementById('urlInput');
  refs.startButton = document.getElementById('startButton');
  refs.stopButton = document.getElementById('stopButton');
  refs.retryButton = document.getElementById('retryButton');
  refs.clearButton = document.getElementById('clearButton');
  refs.openFolderButton = document.getElementById('openFolderButton');
  refs.pickFolderButton = document.getElementById('pickFolderButton');
  refs.statsGrid = document.getElementById('statsGrid');
  refs.jobsBody = document.getElementById('jobsBody');
  refs.downloadFolder = document.getElementById('downloadFolder');
  refs.ytDlpStatus = document.getElementById('ytDlpStatus');
  refs.ffmpegStatus = document.getElementById('ffmpegStatus');
  refs.logBox = document.getElementById('logBox');
  refs.lastMessage = document.getElementById('lastMessage');
  refs.summaryText = document.getElementById('summaryText');
  refs.formatInputs = Array.from(document.querySelectorAll('input[name="downloadFormat"]'));
  state.selectedFormat = getSelectedFormat();

  bindEvents();
  bootstrap().catch(function onError(error) {
    refs.lastMessage.textContent = error.message;
  });
});
