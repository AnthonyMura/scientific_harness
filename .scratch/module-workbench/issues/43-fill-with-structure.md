# 43 — Project templates and "Fill with structure" (draft vision)

Status: needs-triage

**Draft vision for author review, not yet a development ticket.** The author asked
for an expanded proposal on 2026-09-30; this file is that proposal. Once the open
questions below are resolved, it becomes the implementation ticket (or is split).

## Request (user)

The app is for manuscripts/reports development — otherwise what is the difference
with a simple editor? Add a function for new **and** existing projects: "fill with
structure" (working name). The idea is a template of the project. We prefer to work
with LaTeX: we need folders for images, for sections, for tables, a `main.tex`
document, a folder for notes, etc. Expand this idea and propose a vision.

Additions (same day): a build folder that hides all compile artifacts except the
final PDF; a version-control folder (`versions/`); git setup (`git init`) with a
`.gitignore` covering all big files — images, raw data, etc.

## Why this is the differentiator

A plain editor opens a *folder* — an unordered bag of files. The workbench opens a
*project*, and a project has a **shape**: the app knows what each part is for and
can address it by name. A template is how that shape gets installed — in one click
for a new project, non-destructively for an existing one.

The payoff is per-part knowledge, now and later:

| Part | Knows it today | Unlocks later |
|---|---|---|
| `main.tex` | compile target, SyncTeX root, Structure pane outline | verifiable journal migration (#40) |
| `sections/*.tex` | Structure pane shows the real outline | per-section rewrite, conductor ops ("add section 6", "move figure to results") |
| `figures/` | image preview in tree | caption index, unused-figure check |
| `tables/` | editor | CSV → table generation (v3 research parser) |
| `references.bib` | bib editor, citation index + autocomplete | scoped project library (v3) |
| `notes/` | .md editing; excluded from compile/structure | TODO extraction, LLM summarization of notes |
| `README.md` | — | project card / catalog metadata (v3 "Project = record in the local catalog") |
| `data/` | stored as-is | v3 student-intake validation (M5) |
| `versions/` | Save version (#18) writes timestamped PDFs here | milestone artifacts; PDFs git-ignored |
| `.workbench/build/` | all compile artifacts (aux/log/synctex + final PDF) already live here, out of the source tree | machine-local, never committed |

The structure is also what lets the app **validate** a project (missing
`references.bib`? `\input` of a section that does not exist?) instead of guessing
paths. That is the answer to "what is this but an editor": an editor shows you
files; this app shows you *the manuscript*.

## What a template is

A template is a **folder** — the same shape as today's `templates/classic`
(`projects.py` already copytrees it) — plus an optional manifest:

```json
{
  "name": "Manuscript",
  "description": "Journal manuscript: one file per section, figures, tables, references, notes.",
  "kind": "latex",
  "main_file": "main.tex",
  "tex_packages": ["newpxtext", "newpxmath", "microtype", "booktabs", "hyperref"]
}
```

Rules:

- Every file/folder in the template folder is copied into the project; the
  manifest itself is not. No other machinery — a template must stay copy-pasteable
  by hand, and a user's own folder on disk is a valid template (that is what makes
  "user templates" a small follow-up rather than a new subsystem).
- Prefer **teaching content over keepers**: every empty folder carries one small
  real file that shows what belongs there (a sample table, a notes README), not a
  `.gitkeep`.
- `tex_packages` feeds the Install panel: for a new project the app can pre-check
  the in-app TinyTeX against the template's needs (extends the existing
  single-source-of-truth list in `install.py` to per-template).
- Where templates live: built-ins in `workbench/backend/templates/<id>/`; user
  templates later from any directory the user points at. v0 ships built-ins only,
  but the code path treats "a template directory" uniformly.

## The built-in structure (core of this ticket)

Default template **`manuscript`** (supersedes `classic` as the default; fate of
`classic` is open question 2):

```
<project>/
├── main.tex                 # thin root: preamble + \input list, NO body text
├── references.bib           # scoped reference library; starts with commented sample entries
├── README.md                # project card: title, target journal, status — one line each
├── .gitignore               # app rules: .workbench/, versions/*.pdf, figures/, data/ + stray LaTeX artifacts
├── sections/
│   ├── introduction.tex     # each file begins with its \section{...}
│   ├── methods.tex
│   ├── results.tex
│   └── discussion.tex
├── figures/                 # images — on disk, git-ignored
│   └── example.png          # sample + folder keeper (already in classic)
├── tables/
│   └── sample-table.tex     # self-contained booktabs snippet, \input'd from results
├── notes/
│   └── README.md            # what belongs here: ideas, todos, reviewer comments; never compiled
├── data/                    # raw input data (csv/parquet/pickle, TIFF stacks) — git-ignored
│   └── README.md            # expected shape; forward-compatible with v3 student intake
└── versions/                # milestone PDFs from Save version (#18); *.pdf git-ignored
    └── README.md            # what this folder is for
```

Design decisions baked in (flag any you disagree with):

- **`main.tex` is thin.** Preamble + title page + abstract + `\input{sections/…}`
  only. All body text lives in `sections/`. Consequences: the Structure pane shows
  a real multi-section outline from day one; files stay small; adding/reordering a
  section is an edit of the `\input` list, not a merge conflict. The current
  classic single-file `main.tex` is split accordingly (its preamble and packages
  carry over).
- **Section names are semantic** (`introduction.tex`), not numbered prefixes —
  document order lives in `main.tex`, so reordering never forces renames.
- **Tables are files.** Each table is one `.tex` file containing the full table
  environment, included via `\input{tables/…}` from the section that uses it.
  Sections stay readable; a table can be moved or reused without copy-paste. Raw
  data (csv/xlsx) may live alongside — v0 just stores it, generation comes later.
- **`notes/` is explicitly non-compiling.** It is the workspace for ideas, todos
  and reviewer comments in `.md`/`.tex`; the app never offers it to the compiler
  or the structure pane. This makes "where do I scratch?" have a home instead of
  becoming stray files at the root.
- **`references.bib` ships with commented sample entries** so the bib editor and
  citation autocomplete have something to learn from, and
  `\bibliography{references}` in `main.tex` works immediately.
- **`versions/` ships in the scaffold** — README only; Save version (#18) fills it
  with timestamped PDFs, which are git-ignored.
- **`data/` ships in the default template.** Raw input data (csv/parquet/pickle,
  TIFF stacks) lives here, git-ignored; its README documents the expected shape and
  is deliberately forward-compatible with v3's student-intake folder.
- **The build folder already exists — `.workbench/build/`.** Compile runs latexmk
  with `-output-directory=.workbench/build`, so aux/log/out/synctex/fdb never touch
  the source tree; only `<stem>.pdf` ends up there, and the dot-folder is hidden in
  the Explorer by default. It is app-owned (created on first compile), machine-local
  and git-ignored — not template content, but part of the known structure.
- **`.gitignore` is a first-class template file** (rules below). Fill adds it to an
  existing project if missing; never overwrites a user-edited one.

Optional second built-in, **`report`** (open question 3): same skeleton with
`summary/methods/results/conclusions` sections plus a `data/` folder for raw
input data — deliberately forward-compatible with v3's student-intake folder shape
(README + data + figures), so the conventions we fix here are the ones M5 will
validate later.

Every template ships this `.gitignore` (the manuscript tree's, verbatim):

```
# app state + compile artifacts (aux/log/out/synctex/final PDF)
.workbench/
# milestone PDFs — the folder itself stays tracked via README.md
versions/*.pdf
# big binaries stay on disk, out of git
figures/
data/
# LaTeX artifacts if a build ever leaks outside .workbench/build
*.aux *.log *.out *.fls *.toc *.synctex.gz *.fdb_latexmk
```

## Git setup

- **New project = repository from day one.** The sidecar (which already shells out
  to system git for #42) runs `git init` right after the copytree and makes a
  baseline commit `scaffold: create from template <id>` — the whole scaffold is
  committed, so every later edit is diffable against it. No git binary → project is
  still created, with the existing "install git" hint (same behavior as #42's empty
  state). Never blocked on git.
- **Fill on an existing project** adds `.gitignore` to the missing-items set. If
  the project is not a repository, fill does **not** silently init — the success
  state offers one click "Initialize repository" (the same action #42's empty state
  shows), which inits and makes a baseline commit of all currently tracked files.
- **Trade-off to accept consciously:** images and raw data are not backed up by git
  (author decision). If that changes later, Git LFS is the upgrade path — the ignore
  rules stay, LFS patterns get added on top.

**Shape after clone.** Git cannot track empty or fully-ignored folders: a fresh
clone of this project has no `figures/`, `data/` or `versions/`. That is by design —
the scaffold is the canonical shape, git carries the content, and "Fill with
structure" recreates the missing folders in one click on any machine. The structure
feature and git are two halves of the same contract.

## Behavior: new project

- The New-project modal gains a **template picker**: radio cards with name +
  one-line description and an expandable tree preview of what will be created.
  Default: `manuscript`.
- Create = copytree + set `main_file` from the manifest (`target: auto`) + record
  provenance in `.workbench/project.json`: `"template": "manuscript"` + `git init`
  with a baseline commit (see Git setup).
- If in-app TinyTeX is present and a manifest package is missing → the existing
  Install hint surfaces; creation is never blocked on it.

## Behavior: existing project — "Fill with structure"

Entry point: the Overleaf-style **project settings menu** (top bar) →
*Fill with structure…*. One entry point, not scattered in the explorer.

Flow:

1. Pick a template — preselected if the project recorded one at creation;
   otherwise `manuscript`.
2. **Dry-run preview** (the modal's default state): two groups — *will be created*
   (missing files/folders as a tree) and *left untouched* (everything that exists).
   If nothing is missing: an "already complete" state, no apply button.
3. **Apply**: create exactly the missing items. The rules are absolute:
   - **never overwrite, never delete, never modify** an existing file — user content is sacred;
   - a folder that exists is recursed into (fill its gaps);
   - `main.tex` already exists → left untouched, full stop (rewriting it to match
     a template is #40's territory, not this ticket's);
   - idempotent — running it twice is a no-op the second time.
4. After apply: refresh explorer + Structure pane; record/refresh the provenance
   field; if the project is a git repository, offer an auto-commit
   `scaffold: fill with structure (manuscript)` — template fill is exactly one of
   v3's "significant event" snapshot moments (pairs with #42). If it is not a
   repository, offer "Initialize repository" instead (see Git setup).

Edge cases: filling a half-built project that has no `main.tex` at all creates it
from the template (that is the point); a markdown-only project filled with a LaTeX
template gets a warning in the preview but may proceed.

## API surface (proposal)

| Endpoint | Purpose |
|---|---|
| GET /api/templates | List built-in templates: id, name, description, kind, tree preview |
| POST /api/projects/new `{name, location, template?}` | Existing endpoint gains `template` (default `manuscript`) |
| POST /api/projects/fill `{template, apply?}` | Without `apply`: dry-run → `{create: […], skip: […]}`. With `apply: true`: create the missing items, same response plus what was created |

No new endpoint for git: project creation inits + baseline-commits internally (the
sidecar already owns system-git access for #42); the fill response gains a `git`
field (`{repo: bool, initialized: bool}`) so the UI can offer the right follow-up.

## Boundaries — what this is not

- **Not journal theming.** Changing how an existing document compiles
  (documentclass, packages, look) is #40 / v3's verifiable migration. A template's
  `main.tex` is *initial content only*; once the project exists, it belongs to the
  user. Journal-flavored templates (MDPI, Nature…) are a later layer on top of this
  mechanism, not part of it.
- Not migration between templates, not user-template UI in v0, no content
  generation, no LLM.

## Open design questions (resolve with the author)

1. Section file naming: semantic (`introduction.tex`) vs numbered prefix
   (`01-introduction.tex`)? The proposal is semantic; numbered reads in document
   order in the explorer but makes reordering a rename.
2. Fate of `classic`: replaced by `manuscript` as the default, or kept side by side
   (single-file classic for journal-template workflows where one file is wanted)?
3. Ship the optional `report` template now, or manuscript-only in v0?
4. ~~Root `README.md` project card~~ — resolved (2026-09-30): included; a git
   repository without one would be stranger than one with a three-line card.
5. Starter content in `notes/`: just the README, or also a `todos.md`?
6. Naming: keep "Fill with structure" (the working name) vs "Scaffold…" /
   "Complete structure"? The paired new-project action is "New from template…".
7. Auto-commit after fill (needs #42): offer it in the success state, or always
   commit when a repo exists?
8. Dry-run preview: show only the delta (proposal), or the full tree with
   existing items marked as untouched?
9. Ignore granularity: whole folders (`figures/`, `data/`) vs patterns by
   extension/size (`*.tif`, `*.csv`)? The proposal is whole folders — simpler, and
   the folder itself is the contract; per-file patterns would let small images be
   tracked but blur what "the data folder" means.
10. Baseline commit messages: `scaffold: create from template <id>` /
    `scaffold: fill with structure (<id>)` — good convention, or do you want the
    template name only?

## Verification plan (draft)

- Fixture project created from `manuscript`: on-disk tree matches the spec; it
  compiles with the in-app TinyTeX; Structure pane shows all four sections;
  citation autocomplete sees `references.bib`.
- Fill on an empty folder creates the full structure; fill on a complete project is
  a no-op (dry-run reports nothing to create); pre-modify one file and confirm it
  is byte-identical after apply; a project with only `main.tex` gets sections/
  etc. but keeps its own `main.tex`.
- Provenance: `.workbench/project.json` records the template id; new-project modal
  default selection follows it.
- Git: new project is a repo with one baseline commit containing exactly the
  scaffold's tracked files (no `figures/`, `data/`, `.workbench/`); clone to a
  second path → "Fill with structure" recreates the ignored folders; fill on a
  non-repo offers init instead of committing.
- CDP checks per the usual headless-Chrome flow.

## Related

- #40 — journal theme rewrite of main.tex (the boundary this ticket must not cross)
- #42 — git module (shares the system-git plumbing, the "Initialize repository"
  action, and the snapshot-on-significant-event policy with this ticket)
- #38 — Structure pane (reads the `\input` outline that the template establishes)
- #17 — project settings / main file (provenance + `main_file` live in project.json)
- #18 — Save version (owns `versions/`, deliberately not part of the scaffold)
- v3 conception — Project definition, compilation profiles, student intake shape

## Comments

New draft ticket (2026-09-30); vision written per user request: "Expand this idea
and propose your vision. I will read your vision and we will create a ticket for
development." Awaiting author review of the open questions before implementation.

Second round (2026-09-30, same day): author added build-folder hygiene, the
`versions/` folder, and git init + `.gitignore` for big files; vision updated
accordingly (Git setup section, template tree, open questions 9–10). Still awaiting
author review.
