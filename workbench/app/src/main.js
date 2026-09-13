// Workbench Electron shell (v0).
// Spawns the Python sidecar, reads PORT= from its first stdout line, opens a
// window pointed at the built web UI (served by the sidecar) or the Vite dev
// server, and kills the sidecar on exit. See docs/workbench_v0_plan.md section 3.

const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const { spawn } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const isWin = process.platform === 'win32';
const BACKEND_DIR = path.join(__dirname, '..', '..', 'backend');
const TOKEN = crypto.randomBytes(16).toString('hex');

// Dev-mode attach: when WORKBENCH_BACKEND_URL is set (npm run dev), the shell
// does NOT spawn a sidecar; it attaches to the shared one started by the dev
// script (fixed port + known token, also reachable from a plain browser tab).
const ATTACH_URL = process.env.WORKBENCH_BACKEND_URL || null;
const ACTIVE_TOKEN = ATTACH_URL ? (process.env.WORKBENCH_TOKEN || TOKEN) : TOKEN;

// Append shell logs to a file (stdout may be lost when Electron re-execs).
const logStream = fs.createWriteStream(path.join(__dirname, '..', 'workbench-shell.log'), { flags: 'a' });
for (const m of ['log', 'error', 'warn']) {
  const orig = console[m].bind(console);
  console[m] = (...a) => {
    try { logStream.write(a.map((x) => (typeof x === 'string' ? x : String(x))).join(' ') + '\n'); } catch (_) {}
    orig(...a);
  };
}

let win = null;
let sidecar = null;
let baseUrl = null;
let wslDistro = null; // set when the sidecar runs inside WSL

function uncToLinux(p) {
  const m = String(p).match(/^\\\\wsl\.(?:localhost|bash)\\([^\\]+)\\(.*)$/i);
  if (!m) return null;
  return { distro: m[1], path: '/' + m[2].replace(/\\/g, '/') };
}

// WSL runs the args after `--` by joining them with spaces and executing the
// result through the distro's default shell (zsh on this machine), so
// multi-word commands get mangled. Instead we write a small entry script into
// the backend dir and pass it as a single token; the token travels as $1.
// Windows env vars are NOT forwarded into WSL, hence the --token argument.
// v0 limitation: paths must not contain spaces.
function wslScripts() {
  const unc = uncToLinux(BACKEND_DIR);
  const pkgUnc = path.join(BACKEND_DIR, 'workbench_backend');
  const pkgPath = unc.path + '/workbench_backend';
  // .venv/bin/python is a symlink whose target lives outside the share, so
  // Windows cannot stat it over the WSL mount; probe pyvenv.cfg (a real file).
  const useVenv = fs.existsSync(path.join(BACKEND_DIR, '.venv', 'pyvenv.cfg'));
  const py = useVenv ? './.venv/bin/python' : 'python3';
  const script = [
    '#!/bin/bash',
    `cd ${unc.path}`,
    'export PYTHONUNBUFFERED=1',
    `exec ${py} -m workbench_backend serve --token "$1"`,
    '',
  ].join('\n');
  fs.writeFileSync(path.join(pkgUnc, '_sidecar_entry.sh'), script);
  // Kill script: the bracket trick keeps pkill from matching its own shell;
  // it must live in a file because zsh glob-expands [d] before running pkill.
  const kill = "#!/bin/bash" + "\npkill -f 'workbench_backen[d]' || true\n";
  fs.writeFileSync(path.join(pkgUnc, '_sidecar_kill.sh'), kill);
  return { entry: pkgPath + '/_sidecar_entry.sh', kill: pkgPath + '/_sidecar_kill.sh' }; // linux forms for bash
}

function sidecarCommand() {
  // 1) local venv (Windows or Linux) wins
  const venvWin = path.join(BACKEND_DIR, '.venv', 'Scripts', 'python.exe');
  if (fs.existsSync(venvWin)) {
    return { cmd: venvWin, args: ['-m', 'workbench_backend', 'serve', '--token', TOKEN], cwd: BACKEND_DIR };
  }
  // 1b) POSIX-layout venv (running natively on Linux/WSL/macOS)
  const venvPosix = path.join(BACKEND_DIR, '.venv', 'bin', 'python');
  if (!isWin && fs.existsSync(venvPosix)) {
    return { cmd: venvPosix, args: ['-m', 'workbench_backend', 'serve', '--token', TOKEN], cwd: BACKEND_DIR };
  }
  // 2) repo lives in WSL -> run the sidecar inside that distro; Windows can
  //    still reach it via WSL2 localhost forwarding (127.0.0.1)
  const unc = uncToLinux(BACKEND_DIR);
  if (unc) {
    const scripts = wslScripts();
    wslDistro = unc.distro;
    return { cmd: 'wsl.exe', args: ['-d', unc.distro, '--', 'bash', scripts.entry, TOKEN], cwd: null };
  }
  // 3) plain python on PATH
  const py = isWin ? 'python' : 'python3';
  return { cmd: py, args: ['-m', 'workbench_backend', 'serve', '--token', TOKEN], cwd: BACKEND_DIR };
}

function startSidecar() {
  if (ATTACH_URL) {
    console.log('attaching to existing backend:', ATTACH_URL);
    baseUrl = ATTACH_URL;
    createWindow();
    return;
  }
  const { cmd, args, cwd } = sidecarCommand();
  console.log('spawning sidecar:', cmd, args.join(' ').replace(TOKEN, '<token>'));
  sidecar = spawn(cmd, args, {
    cwd: cwd || undefined,
    env: { ...process.env },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  let buf = '';
  sidecar.stdout.on('data', (chunk) => {
    buf += chunk.toString();
    let idx;
    while ((idx = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, idx).trim();
      buf = buf.slice(idx + 1);
      console.log('sidecar:', line.replace(TOKEN, '<token>'));
      const m = line.match(/^PORT=(\d+)$/);
      if (m && !baseUrl) {
        baseUrl = `http://127.0.0.1:${m[1]}`;
        createWindow();
      }
    }
  });
  sidecar.on('error', (err) => {
    console.error('sidecar failed to start:', err.message);
    app.quit();
  });
  sidecar.on('exit', (code) => {
    console.error(`sidecar exited with code ${code}`);
    if (!app.isQuitting) app.quit();
  });
}

function stopSidecar() {
  if (!sidecar) return;
  try { sidecar.kill(); } catch (_) {}
  // When the sidecar runs inside WSL, killing wsl.exe may leave python behind.
  // The kill must run from a script file: zsh glob-expands bracket patterns in
  // inline args before pkill ever sees them (see wslScripts note).
  if (wslDistro) {
    const unc = uncToLinux(BACKEND_DIR);
    spawn('wsl.exe', ['-d', wslDistro, '--', 'bash', unc.path + '/workbench_backend/_sidecar_kill.sh']);
  }
}

function createWindow() {
  win = new BrowserWindow({
    width: 1400,
    height: 900,
    title: 'Workbench',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  const devUrl = process.env.WORKBENCH_WEB_URL;
  if (devUrl) win.loadURL(devUrl);
  else win.loadURL(baseUrl + '/'); // sidecar serves the built UI same-origin
  win.webContents.on('console-message', (_e, level, message) => {
    if (level >= 3) console.error('[renderer]', message);
  });
  win.webContents.on('did-fail-load', (_e, code, desc, url) => {
    console.error('page load failed:', code, desc, url);
  });
}

app.whenReady().then(() => {
  startSidecar();
});

ipcMain.handle('workbench:config', () => ({ baseUrl, token: ACTIVE_TOKEN }));

ipcMain.handle('dialog:openFolder', async () => {
  const res = await dialog.showOpenDialog(win, { properties: ['openDirectory'] });
  if (res.canceled || !res.filePaths.length) return null;
  return res.filePaths[0];
});

app.on('before-quit', (e) => {
  if (!app.isQuitting) {
    e.preventDefault();
    app.isQuitting = true;
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('quit', () => {
  stopSidecar();
});