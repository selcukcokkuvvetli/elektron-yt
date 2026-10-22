const assert = require('assert');
const path = require('path');
const { spawn } = require('child_process');
const { killProcessTree } = require('../app/main/process-utils');
const { waitFor } = require('./test-support');

async function check(naturalExit) {
  const argument = 'Turkce-İ "quoted" trailing\\';
  const source = "const c=require('child_process').spawn(process.execPath,['-e','setInterval(()=>{},1000)'],"
    + "{stdio:'ignore',detached:true,windowsHide:true});c.unref();console.log(JSON.stringify({pid:c.pid,arg:process.argv[1]}));"
    + (naturalExit ? '' : 'setInterval(()=>{},1000);');
  const child = spawn(path.resolve(__dirname, '..', 'app', 'bin', 'process-host.exe'),
    [process.execPath, '-e', source, argument], { windowsHide: true });
  child.managedTree = true;
  let stdout = '', reported;
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', chunk => {
    stdout += chunk;
    if (stdout.includes('\n')) reported = JSON.parse(stdout.trim());
  });
  const closed = new Promise((resolve, reject) => { child.once('error', reject); child.once('close', resolve); });
  try {
    await waitFor(() => reported, 'native host stdout', 10000);
    assert.strictEqual(reported.arg, argument);
    if (!naturalExit) killProcessTree(child);
    const code = await closed;
    if (naturalExit) assert.strictEqual(code, 0);
    await waitFor(() => {
      try { process.kill(reported.pid, 0); return false; } catch (_) { return true; }
    }, 'grandchild killed with job', 5000);
  } finally { killProcessTree(child); await closed; }
}
async function main() {
  if (process.platform !== 'win32') return;
  await check(false);
  await check(true);
  console.log('PASS T04/T07 Windows job closes detached grandchildren on cancellation and normal exit; Unicode/quotes preserved');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
