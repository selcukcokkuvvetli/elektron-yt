const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
const { killProcessTree } = require('../app/main/process-utils');

async function hashFile(file, algorithm = 'sha256', encoding = 'hex') {
  const hash = crypto.createHash(algorithm);
  for await (const chunk of fs.createReadStream(file)) hash.update(chunk);
  return hash.digest(encoding);
}
function contained(root, relative) {
  const target = path.resolve(root, relative);
  const relation = path.relative(path.resolve(root), target);
  if (!relation || relation.startsWith('..') || path.isAbsolute(relation)) throw new Error('Unsafe relative path: ' + relative);
  return target;
}
async function run(executable, args, options = {}) {
  const child = spawn(executable, args, { windowsHide: true, detached: process.platform !== 'win32', ...options });
  let stdout = '', stderr = '';
  if (child.stdout) child.stdout.on('data', chunk => { stdout = (stdout + chunk).slice(-65536); });
  if (child.stderr) child.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-65536); });
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; killProcessTree(child); }, options.timeoutMs || 600000);
  try {
    return await new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('close', code => code === 0 && !timedOut ? resolve(stdout)
        : reject(new Error(timedOut ? 'Process timeout' : stderr || ('Process exited: ' + code))));
    });
  } finally { clearTimeout(timer); }
}

module.exports = { hashFile, contained, run };
