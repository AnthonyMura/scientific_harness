# Install & Run — Scientific Writing Workbench

Get the workbench running on a fresh machine: **Windows (native)**, **Windows + WSL2**, **macOS**, or **Linux**. Verified against release **v0.1.0** (2026-07).

## What you are running

The app is two local processes that talk over `127.0.0.1`:

| Process | Stack | Address |
|---|---|---|
| UI | React + Vite, opened in your browser | <http://127.0.0.1:5199> |
| Sidecar | Python (FastAPI); owns all file I/O and compilation | `127.0.0.1:8765` (token `devtoken`) |

There is no Electron shell in v0 — the browser tab **is** the app window. No system LaTeX needed either: on first use the app installs its own TinyTeX into a hidden `workbench/.texlive` folder (from the Install panel), and adds missing packages automatically while you compile.

## Prerequisites (all platforms)

| Tool | Version | Notes |
|---|---|---|
| Git | any recent | clone the repo |
| Node.js | **20+ LTS** (verified on 22.x) | for the UI (`npm install`, `npm run dev`) |
| Python | **3.11+** (verified on 3.12) | for the sidecar |
| Internet | — | `npm`/`pip` installs + one-time TinyTeX download (~500 MB) |

## Windows + WSL2 (recommended for lab PCs)

Everything runs inside Linux; your Windows browser reaches both ports through WSL2's automatic localhost forwarding.

1. **Install WSL2 + Ubuntu** (skip if you have it):
   ```powershell
   wsl --install -d Ubuntu
   ```
   Restart when prompted, then open an Ubuntu terminal and set your Unix user.

2. **Tools inside Ubuntu**:
   ```bash
   sudo apt update
   sudo apt install -y git curl ca-certificates xz-utils python3-venv
   # Node: the distro's node is often too old — install a current LTS into ~/nodejs
   mkdir -p ~/nodejs
   curl -fsSL https://nodejs.org/dist/v22.23.2/node-v22.23.2-linux-x64.tar.xz -o /tmp/node.tar.xz
   sudo tar -xJf /tmp/node.tar.xz -C ~/nodejs --strip-components=1
   echo 'export PATH=$HOME/nodejs/bin:$PATH' >> ~/.bashrc && source ~/.bashrc
   node --version    # v22.23.2 (any current LTS works; ARM PCs: use the linux-arm64 tarball)
   ```

3. **Clone & set up**:
   ```bash
   git clone https://github.com/AnthonyMura/scientific_harness.git
   cd scientific_harness/workbench/web && npm install
   cd ../backend && python3 -m venv .venv && ./.venv/bin/pip install -r requirements.txt
   ```

4. **Run** — two Ubuntu terminals:
   ```bash
   # terminal 1 — sidecar
   cd ~/code/scientific_harness/workbench/backend   # wherever you cloned it
   WORKBENCH_TOKEN=devtoken ./.venv/bin/python -m workbench_backend serve --port 8765

   # terminal 2 — UI
   cd ~/code/scientific_harness/workbench/web
   npm run dev
   ```

5. Open **<http://127.0.0.1:5199>** in your Windows browser. Done.

> Keep project folders inside WSL (`~/...`), not on a Windows drive (`/mnt/c/...`) — file I/O across the 9P bridge is slow and some operations misbehave there.

## Linux (Debian/Ubuntu, Fedora, …)

1. **Tools**:
   ```bash
   sudo apt install -y git curl ca-certificates xz-utils python3-venv    # Debian/Ubuntu
   # or: sudo dnf install -y git curl xz tar python3                     # Fedora
   ```
2. **Node 20+**: use the distro's if `node --version` is ≥ 20; otherwise the nodejs.org tarball into `~/nodejs` (same recipe as WSL step 2) or NodeSource.
3. **Clone, set up, run**: identical to WSL steps 3–4.

If `python3 -m venv` fails with *"ensurepip is not available"*, see the get-pip bootstrap in [workbench/backend/README.md](../workbench/backend/README.md).

## macOS

1. **Tools** (Homebrew):
   ```bash
   /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
   brew install git node
   python3 --version    # need ≥ 3.11; if missing or older: brew install python@3.12
   ```
   Homebrew's `python@3.12` is keg-only — either add `$(brew --prefix)/opt/python@3.12/bin` to your `PATH` in `~/.zshrc`, or point the venv step at it directly:
   `$(brew --prefix)/opt/python@3.12/bin/python3 -m venv .venv`
2. **Clone, set up, run**: identical to WSL steps 3–4 (all commands are the same).

Apple Silicon works out of the box — the in-app TinyTeX ships an arm64 build.

## Windows (native, no WSL)

Everything runs natively; only the command syntax differs (PowerShell).

1. **Tools**:
   ```powershell
   winget install -e --id Git.Git
   winget install -e --id OpenJS.NodeJS.LTS
   winget install -e --id Python.Python.3.12
   ```
   Open a **new** terminal afterwards so `PATH` picks up the installs.
2. **Clone & set up**:
   ```powershell
   git clone https://github.com/AnthonyMura/scientific_harness.git
   cd scientific_harness\workbench\web; npm install
   cd ..\backend; python -m venv .venv; .\.venv\Scripts\pip install -r requirements.txt
   ```
3. **Run** — two PowerShell terminals:
   ```powershell
   # terminal 1 — sidecar
   cd C:\code\scientific_harness\workbench\backend        # wherever you cloned it
   $env:WORKBENCH_TOKEN = "devtoken"
   .\.venv\Scripts\python -m workbench_backend serve --port 8765

   # terminal 2 — UI
   cd C:\code\scientific_harness\workbench\web
   npm run dev
   ```
4. Open **<http://127.0.0.1:5199>**.

Notes for native Windows: the in-app TinyTeX has a Windows build, so LaTeX works without any system TeX — install it from the app's **Install** panel on first use. Keep projects on a plain local drive (not OneDrive-synced or network shares) to avoid file-write glitches.

## First run (all platforms)

1. Open <http://127.0.0.1:5199>.
2. **Open project** — type the absolute path of any LaTeX project, or create a new one from the built-in template.
3. The first compile needs TeX: open the **Install** panel and run the TinyTeX install (one-time, a few hundred MB). Afterwards, missing `.sty` packages are installed automatically during compile.
4. Compile from the editor header (`.tex` files) → the PDF opens to the right with source↔PDF sync; errors in the log jump you to the offending line.

## Troubleshooting

| Symptom | Fix |
|---|---|
| UI loads but reports the backend unreachable | The sidecar must be running on exactly `127.0.0.1:8765` (browser dev mode hard-codes that address). Kill whatever holds port 8765 and restart the sidecar. |
| `EADDRINUSE` on 5199 or 8765 | A previous instance is still running — `Ctrl+C` both terminals, or kill the process on that port. |
| Vite/Node crashes with engine errors | Node too old (distro package). Install Node 20+ LTS per your platform section above. |
| `python3 -m venv` → *ensurepip is not available* | `sudo apt install python3-venv`, or the get-pip bootstrap in [backend/README.md](../workbench/backend/README.md). |
| Slow compiles / stuttery file ops (WSL) | Project lives on `/mnt/c/...` — move it into your WSL home. |
| UI shows stale code after an edit | The Vite config already polls for changes; if it still looks old, hard-refresh the page. |

## Stopping

`Ctrl+C` in each terminal (sidecar and UI). Nothing else to clean up: build artifacts land in `<project>/.workbench/build/`, and the TinyTeX tree stays in `workbench/.texlive` for next time.
