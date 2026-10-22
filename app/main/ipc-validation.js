const fs = require('fs');
const path = require('path');
const { fileURLToPath } = require('url');

function documentPath(value) {
  const url = new URL(value);
  if (url.protocol !== 'file:' || url.search || url.hash) throw new Error('Gecersiz belge kaynagi.');
  // Chromium and Node may spell a portable TEMP path differently (8.3 aliases, escapes, case).
  const resolved = fs.realpathSync(fileURLToPath(url));
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

function assertSender(event, window, rendererUrl) {
  const frame = event.senderFrame;
  const mainFrame = window && !window.isDestroyed() && window.webContents.mainFrame;
  if (!mainFrame || event.sender !== window.webContents || !frame
    || frame.processId !== mainFrame.processId || frame.routingId !== mainFrame.routingId
    || documentPath(frame.url) !== documentPath(rendererUrl)) {
    throw new Error('Bu IPC cagrisi icin yetkisiz kaynak.');
  }
}

function assertJobId(id, optional = false) {
  if (optional && (id === undefined || id === null)) return;
  if (typeof id !== 'string' || !/^[\w-]{1,128}$/.test(id)) throw new Error('Gecersiz is kimligi.');
}

function safeOutput(job, defaultFolder) {
  if (!job || job.status !== 'completed' || !job.outputPath) return null;
  if (!/\.(mp4|mkv|webm|mp3|m4a|opus|ogg|wav|flac|aac|mov|avi)$/i.test(job.outputPath)) return null;
  try {
    const root = fs.realpathSync(job.downloadRoot || defaultFolder);
    const file = fs.realpathSync(job.outputPath);
    const relative = path.relative(root, file);
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative) || !fs.statSync(file).isFile()) return null;
    return file;
  } catch (_) { return null; }
}

module.exports = { assertSender, assertJobId, safeOutput, documentPath };
