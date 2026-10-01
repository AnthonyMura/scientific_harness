# 59 — On-demand repair: resolve biblatex style files (.bbx/.cbx) to their packages

Status: needs-triage
Machine: home

## Request (user)

"Implement ticket 58 and fix latex compilation. As example, use a real project: C:\Users\amink\Documents\my projects\irm_local\2026-09-29_review_andrology" (2026-10-02, m00001). While fixing that compile the on-demand repair gap below surfaced.

## Current state

The andrology project failed to compile in-app with a cascade rooted in biblatex:
`Trying to load bibliography style 'vancouver' ... file 'vancouver.bbx' not found` (same for `.cbx`) → `Package biblatex Error: Style 'vancouver' not found` → aborted init left `\cite`/`\parencite` undefined → TeX error-recovery cascade ("Missing $ inserted" etc.) → fatal, no PDF. The `.tex` sources were all fine (balanced math, valid UTF-8) — the log noise was a symptom.

Environment fix that made it compile (25-page PDF via in-app TinyTeX): the style ships as per-style package `biblatex-vancouver` in TL2026 (`tlmgr search --global --file /vancouver.bbx` on CTAN → `biblatex-vancouver`; there is no `biblatex-extra` in the TL2026 index). The package was already installed on disk but kpathsea's ls-R was stale, so `kpsewhich vancouver.bbx` was empty; `mktexlsr texmf-dist` fixed resolution.

## Gap

The app could not self-heal this class of failure:
- `tinytex._pkg_for_file` (workbench/backend/workbench_backend/tinytex.py) has no `.bbx`/`.cbx` handling. The generic `tlmgr search --global --file /vancouver.bbx` against the default repository (tlnet.yihui.org — a partial mirror whose file index lacks the entry) returns nothing, so resolution falls through to the basename guess `vancouver`, which is not a package → `tlmgr install vancouver` fails → the package lands in the job's failed set and all six compile attempts are wasted.
- The stale-ls-R case (package installed, file invisible to kpathsea) is only reachable if resolution names the right package: then `_tlmgr_install` succeeds ("already present"), `_file_present` still fails, and the existing CTAN `--reinstall` retry (tinytex.py FALLBACK_REPOSITORY path) re-extracts and refreshes ls-R.

## Proposed direction (implemented on fix/59-biblatex-style-repair)

In `_pkg_for_file`, after the generic tlmgr-search step: for a missing file ending in `.bbx` or `.cbx`, try candidates `[biblatex-<base>, biblatex-extra]` validated via `_pkg_in_index` (TL2026 ships per-style `biblatex-<style>` packages; pre-TL2026 trees carried the extras in `biblatex-extra`). If neither is indexed, return `biblatex-<base>` as the guess so install + CTAN retry handle it. Add pytest coverage for both branches (indexed hit, index miss → guess).

## Verification plan

- New pytest in workbench/backend/tests/test_tinytex.py: `.bbx`/`.cbx` resolve to `biblatex-vancouver` when indexed; fall back to the guess when the index is empty; a full `maybe_install_missing` run on the real biblatex log lines installs `biblatex-vancouver` (with the CTAN-retry path exercised for the stale-ls-R case).
- Full backend suite green; merge gate per AGENTS.md.
- E2E: andrology project compiles to PDF in-app (done manually via latexmk after mktexlsr; the repair path itself is covered by tests since the environment is already healed).

## Related

#06 / #57 (on-demand package repair), #47 (partial-mirror CTAN fallback this builds on), #58 (compile approach choice — same session).
