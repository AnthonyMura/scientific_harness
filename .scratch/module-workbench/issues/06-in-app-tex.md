# 06 — In-app TinyTeX (app-local TeX)

Status: resolved

## Problem
The workbench called the "global" LaTeX on PATH, but this machine has no TeX
distribution at all (no pdflatex/latexmk/tlmgr anywhere, zero apt texlive
packages), so every compile failed with "no TeX installation found". Wanted:
the TinyTeX approach — a TeX tree installed into a hidden folder of the app
directory, used, modified and invoked only by the app.

## Design
- `backend/workbench_backend/tinytex.py` (new) — manages an in-app TinyTeX at
  `workbench/.texlive` (hidden dot-folder in the app dir; overridable via
  `WORKBENCH_TEXLIVE_DIR`). `install(job)` downloads the official TinyTeX-1
  release (~50 MB, no admin rights) from rstudio/tinytex-releases and extracts
  it into the app folder; with an existing prefix it runs `tlmgr update --self`
  instead. Then it ensures `latexmk` plus the template's required packages are
  present (kpsewhich probes + tlmgr install). `maybe_install_missing(job,
  log_text)` is the on-demand repair: parses "File X not found" lines out of a
  failed compile log, resolves file→package (FILE_TO_PKG map → basename →
  `tlmgr search --global --file`) and installs up to six packages per compile.
  It only ever acts when the in-app prefix exists — system TeX is never
  touched.
- `targets.py` — LocalTarget prefers the app-local tree (PATH injection,
  direct `<bin>/latexmk` invocation); WslTarget prepends a PATH snippet for the
  mapped `.texlive` folder inside the distro; `run_latexmk(..., force)` adds
  `-f` on retries; the "auto" target's error now points at the Install panel's
  in-app TinyTeX.
- `compile_service.py` — up to three attempts per compile: on failure without
  a PDF it runs `maybe_install_missing` and, when packages were installed or
  latexmk was stuck on stale "error in previous invocation" state (fdb files
  cleared), retries with `-f`. Failed roots are remembered so the next start
  clears their stale state.
- `install.py` — new first target "in-app TinyTeX" (`recommended: true`) with
  install/repair/update via `POST /api/install/run {"target":"tinytex"}`;
  REQUIRED_FILES now shared from tinytex.py.
- `jobs.py` — public `Job.text()` accessor for the retry loop.
- Web — `recommended` chip on that target's card (types.ts, InstallPanel.tsx,
  `.chip.rec`).

## Behavior
System TeX is never installed, modified or invoked by this feature; when an
app-local prefix exists it always wins over system TeX. Missing packages are
added on demand as documents use them — the hidden folder grows only via
`tlmgr install` from inside the app.

## Verification
- Install via API: 51 MB downloaded, extracted to `.texlive/.TinyTeX`, tlmgr
  revision 79639; `newpx` + `microtype` auto-installed (latexmk ships with
  TinyTeX-1). Job exit 0.
- End-to-end compile of /home/nk/code/test-latex-project/main.tex via
  target=auto: first attempt failed on missing `caption.sty` → auto-installed →
  retry after clearing stale latexmk state → done, exit 0, main.pdf (247 KB) +
  synctex artifacts, GET /api/artifacts/pdf HTTP 200. All pdflatex inputs
  resolved from `.texlive/.TinyTeX/texmf-dist/...`.
- `tsc --noEmit` clean; vite build OK.
