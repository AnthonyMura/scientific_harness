# 01 — Project operating manual (AGENTS.md) for DSH agent work

Status: needs-triage
Machine: home

**Draft vision for author review, not yet a development ticket.** Based on the
shipped features of #43 (module-workbench, "Fill with structure") and the proven
manual stack of the 2026 Tomography & cytotoxicity project. Once the open
questions below are resolved, it becomes the implementation ticket (or is split).

## Request (user)

"I need to develop the AGENTS.md for the project. It would be the first version
that I would use with dsh (because there is no implementation of llm in my app
currently). Agents should help me to work with raw data, create guideline, run
build with tiny tex etc." Follow-up: create a ticket for this based on the
features of #43.

## Why this is needed

Until the app ships an LLM conductor (v3), DSH agents are the operating layer
for day-to-day scientific work: raw data, writing, builds, versioning. They need
a per-project operating manual to follow — that is what a project `AGENTS.md`
is, and DSH loads it into context automatically when the project is the
workspace.

The files are **content-is-data**: the same manual feeds the future app. #43
gave the *app* per-part knowledge (templates, Structure pane, fill). This ticket
gives the *same shape* a human-readable manual that agents follow outside the
app; when the conductor lands it reads these same files — `house-style.json`
becomes M1's writing-rules input, the layout map and note schema become
intake-validation rules, the build section becomes the compile profile.

Precedent: the Tomography project already embodies this pattern once (root
`AGENTS.md` operating manual + `GUIDE.md` + `manuscript/BUILD.md` +
`house-style.json` + `tools/`). This ticket generalizes that proven instance
into a canonical pattern plus instances — it does not reinvent the content.

## Two tiers (one per DSH workspace)

1. **Repo tier** — `scientific_harness/AGENTS.md`: environment facts for this
   machine, app dev workflow, TinyTeX build path, repo conventions. The existing
   file was written for a different machine (user `nk`, UNC paths into WSL); it
   needs a rewrite for this one (native Linux at `/home/minkota/…`, no pwsh/UNC
   dance), plus the TinyTeX section and a map of where real projects live
   (`/mnt/f/Work/Papers/{0_outdated,1_published,2_submitted,3_progress}/`).
2. **Project tier** — `<project>/AGENTS.md`: the project operating manual.
   Canonical pattern defined once in this repo; instantiated per manuscript
   project. Later ships inside #43's template folders (open question 4).

## Canonical sections of the project-tier manual

Writing discipline: slim always-loaded manual — only what a session needs every
turn goes inline (iron rules, layout map, note schema, build command); deep
reference sits behind one pointer each (`GUIDE.md` human workflow, `BUILD.md`
build troubleshooting, `house-style.json` style). Follow the
`writing-for-agents` skill when writing it.

| # | Section | Inline | Behind a pointer |
|---|---------|--------|------------------|
| 1 | Goal & phase | one paragraph: what this project produces, current milestone, open gates | `paper/plan.md` (milestones) |
| 2 | Layout map | table: path \| role \| who writes it \| read-only? — covering exactly the parts #43 names (below) | — |
| 3 | Iron rules | the proven set (below), verbatim-style | full list + rationale in `GUIDE.md` |
| 4 | Raw data pipeline | intake → extract → notes → overview flow; note block schema; definition of "merged"; exit-2 = garbled → needs-review | `GUIDE.md` evidence-pipeline chapter |
| 5 | Guidelines (house style) | `house-style.json` is the machine-readable style contract; creation/approval/application workflow | the JSON itself |
| 6 | Build with TinyTeX | canonical command, PATH setup, build dir, missing-package procedure, "never system TeX" rule | troubleshooting in `BUILD.md` |
| 7 | Writing conventions | one file per section; `\input` not `\include`; figures = folder (README card + image + float `.tex`) + index; tables one `.tex` each; variants/ and archive/ for parallel drafts; `% TODO (Mx):` markers; `references.bib` rebuilt deliberately at the references milestone | class quirks in `BUILD.md` |
| 8 | Version control | three layers: git (commit at every meaningful change, milestone tags) + `versions/` snapshots (PDF + source tarball + manifest) + section variants; retention zones never deleted | snapshot mechanics in `tools/snapshot.sh` |
| 9 | Resume protocol | on session start: this file → checkpoint ledger (`notes/STATUS.md`) → first non-merged row / current milestone gate | — |
| 10 | Tooling | `tools/` scripts (extract, snapshot, build test, reference inventory); venv has no pip by design (stdlib wheel fetch) | — |

## What this inherits from #43

The manual and the template describe **one shape**; a divergence between them is
a bug in one of them.

- **Per-part knowledge table → layout map.** The manual's layout map covers
  exactly the parts #43 names: `main.tex`, `sections/*.tex`, `figures/`,
  `tables/`, `references.bib`, `notes/`, `data/`, `versions/`,
  `.workbench/build/`, root `README.md` (project card). Each row states who
  writes it and whether it is read-only — the app-side "knows it today /
  unlocks later" table becomes agent-side rules.
- **Template tree → canonical on-disk shape.** The manual describes the
  `manuscript` template's tree as the known structure; #43's fill recreates
  missing folders, so the resume protocol can rely on "fill restores the
  ignored folders after a clone" (#43's "shape after clone" principle).
- **Git setup + `.gitignore` → version-control section.** Repository from day
  one; baseline commit `scaffold: …`; whole-folder ignores (`figures/`,
  `data/`) and `versions/*.pdf`; fill never silently inits. The manual states
  these as standing rules, not app behavior to discover.
- **Boundaries carry over:** not journal theming (#40's territory), no content
  generation, no LLM in v0. The manual describes shape; it never rewrites an
  existing `main.tex`.

## Feature areas (the three named in the request)

### Raw data

Two intake paths, both codified in the manual:

- **Lab-report pipeline** (proven): `reports/` read-only → `tools/extract.py`
  → `notes/<slug>.md` (note block schema: Purpose / Steps / Key numbers /
  Figures-tables / Open questions + Source pointer) → `overview.md` → plan.
  `overview.md` and the plan are built *only* from `notes/`; traceability via
  `[note:<slug>]`.
- **Student submission packages** (v3 M5): immutable folder of `README.md` +
  TIFF stack or csv/parquet/pickle + figures with expanded captions as separate
  files. The manual defines the expected shape so intake is a validation step;
  the same definition is what M5 will validate later.

Standing rules: raw data git-ignored; never open pickles blindly; numbers
verbatim from source; stage 1 = text only, no OCR, never guess content.

### Guidelines (house style)

`house-style.json` promoted to a first-class artifact with an explicit
lifecycle: **create** (agent drafts from the target journal's author guidelines
plus the user's preferences — e.g., the Tomography file's rhythm rule "one long
load-bearing sentence, then three to four short ones") → **approve** (user) →
**apply** (agents check register and mechanics on every prose pass) →
**revise** (git-tracked). This is the direct bridge to the app's M1
rewrite-with-writing-rules — same data shape.

### Build with TinyTeX

The canonical build becomes the app-local tree, replacing the Tomography
`BUILD.md`'s current WSL system TeX Live 2023 path:

```bash
export PATH=/home/minkota/code/scientific_harness/workbench/.texlive/bin/x86_64-linux:$PATH
cd <project>/manuscript
latexmk -pdf -synctex=1 -interaction=nonstopmode -file-line-error -output-directory=build main.tex
```

Identical to what the app's `LocalTarget` runs, so agent builds and app builds
are the same engine. Missing packages: parse `File 'x.sty' not found` from
`build/main.log` → `tlmgr install <pkg>` into the *same* tree (the app's
file→package mapping in `tinytex.py`) → rebuild. Never apt, never system TeX.

Caveat: `.texlive` is not installed on this machine yet — bootstrap it as part
of this work so the documented path is real, not aspirational.

## Iron rules (proven set, carried from the Tomography manual)

Sources are read-only (`reports/`, reference PDF corpus); notes are the only
bridge between sources and prose; traceability `[note:<slug>]`; American
English, short sentences, no filler; stage 1 = text only, never guess content;
one source per turn; commit at every meaningful change.

## Deliverables

1. Canonical pattern doc in this repo (location — open question 1).
2. Instantiated project-tier `AGENTS.md` for the Tomography project (upgrade of
   its existing manual; build section reconciled to TinyTeX).
3. Repo-tier `AGENTS.md` rewritten for this machine.
4. Tomography `manuscript/BUILD.md` rewritten: system TeX → TinyTeX canonical
   path (the one genuine conflict found in the existing docs).
5. (Follow-up, possibly a separate ticket) ship `AGENTS.md` + a `house-style.json`
   seed inside #43's template folders so new projects get them from day one.

## Open design questions (resolve with the author)

1. Where does the canonical pattern live — a doc in this repo
   (`docs/agents/project-manual.md`?), or is the upgraded Tomography manual
   itself the reference instance and no separate pattern doc is written?
2. Scope of this pass: all five deliverables, or pattern + Tomography instance
   first with 3–4 as a second pass?
3. TinyTeX bootstrap: install `workbench/.texlive` on this machine now (via the
   app's install path) so the build section is verified end-to-end before it
   goes into the manual?
4. Ship the manual inside #43's template folders now, or keep it as a separate
   follow-up ticket until the pattern has stabilized in one real project?

## Verification plan (draft)

- Build: the canonical TinyTeX command compiles the Tomography manuscript clean
  (latexmk exit 0, PDF in the build dir); the missing-package path is exercised
  deliberately (drop a package, rebuild, `tlmgr install`, green).
- Manual: every pointer target exists; the layout map matches both the
  on-disk tree and #43's template shape; the note schema matches existing
  `notes/` files.
- Resume protocol: a fresh DSH session opened at the project workspace follows
  manual → checkpoint ledger → current gate without asking.
- Repo tier: environment facts verified (paths, ports, tokens, build command).

## Related

- #43 — templates + "Fill with structure" (the per-part knowledge this manual
  encodes; future home of the pattern in template folders)
- #40 — journal theme rewrite of `main.tex` (boundary: the manual describes
  shape, never rewrites `main.tex`)
- #42 — git module (shares the version-control contract)
- v3 conception — LLM conductor, student intake (M5), writing rules (M1): the
  app features these files will feed

## Comments

New ticket (2026-09-29): draft vision for author review, per user request.
Grounded in #43's shipped features and a full read of the Tomography project's
manual stack (`AGENTS.md`, `GUIDE.md`, `manuscript/AGENTS.md`,
`manuscript/BUILD.md`, `house-style.json`, `tools/`). Awaiting author answers
to open questions 1–4 before implementation.
