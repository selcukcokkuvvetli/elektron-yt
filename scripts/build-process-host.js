const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

function buildProcessHost() {
  if (process.platform !== 'win32') return;
  const root = path.resolve(__dirname, '..');
  const compiler = ['Framework64', 'Framework'].map(folder => path.join(process.env.SystemRoot || 'C:\\Windows',
    'Microsoft.NET', folder, 'v4.0.30319', 'csc.exe')).find(file => fs.existsSync(file));
  if (!compiler) throw new Error('Windows .NET Framework C# compiler not found.');
  const destination = path.join(root, 'app', 'bin', 'process-host.exe');
  const temporary = path.join(root, 'app', 'bin', 'process-host-' + process.pid + '.tmp.exe');
  try {
    execFileSync(compiler, ['/nologo', '/optimize+', '/platform:x64', '/target:exe', '/out:' + temporary,
      path.join(root, 'app', 'main', 'ProcessHost.cs')], { windowsHide: true, stdio: 'inherit' });
    fs.renameSync(temporary, destination);
  } finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
  console.log('Built Windows process host.');
}
if (require.main === module) {
  try { buildProcessHost(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = buildProcessHost;
