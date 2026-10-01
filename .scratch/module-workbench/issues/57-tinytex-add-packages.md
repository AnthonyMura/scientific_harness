# 57 — TinyTeX: add packages on demand (user-initiated)

Status: needs-triage
Machine: home

## Request (user)

"Make tinytex to have function to add packages when user needs them"

## Current state

- The in-app TinyTeX (`workbench/backend/workbench_backend/tinytex.py`) is only
  maintained **reactively**: `maybe_install_missing(job, log_text)` runs after a
  failed compile, parses missing-file / babel / font-metric lines and installs
  the providing tlmgr packages (issue 06 design; cascade cap in
  `compile_service.MAX_COMPILE_ATTEMPTS = 6`).
- There is no way for the user to **proactively** add a package they know they
  need (e.g. `beamer`, `tikz`, or a `.sty` file name) before compiling:
  - `POST /api/install/run {"target":"tinytex"}` only does the full
    install/update + REQUIRED_FILES check (`install.start_install`).
  - The Install TeX panel (`workbench/web/src/components/InstallPanel.tsx`)
    shows target cards and an "Install now" button — no package input.
- Reusable internals already exist in `tinytex.py`: `_pkg_for_file(b, fname)`
  (file → tlmgr package: FILE_TO_PKG map, `tlmgr search`, fallbacks),
  `_pkg_installed(b, pkg)`, `_tlmgr_install(b, pkg, job)` (streams to the job
  log, optional `repository=` CTAN fallback).

## Proposed direction (not yet implemented)

- Backend: new function `tinytex.install_packages(job, names)` — for each name:
  a file name (`*.sty`/`*.cls`/`*.def`/`*.ldf`/`*.tfm`/`*.mf`) resolves via
  `_pkg_for_file`; anything else is treated as a tlmgr package name (validated,
  no shell involved — argv only). Already-installed packages are skipped with a
  log line; the rest install via `_tlmgr_install`. Returns the installed names.
- New endpoint `POST /api/install/packages` `{"packages": ["beamer", ...]}` →
  streamed job (kind "install", same Run Log flow as installs). Fails fast with
  a clear error when the in-app TinyTeX is not installed yet.
- Web: Install TeX panel — on the in-app TinyTeX card, an input + "Add" button
  (comma/space separated names) calling the new endpoint through a new ctx
  channel; job progress visible in the Run Log module like other installs.

## Verification plan (for whoever implements)

- pytest: name resolution (file → package), already-installed skip, invalid
  names rejected (400), missing TinyTeX prefix error, install invocations
  recorded (monkeypatched `_tlmgr_install`/`_pkg_installed`).
- vitest: the input-parsing helper (splitting/trimming/dedup of the text field).
- Full suite green + `tsc --noEmit` + vite build.
- Headless-Chrome CDP: Install panel shows the add-packages input on the TinyTeX
  card; submit starts a job that streams into the Run Log.
- E2E against the real `.texlive` tree via the API: request an already-installed
  package (skip path) and one small new package (install path).

## Related

- #06 — In-app TinyTeX (the reactive on-demand repair this complements)
- #47 — TinyTeX language support (FILE_TO_PKG entries, tlmgr-search parsing)
- #49 — Install TeX button removal (the panel stays the home of install flows)

## Comments

New ticket (2026-10-01, home); user request quoted above. Ticket-only creation
per user instruction — no implementation started, no branch created.
