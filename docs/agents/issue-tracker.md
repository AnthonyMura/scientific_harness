# Issue tracker: Local Markdown

Issues and specs for this repo live as markdown files in `.scratch/`.

## Conventions

- One feature per directory: `.scratch/<feature-slug>/`
- The spec is `.scratch/<feature-slug>/spec.md`
- Open tickets are one file per ticket at `.scratch/<feature-slug>/issues/<NN>-<slug>.md`, numbered from `01`, never a single combined tickets file. `issues/` holds only new/open tickets — a fresh ticket is always added there, never mixed in with resolved ones
- Resolved tickets live in `.scratch/<feature-slug>/resolved/<NN>-<slug>.md`. When a ticket is resolved, set its `Status:` line to `resolved`, then move the file from `issues/` to `resolved/` (git mv). Numbering continues across both folders: the next number is one past the highest in either
- Triage state is recorded as a `Status:` line near the top of each issue file (see `triage-labels.md` for the role strings)
- Comments and conversation history append to the bottom of the file under a `## Comments` heading

## Machine flag

Every open ticket carries a `Machine:` line right after its `Status:` line,
recording where the ticket's work was developed and verified:

- `home` — the home dev machine (this repo's WSL Ubuntu setup)
- `lab` — an office/lab machine (see docs/INSTALL.md)

The flag guards against mismatches between machines (TeX availability, Node
version, display). New tickets are stamped with the machine they are written
on. When a ticket is picked up or re-verified on a different machine than the
one flagged, re-run its verification plan before trusting the results.

## When a skill says "publish to the issue tracker"

Create a new file under `.scratch/<feature-slug>/` (creating the directory if needed).

## Machine flag

Every open ticket carries a `Machine:` line right after its `Status:` line,
recording where the ticket's work was developed and verified:

- `home` — the home dev machine (this repo's WSL Ubuntu setup)
- `lab` — an office/lab machine (see docs/INSTALL.md)

The flag guards against mismatches between machines (TeX availability, Node
version, display). New tickets are stamped with the machine they are written
on. When a ticket is picked up or re-verified on a different machine than the
one flagged, re-run its verification plan before trusting the results.

## When a skill says "fetch the relevant ticket"

Read the file at the referenced path. The user will normally pass the path or the issue number directly.

## Wayfinding operations

Used by `/wayfinder`. The **map** is a file with one **child** file per ticket.

- **Map**: `.scratch/<effort>/map.md` (the Notes / Decisions-so-far / Fog body).
- **Child ticket**: `.scratch/<effort>/issues/NN-<slug>.md`, numbered from `01`, with the question in the body. A `Type:` line records the ticket type (`research`/`prototype`/`grilling`/`task`); a `Status:` line records `claimed`/`resolved`.
- **Blocking**: a `Blocked by: NN, NN` line near the top. A ticket is unblocked when every file it lists is `resolved` (check both `issues/` and `resolved/`).
- **Frontier**: scan `.scratch/<effort>/issues/` for files that are open, unblocked, and unclaimed; first by number wins.
- **Claim**: set `Status: claimed` and save before any work.
- **Resolve**: append the answer under an `## Answer` heading, set `Status: resolved`, move the file from `issues/` to `.scratch/<effort>/resolved/`, then append a context pointer (gist + link) to the map's Decisions-so-far in `map.md`.
