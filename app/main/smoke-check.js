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
  if (analysisUrl) {
    const pending = window.appApi.startDownloads(analysisUrl, 'video');
    const responseStart = performance.now();
    const analysing = await window.appApi.bootstrap();
    assert(analysing.analysis.active > 0 && performance.now() - responseStart < 1000, 'IPC blocked by analysis');
    await window.appApi.stopDownloads();
    assert((await pending).cancelled === 1, 'active analysis not cancelled');
  }
  refs.stopButton.click();
  await wait(() => refs.lastMessage.textContent.includes('durduruldu'), 'stop button');
  refs.clearButton.click();
  await wait(() => state.jobs.length === 0 && refs.lastMessage.textContent === 'Liste temizlendi.', 'clear button');
  refs.urlInput.value = '--exec=unexpected';
  refs.startButton.click();
  await wait(() => !refs.startButton.disabled, 'start analysis');
  await wait(() => state.jobs.some(job => job.failureStage === 'analysis'), 'analysis error rendering');
  refs.retryButton.click();
  await wait(() => refs.lastMessage.textContent.includes('yeniden denemeye'), 'retry button');
  refs.clearButton.click();
  await wait(() => state.jobs.length === 0 && refs.lastMessage.textContent === 'Liste temizlendi.', 'final cleanup');
  const turnStart = performance.now();
  await new Promise(resolve => setTimeout(resolve, 0));
  return { jobs: count, renderMs, warmRenderMs, eventLoopMs: performance.now() - turnStart,
    visibleRowsLimit: PAGE_SIZE, logLimit: MAX_LOGS, bootstrap: true, buttons: true, ipcValidation: true,
    responsiveAnalysis: Boolean(analysisUrl) };
})()`;
