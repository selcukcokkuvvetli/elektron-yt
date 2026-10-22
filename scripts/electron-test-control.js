const net = require('net');
const assert = require('assert');

async function debuggerPort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}
function debuggerArgs(port) {
  return ['--remote-debugging-port=' + port, '--remote-debugging-address=127.0.0.1', '--remote-allow-origins=*'];
}
async function closeRenderer(port) {
  let page;
  const end = Date.now() + 20000;
  while (!page && Date.now() < end) {
    try {
      const response = await fetch('http://127.0.0.1:' + port + '/json/list', { signal: AbortSignal.timeout(3000) });
      if (response.ok) page = (await response.json()).find(target => target.type === 'page' && target.url.startsWith('file:'));
    } catch (_) {}
    if (!page) await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.ok(page, 'Owned Electron renderer debugger was not ready');
  const url = new URL(page.webSocketDebuggerUrl);
  assert.strictEqual(url.hostname, '127.0.0.1');
  assert.strictEqual(url.port, String(port));
  await new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    let sent = false;
    let settled = false;
    const timer = setTimeout(() => finish(new Error('Renderer close command timed out')), 10000);
    function finish(error) {
      if (settled) return;
      settled = true;
      clearTimeout(timer); socket.close(); error ? reject(error) : resolve();
    }
    socket.addEventListener('open', () => {
      sent = true;
      socket.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression: 'window.close()', returnByValue: true } }));
    });
    socket.addEventListener('message', event => {
      const response = JSON.parse(event.data);
      if (response.id === 1) finish(response.error || response.result?.exceptionDetails
        ? new Error('Renderer rejected window.close(): ' + event.data) : null);
    });
    socket.addEventListener('close', () => finish(sent ? null : new Error('Debugger closed before command dispatch')));
    // Closing the window may tear down Chromium's socket before a close frame.
    // The caller still requires the actual app process to exit successfully.
    socket.addEventListener('error', () => finish(sent ? null : new Error('Renderer debugger connection failed')));
  });
}
module.exports = { debuggerPort, debuggerArgs, closeRenderer };
