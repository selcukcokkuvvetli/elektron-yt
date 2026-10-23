// Runs only in the hidden, isolated Electron smoke process.
module.exports = String.raw`(async () => {
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  const wait = async (condition, label) => {
    const end = performance.now() + 10000;
    while (!condition()) {
      if (performance.now() > end) throw new Error('Smoke timeout: ' + label);
      await new Promise(resolve => setTimeout(resolve, 10));
    }
  };
  await wait(() => document.documentElement.dataset.ready === 'true', 'renderer bootstrap');
  assert(typeof window.appApi.startDownloads === 'function', 'preload bridge missing');
  assert(typeof window.require === 'undefined' && typeof window.process === 'undefined', 'Node leaked into renderer');
  assert(document.querySelector('meta[http-equiv="Content-Security-Policy"]'), 'CSP missing');
  const snapshot = await window.appApi.bootstrap();
  const count = snapshot.jobs.length;
  rows.clear();
  displayedIds = '';
  refs.jobsBody.replaceChildren();
  const start = performance.now();
  applySnapshot(snapshot);
  const renderMs = performance.now() - start;
  const warmStart = performance.now();
  applySnapshot(snapshot);
  const warmRenderMs = performance.now() - warmStart;
  assert(document.querySelectorAll('#jobsBody tr[data-job-id]').length <= PAGE_SIZE, 'unbounded DOM');
  if (count) {
    const row = refs.jobsBody.firstElementChild;
    const first = snapshot.jobs[0];
    const changed = { ...first, title: '<img src=x onerror="window.__unsafe=true">', progress: 42 };
    applyDelta({ revision: state.revision + 1, jobs: [changed], removed: [], stats: snapshot.stats, analysis: {}, warnings: [] });
    assert(refs.jobsBody.firstElementChild === row, 'unchanged row structure replaced');
    assert(!refs.jobsBody.querySelector('img') && !window.__unsafe, 'unsafe title rendering');
    if (count > PAGE_SIZE) {
      refs.nextPage.click();
      assert(refs.jobsBody.firstElementChild.firstElementChild.textContent === String(PAGE_SIZE + 1), 'pagination broken');
      refs.previousPage.click();
    }
  }
  for (let index = 0; index < 1000; index++) addLog('fixture log ' + index);
  assert(state.logs.length === MAX_LOGS, 'unbounded log buffer');
  let invalidPayloadRejected = false;
  try { await window.appApi.startDownloads({}, 'video'); } catch (_) { invalidPayloadRejected = true; }
  assert(invalidPayloadRejected, 'IPC payload type not checked');
  const analysisUrl = __ANALYSIS_URL__;
  const uiSnapshot = { ...snapshot, revision: state.revision, jobs: Array.from({ length: 44 }, (_, index) => ({
    id: 'ui_' + index, url: 'https://youtu.be/ui-' + index, title: 'Parça ' + index, format: 'audio',
    status: index === 26 ? 'failed' : 'completed', stage: 'download', retries: 1, playlistIndex: index + 1,
    errorMessage: index === 26 ? 'ERROR: Video unavailable. It was removed following a copyright removal request' : ''
  })), stats: { total: 44, completed: 43, failed: 1, audio: 44 } };
  applySnapshot(uiSnapshot);
  assert(refs.batchCount.textContent === '43 / 44 indirildi', 'mixed result summary');
  refs.filterButtons.find(button => button.dataset.filter === 'failed').click();
  assert(refs.jobsBody.querySelectorAll('tr[data-job-id]').length === 1, 'failed filter');
  refs.jobsBody.querySelector('[data-action="details"]').click();
  assert(refs.jobDialog.open && refs.jobDetails.textContent.includes('kaldırılmış'), 'job detail explanation');
  refs.jobDialog.querySelector('[data-close-dialog]').click();
  refs.filterButtons.find(button => button.dataset.filter === 'all').click();
  refs.searchInput.value = 'Parça 43'; refs.searchInput.dispatchEvent(new Event('input'));
  await wait(() => refs.jobsBody.querySelectorAll('tr[data-job-id]').length === 1, 'title search');
  refs.searchInput.value = ''; refs.searchInput.dispatchEvent(new Event('input'));
  await wait(() => refs.jobsBody.querySelectorAll('tr[data-job-id]').length === 44, 'search reset');
  refs.clearButton.click();
  assert(refs.clearDialog.open, 'clear requires confirmation');
  refs.clearDialog.querySelector('[data-close-dialog]').click();
  assert(state.jobs.length === 44, 'cancelled clear keeps jobs');
  state.revision = -1;
  applySnapshot(await window.appApi.bootstrap());
  const previousFormat = state.selectedFormat;
  const nextFormat = previousFormat === 'audio' ? 'video' : 'audio';
  refs.formatInputs.find(input => input.value === nextFormat).click();
  await wait(() => state.settings.preferredFormat === nextFormat, 'format preference persisted');
  assert(state.jobs.every(job => job.format === 'video'), 'existing jobs changed format');
  refs.formatInputs.find(input => input.value === previousFormat).click();
  await wait(() => state.settings.preferredFormat === previousFormat, 'format preference restored');
  if (analysisUrl) {
    const pending = window.appApi.startDownloads(analysisUrl, 'video');
    const responseStart = performance.now();
    const analysing = await window.appApi.bootstrap();
    assert(analysing.analysis.active > 0 && performance.now() - responseStart < 1000, 'IPC blocked by analysis');
    await wait(() => !refs.stopButton.disabled, 'stop available during analysis');
    refs.stopButton.click();
    assert((await pending).cancelled === 1, 'stop button cancels analysis');
    await wait(() => refs.lastMessage.textContent.includes('durduruldu'), 'stop button');
  }
  refs.urlInput.value = '--exec=unexpected';
  refs.urlInput.dispatchEvent(new Event('input'));
  refs.startButton.click();
  await wait(() => !refs.startButton.disabled, 'start analysis');
  await wait(() => state.jobs.some(job => job.failureStage === 'analysis'), 'analysis error rendering');
  assert(refs.urlInput.value === '--exec=unexpected', 'failed input must remain editable');
  refs.retryButton.click();
  await wait(() => refs.lastMessage.textContent.includes('yeniden denemeye'), 'retry button');
  refs.clearButton.click();
  refs.confirmClearButton.click();
  await wait(() => state.jobs.length === 0 && refs.lastMessage.textContent === 'Liste temizlendi.', 'final cleanup');
  const turnStart = performance.now();
  await new Promise(resolve => setTimeout(resolve, 0));
  return { jobs: count, renderMs, warmRenderMs, eventLoopMs: performance.now() - turnStart,
    visibleRowsLimit: PAGE_SIZE, logLimit: MAX_LOGS, bootstrap: true, buttons: true, ipcValidation: true,
    responsiveAnalysis: Boolean(analysisUrl), filters: true, details: true, mixedResult: true, clearConfirmation: true };
})()`;
