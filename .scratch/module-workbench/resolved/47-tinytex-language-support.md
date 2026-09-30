# 47 — TinyTeX auto-install misses language/encoding packages (Russian T2A + babel)

Status: needs-triage
Machine: home

## Problem (user report)

Compiling a Russian document against the in-app TinyTeX fails with a cascade
of missing dependencies that the on-demand installer (#06) does not repair.
The test document uses `\usepackage[russian]{babel}` and
`\usepackage[T2A]{fontenc}`. Errors encountered, in order:

1. `ragged2e.sty` not found — auto-installed, resolved.
2. Cyrillic encoding missing — NOT repaired:
   ```
   Package fontenc Error: Encoding file `t2aenc.def' not found.
   LaTeX Error: Encoding scheme `T2A' unknown.
   ```
3. Russian babel support missing — NOT repaired:
   ```
   Package babel Error: Unknown option 'russian'.
   ```
4. `multirow.sty` / `enumitem.sty` not found — auto-installed, resolved.

Net effect: a casual user opening a non-English document gets an unfixable
compile; today the app only ever installs plain `.sty` packages.

## Root cause (code)

- `workbench/backend/workbench_backend/tinytex.py:60`:
  `MISSING_FILE_RE = re.compile(r"File [`']([^'`]+)[`]?' not found")`
  requires capital-"File". fontenc's message is lowercase — "Encoding file
  `t2aenc.def' not found" — so encoding `.def` files never match and the
  repair loop stops there.
- The babel failure ("Unknown option 'russian'") is not a missing-file message
  at all, so nothing in the parser sees it.
- `_pkg_for_file()` (tinytex.py:136) already has a
  `tlmgr search --global --file /<fname>` fallback that would resolve
  `t2aenc.def` to its providing package (`cyrillic`) — for `.def` files the
  detection regex is the only gap.

## Fix direction

1. Broaden missing-file detection in `maybe_install_missing()` (tinytex.py):
   case-insensitive match on "file … not found" covering both quote styles,
   keeping the skip list for source/aux/image extensions (`.tex`, `.aux`,
   `.log`, `.pdf`, `.png`, `.jpg`).
2. Encoding `.def` files: let them flow into `_pkg_for_file()`; verify
   `tlmgr search --file /t2aenc.def` returns the providing package and add
   explicit `FILE_TO_PKG` entries if resolution is flaky (e.g.
   `t2aenc.def → cyrillic`, `t2benc.def → cyrillic`).
3. Babel language options: detect `Package babel Error: Unknown option
   '<lang>'` and install the matching package (`babel-russian`; confirm the
   exact tlmgr name at claim time, e.g. via `tlmgr search --file /russian.ldf`),
   plus `hyphen-russian` if needed for hyphenation.
4. Consider pre-installing common language bundles during the initial TinyTeX
   setup (cyrillic + a few babel languages) so casual users never hit the
   cascade — open question below.

## Open questions

- Pre-install language support at install time, or keep strictly on-demand?
- Which languages to cover if pre-installing (russian / greek / ukrainian / …)?
- Does the retry loop (`compile_service.py`, up to 3 attempts) need more than
  one extra pass for cascades that install several packages in one go?

## Verification plan

- Minimal Russian fixture: `\documentclass{article}`,
  `\usepackage[T2A]{fontenc}`, `\usepackage[russian]{babel}`, a line of
  Cyrillic text; compile via `POST /api/compile` (target=auto) against the
  in-app TinyTeX.
- Job log must show auto-install of the encoding package + the babel language
  and a successful retry: exit 0, PDF artifact returned.
- Afterwards `find workbench/.texlive -name t2aenc.def` and the Russian babel
  file both exist; re-running the compile installs nothing new (idempotent).

## Related

- #06 — In-app TinyTeX (the on-demand package install this ticket extends)
- Standing E2E target: /home/nk/code/test-latex-project

## Comments

New ticket (2026-09-30); from the user's report of a Russian LaTeX document
failing in the in-app TinyTeX, with the compile-log analysis quoted above.
