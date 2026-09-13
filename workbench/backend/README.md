# Workbench backend (Python sidecar)

FastAPI service that owns all I/O for the workbench UI: projects, files,
compile targets, config, and TeX install detection/installation.

## Run

    cd workbench/backend
    python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
    WORKBENCH_TOKEN=devtoken .venv/bin/python -m workbench_backend serve

If `python3 -m venv` fails with "ensurepip is not available" (Ubuntu without
the python3-venv package), bootstrap pip instead:

    python3 -m venv --without-pip .venv
    curl -sS https://bootstrap.pypa.io/get-pip.py -o /tmp/get-pip.py
    .venv/bin/python /tmp/get-pip.py
    .venv/bin/pip install -r requirements.txt

The service binds 127.0.0.1 on an OS-assigned port and prints `PORT=<port>`
as its first stdout line (the Electron shell reads it). Every `/api/*` request
must carry the token in the `X-Workbench-Token` header.

The backend runs where the files live: on this machine that is inside WSL
(`wsl.exe -d Ubuntu -- bash -lc 'cd .../backend && .venv/bin/python -m workbench_backend serve'`).
Windows reaches it through WSL2 localhost forwarding; the Electron shell in
`app/src/main.js` detects the UNC path and spawns the sidecar inside the
matching distro automatically.

## Layout

- `workbench_backend/app.py` — FastAPI app, auth, routes
- `workbench_backend/projects.py` — open/new/recent projects (maps paths across the Windows/WSL boundary)
- `workbench_backend/files.py` — tree/read/write (in-place writes)
- `workbench_backend/compile_service.py` — latexmk job lifecycle
- `workbench_backend/targets.py` — compile targets: local, wsl (ssh arrives in M4)
- `workbench_backend/install.py` — TeX detection + one-click install scripts
- `workbench_backend/state.py` — global + per-project JSON state
- `workbench_backend/jobs.py` — shared job registry (compile + install logs)
- `templates/classic/` — built-in default project template

## v0 notes

- Writes are in-place (open-write-close); no temp+rename, because atomic
  rename is unsupported on some shares (UNC/WSL).
- Build artifacts go to `<project>/.workbench/build/`, never into the source tree.
- Cancelling a wsl-target compile kills the direct `wsl.exe` child only; a full
  process-group kill inside the distro is a polish item (plan M1).