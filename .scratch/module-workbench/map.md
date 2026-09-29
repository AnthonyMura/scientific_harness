# module-workbench — decision map

Working map of decisions made across this feature's tickets. Kept short on
purpose: one line per decision with a pointer to the ticket that records it in
full. Open tickets live in `issues/`, resolved ones in `resolved/`.

## Decisions-so-far

- Templates are plain folders + optional `manifest.json` (no code, no registry);
  "Fill with structure" is non-destructive and dry-run-first; new projects get a
  git baseline commit; minimal git endpoints were built in-ticket because #42's
  premise (sidecar already owns system-git access) was false —
  `.scratch/module-workbench/resolved/43-fill-with-structure.md`
