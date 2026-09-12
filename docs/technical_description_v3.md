# Scientific Writing Workbench — Conception

> **Status:** conception only (v3, revised after the expert review in gpt-sol-pro.md; every decision point from that review is resolved in this version). Next step: Stage 0 prototypes (section 12).
>
> **One line:** a lab workstation for publication preparation. A single client that unifies scientific text preparation for a laboratory: writing, references, student data, compilation, research search, LLM assistance. Usable by non-programmers, built on integrated existing tools rather than re-implementations. Developed in sequence: a reliable author workbench first, then the lab data catalog, then research search, and only after that an autonomous conductor.

## 1. Background

I work in biophysics and do research in applied medicine. I am head of a laboratory and prepare texts for journal manuscripts, reports, books, guidelines, etc. Currently I use DeepSeek Harness (DSH) to work with files; mostly I compile .tex files using journals' or grants' templates. I keep data about authors in an independent file — txt files that work as a database of co-authors with information about their impact, ORCIDs, etc. I also created special protocols for my students and people who work with me: they provide their data as a folder with a README.md describing the experiment, setup, goal, motivation, plus the data source (a stack of TIFFs, or csv/parquet/pickle) or figures (with the expanded caption as an independent file). This helps me check data, workflows, and metadata. The reference manager is Zotero, but I keep a folder with all PDFs in the same project. Notes and ideas live in .tex or .md files. Version control is git plus manual saving of compiled PDFs as versions.

## 2. Problem

Two problems compound each other.

**Tool sprawl.** To prepare one manuscript I currently use DSH, LaTeX, a terminal, a PDF viewer, Zotero, PubMed and Google Scholar, and manually choose models for rewriting, planning, and construction. Colleagues require .doc files. Student data arrives as free-form folders that I must audit manually. It is complicated and consumes time.

**Adoption cannot be enforced in a lab.** In a company you can mandate a unified data workflow (for example Teams) — IT enforces it and people comply even when it is inconvenient. In a medical/biology lab you cannot: students rotate, collaborators are external, there is no IT department behind you. So the only way to get unified data and process is to make the compliant path easier than the sloppy one. A single client where the right workflow is the default workflow solves both problems at once: it removes tool sprawl for me, and it makes structured data submission trivial for students.

## 3. Goals and non-goals

### Goals

- A single client application usable by non-programmers (students, colleagues): one window, no terminal, no model selection exposed.
- Integrate existing tools as services behind adapters: Zotero via API, git, local LaTeX, LLM providers (UNSLOTH or others), DSH logic for sessions and the conductor. Users may continue using Zotero standalone or work entirely inside the client.
- Structured student data intake that replaces manual folder audits, delivered through immutable submission packages over the lab's existing shared storage.
- Paragraph-level editing with stable block identity: split-pane rewrite with per-task writing skills/rules and versioned acceptance; every block keeps an ID that survives edits and moves (section 6).
- Project-scoped references and data through database relations and a common tag system, so the chain from experiment to figure to paragraph to citation is traceable.
- An LLM conductor that executes multi-step workflows ("edit section N, add 2 co-authors, add 7 new references, change template from MDPI to Nature") through allowlisted commands with plan, preview, and confirmation, without the user doing it by hand.

### Non-goals (explicit)

- Not re-implementing a reference manager from scratch — Zotero remains the reference backend, accessed via API.
- Not replacing file sync or network storage (no "our own Teams"). The system owns metadata and workflow; files stay on disk where they are.
- Not a generic LLM chat product. Chat is one face of the conductor, not the center of the app.
- Not real-time collaborative editing in the first version — external colleagues get .docx/PDF exports (a live read-only view is an open question).
- Not an Overleaf alternative and not a browser product: no install-free access and no simultaneous co-editing in v1 (positioning, section 15).
- No DOCX import in the first version. Word is an export target only; bringing colleagues' edits and track changes back into LaTeX is a separate future project.
- No third-party plugin system, no own Zotero clone, no SQLite file synced between computers.

## 4. Users

| Role | What they need | LLM exposure |
|---|---|---|
| PI / lab head (power user) | Full control: profiles, templates, skills, conductor workflows; manages the lab's projects | Direct chat with the conductor + invisible AI buttons |
| Student / lab member | Fill intake forms in a simplified app mode on their own machine, submit data packages, receive tasks — zero terminal or LLM knowledge | Invisible only ("submit", "check") |
| External collaborator | Receives .docx/PDF exports of the current version | None |

## 5. Core principles

1. **Integrate, don't re-implement.** Zotero, git, LaTeX, and LLM providers exist and work; the product is the integration layer that makes them one system.
2. **Invisible intelligence.** For ordinary users the LLM appears as buttons ("rewrite", "add reference", "check data"), not as a chat window or model picker. The conductor exists as a service behind those buttons; direct chat is reserved for power users.
3. **Make the compliant path easier.** Structure is enforced by the UI (forms, fields, tags), not by discipline. This is what makes unified data possible in a lab that cannot mandate anything.
4. **Local-first: own metadata and workflow, not storage.** Files (.tex, .pdf, TIFF, csv…) stay on disk; the system keeps structured records about them and git history for versions.
5. **Modules as independent units on a common spine ("injection system").** Every module plugs into shared primitives (project, tags, addressed document) and can be developed independently. Every module can be supported by an LLM with specific skills and rules — the same provider and model, different context per task.
6. **Content is data, never commands.** Text inside files on disk or imported from anywhere — PDFs, READMEs, student documents, web pages — is material to be processed, not instructions. It cannot order the system to change a project or send data somewhere. This one rule covers prompt injection for every module that reads external content.
7. **Rules before AI.** Anything checkable by ordinary code is checked by ordinary code: required fields filled, DOI resolves, LaTeX compiles, file matches the expected format, source paragraph unchanged, reference not already in the project. The LLM is used where language understanding is needed: rewriting, explaining relevance, proposing structure, summarizing.

## 6. The spine: shared primitives that connect modules

Three primitives are shared by all modules; most inter-module connections flow through them.

**Project** — the unit of work (a manuscript, report, grant, or guideline). A project is a record in the local catalog and owns: its addressed text, its template/compilation profile, its scoped reference library, its scoped data set, and its git history. Everything a module does is done *to* or *from* a project.

**Relations, tags, and files.** Membership in a project is a database relation: a record points to a project by the project's permanent ID, not to a text tag like `project-1`. In the interface it can still look like a tag; inside the catalog it is a link to a real project record. Tags answer "what category does this belong to?" (`confocal`, `needs-review`, `cardiology`); relations answer "how exactly are these two objects connected?" The typed links in the first version: a data record **is used in** figure 2; a figure **is inserted in** a paragraph; a paper **is cited in** a paragraph; an experiment **was performed by** a student; an author **participates in** a project. A sixth link, a source **supports** a specific statement, comes later. Citation positions are derived automatically from `\cite{key}` at parse time, so paper-to-paragraph links cost no manual work.

Files are linked the same careful way. Not by symlinks, which break when folders move and hide replaced files, but through the catalog: every attached file is registered by path and SHA-256 checksum, verified at import and re-verifiable later. For important stages a "freeze version" copies the exact bytes into a per-project artifact directory, so a manuscript always points at the data it used even if the original is replaced. Symlinks remain an optional convenience.

**Addressed document model.** The v2 address `S2SS3P4L325` is a coordinate: insert one section and every number after it changes. In v3 each logical block (paragraph, heading, figure or table environment) carries a hidden stable ID (`blk_01J8K7F`) that never depends on position. The ID lives in the source as a comment (`% swb:block-id:` in .tex, an HTML comment in .md); export profiles strip these comments for journal submission. The human address ("section 2.3, paragraph 4") is computed from the block's current position and shown in the UI; it is never stored. A sidecar index (`.workbench/document-map.json`) maps each ID to its position and a hash of its text: fast lookup on large documents, and recovery when a hand edit deletes or duplicates an ID. The app detects missing or duplicate IDs on save and re-issues them from the hashes.

This is what makes LLM operations precise. An operation targets a block ID plus a fingerprint of the current text; if the paragraph changed after the proposal was made, the operation is not applied and the conflict is shown instead. Versioned replacement of individual paragraphs, and anchoring of citations and figures to text positions, work on top of the same IDs.

### Connection map

| Connection | What flows between modules |
|---|---|
| Editor ↔ References | Citations inserted/updated from the project library; "add reference" from editor context |
| Editor ↔ Data store | Figure/table + expanded caption pulled from a student record into a manuscript section |
| Editor ↔ LaTeX | The template profile determines compilation; edits recompile to the PDF preview |
| Research → References | Selected papers imported into the library through the verification gate, with per-paper notes |
| References & Data ↔ Project | Relation-based scoping without file copies; auto .bib per project |
| Conductor ↔ all modules | Allowlisted module commands (the same set the UI buttons call); multi-step natural-language workflows with plan, preview, confirmation, verification, rollback |
| Version control ↔ everything | Paragraph versions in the change journal; project snapshots (text + references + data metadata) on significant events |

## 7. Modules

### M1 — File editor (core)

The classical main tool to write text and check grammar and syntax (.tex, .md).

- **Block addressing:** every block has a hidden stable ID (section 6); the human address is shown, the ID is copyable in an advanced mode, and any operation can target a block by ID.
- **Split-pane rewrite:** select lines → click "rewrite" → a split opens *to the right of the selection* (not a second window); text before and after stays in place. The pane is empty space where you write new text by hand or with an LLM (UNSLOTH or another provider).
- **Skills/rules per task:** calling "write with AI" / "rewrite with AI" is a prompt injection into a new temporary chat carrying the specific rules for that writing task — same provider, same model, different context. Rules are swappable per module and task; this is why the editor is built from submodules that can be developed independently.
- **Accept / accept-with-version:** accept removes the selected text and inserts the new one; "accept with version control" records the change in the change journal: old text, new text, block ID, user, time, skill used, model and instruction version, related sources.

### M2 — LaTeX compilation

Nothing fancy: profiles per journal/grant/report (template + commands). Compilation runs local LaTeX inside a sandbox of the software — an isolated process with a controlled environment, not a VM (a VM only if isolation needs grow). Compile-on-change feeds the PDF viewer; compiled PDFs are saved as versions (formalizing the current manual habit).

Switching templates is a **verifiable migration**, not a guaranteed conversion: the system copies the working version, migrates metadata and structure, shows the diff, compiles, reports errors, and you accept the result. Arbitrary LaTeX does not convert losslessly; the product promises a checked process, not a magic button.

### M3 — PDF viewer

Embedded in the client; paired with the editor to see updates of .tex files without opening another app. Navigation from a source position to the corresponding place in the PDF, and back, is part of this module.

### M4 — References (Zotero integration)

- **Zotero standalone is the bibliographic backend**, accessed via API (+ Better BibTeX). The client is a view on top of it; you can keep using Zotero as before, and reference PDFs stay where they are.
- General library + project libraries: membership is a relation to the project record (section 6), shown tag-like in the UI; a paper linked to two projects appears in both.
- Automatic .bib creation inside each project.
- Parse and add references via PubMed / arXiv / DOI, with strict verification: every reference must resolve against PubMed, Crossref, or an existing Zotero record before it enters a project library. An LLM-suggested DOI that does not resolve goes to a "needs verification" queue, never silently into the bibliography.

### M5 — Data & artifacts (student intake)

- **Structured form instead of a free folder:** a student getting a task fills fields — goal, instrument, materials, motivation, data files — to add the record to the database. Enforced fields replace my manual audit; reviewing becomes checking filled structure, not reconstructing missing information.
- **Submission package over existing shared storage:** the student works in a simplified app mode on their own machine, fills the form, attaches files; the app builds an immutable package (manifest with record ID, form schema version, field values, and SHA-256 per file) and places it in the lab's existing shared storage. My app imports it and verifies checksums. No new server is needed for this to work; a small server for tasks, forms, statuses, and users is a later stage (section 14).
- Accepts any attachment; preview and automatic validation are implemented for a whitelist only (v1: TIFF stacks, csv, parquet). Pickle files are never auto-opened, because loading an untrusted pickle executes whatever code it contains; they are registered in the catalog only, or inspected in a strictly isolated process.
- **Same scoping logic as references:** records link to projects by relation, files by catalog entry with checksum; "freeze version" (section 6) pins the exact bytes a manuscript used.
- This part is for cooperation and data control; records can be used in any project they are linked to.

### M6 — Conductor

An LLM service layer over an allowlisted command set: the operations of all other modules, exposed as named commands (`document.replaceBlock`, `references.importByDoi`, `project.changeTemplate`, `compile.run`, `data.attachRecord`, `version.createSnapshot`). UI buttons and the conductor call the same commands. The conductor has no shell access and no arbitrary file writes. MCP is used only as an external way to show these commands to models; if the protocol changes, the editor, database, and compiler keep working.

- **Invisible face:** the AI buttons inside each module (M1 rewrite, M4 add reference, M5 check data…).
- **Direct face:** a chat for power users, following DSH logic with many sessions.
- **Execution pipeline:** plan → preview (which documents, references, and files will change) → confirmation (whole plan or individual steps) → execution (allowlisted commands only) → verification (compilation, DOI resolution, required fields, orphaned citations) → snapshot (versions + journal entry) → rollback (the whole run undoes as one unit). A single-command operation with fully specified parameters takes a light path: one confirmation showing exactly what changes, no plan screen.
- Example workflow: "edit section N in the manuscript, add 2 co-authors, add 7 new references, change template from MDPI to Nature" — executed end-to-end without the user doing it by hand, but only after the preview shows the found papers, their metadata sources, and the proposed template changes. It also helps people who do not like doing things manually (for example editing a journal template).

### M7 — Research

A parser of PubMed, arXiv, Crossref, and other data resources with an LLM. Google Scholar is reachable as a manual channel (pasting results), never by direct parsing; its coverage stays available without fragile scraping.

- The user provides a prompt about research and an interesting field; the LLM proposes search terms, the rewritten idea, and field topics. The program queries official APIs; results are deduplicated and DOIs verified before anything is shown as final. The user controls sorting (by date), year range, and how many papers are needed; the module returns a list with URL/DOI and a brief LLM explanation of relevance each.
- **Multi-session logic (chat/DSH style):** I found 9 papers, read them, want to add 7 to my project — with a specific reason as a note per paper. 50 papers → 50 notes; these notes can later be used as references/justifications in the text of the paper.
- **Honesty rule:** each note states whether it is based on the abstract or the full text. "The model read the paper" is never claimed unless the model actually received full text.

### M8 — Version control & storage

Two levels, deliberately separate:

- **Change journal (per edit):** every accepted paragraph change is recorded in the catalog's SQLite journal with old text, new text, block ID, user, time, skill used, model and instruction version, related sources. This is where "who changed what, with which rule" lives.
- **Project snapshots (per event):** a git commit on significant events only — successful compilation, export for co-authors, template change, batch of references added, submission-ready version. No commit per keystroke; compiled PDFs are saved as meaningful versions, not after every auto-compile. One git repository per project. Each snapshot includes a readable JSON description of the project metadata (which references, data records, and authors were linked at that version) instead of the binary database file.
- The co-author "database" (currently txt files with impact, ORCIDs, etc.) becomes a structured record type inside the catalog.

## 8. Sensitivity and data protection

Every project carries a sensitivity level: public, internal, sensitive, or blocked for external services. An internal policy decides per operation what follows from that level: whether a remote LLM may be used at all, whether identifying data must be stripped first, or whether only a local model may process the material. The user never picks a model; the policy does.

Local models are one option for sensitive projects. Unsloth is treated as one way to prepare or run a local model, not as the central interface of the AI subsystem: the LLM layer is provider-agnostic, and modules do not change when the provider does.

The content-is-data rule (principle 6) applies here concretely: PDFs, READMEs, student files, and imported documents are read as material; nothing inside them can instruct the conductor.

## 9. End-to-end workflows (modules in practice)

**A. Student experiment → manuscript.** Student fills the intake form in simplified mode (M5) → submission package lands in shared storage → PI imports it and reviews the enforced fields → figure + expanded caption are pulled into the relevant section (M1↔M5) → cited with a reference from the project library (M1↔M4) → compiled (M2) → snapshot versioned (M8).

**B. Rewrite with rules.** Select a paragraph (M1) → choose the writing skill/rules for the task → split pane shows the LLM rewrite alongside the original → accept-with-version records old and new text, block ID, skill, and model in the journal (M1, M8).

**C. Conductor workflow.** One sentence: "edit section N, add 2 co-authors, add 7 references, switch template MDPI→Nature" — the conductor shows a plan and preview, you confirm, it executes across M1/M4/M5/M2 with verification and one-step rollback (M6).

**D. Research session.** Prompt → filtered paper list with verified DOIs (M7) → import 7 papers with reason-notes into the project library through the verification gate (M7→M4) → notes become citation justifications in the text (M4→M1).

## 10. Where truth lives

Each kind of information has one primary home:

| Information | Primary storage |
|---|---|
| Manuscript text | .tex / .md files |
| Original experimental data | File system or existing lab storage |
| Bibliographic metadata | Zotero |
| Projects, people, forms, relations, tasks | SQLite catalog in local app data (never in a synced folder) |
| Accepted paragraph changes | Application change journal (SQLite) |
| Project history | Git, one repo per project, with readable JSON metadata snapshots |
| Compiled PDFs | Per-project artifact directory; meaningful versions only |
| Search results | Temporary cache |
| API keys and passwords | OS keychain |

The catalog is the only SQLite file on the machine and it stays local: projects are referenced by path, so a project folder on disk contains text, artifacts, and frozen copies, nothing else.

## 11. Architecture and technology

Chosen stack: **Electron + React + TypeScript**, organized as a modular monolith with adapters. One installable program, one local database, one command mechanism; editor, references, data, and compilation are separate code areas with clear interfaces, not separate processes or servers. "Independent modules" means independently developable code first, not plugins or microservices.

| Part | Choice |
|---|---|
| Desktop shell | Electron |
| Interface | React + TypeScript |
| Editor | CodeMirror 6 (LaTeX/Markdown modes, local comparison of a block to the right of the source) |
| PDF | PDF.js, with SyncTeX for text↔PDF navigation |
| Local database | SQLite (+ full-text search over notes) |
| Compilation | latexmk on TeX Live/MiKTeX; Tectonic as an alternative profile |
| Bibliography | Zotero API + Better BibTeX |
| DOCX export | Pandoc (export only) |
| Versions | Git per project + change journal |
| Scientific files | Optional Python side process, added only when automatic analysis of TIFF/CSV/Parquet is actually needed |
| LLM | Provider-agnostic layer; local and remote models without changing modules |
| Conductor connection | Allowlisted commands + external MCP adapter |

Why not the alternatives: Tauri adds a second core language (Rust) without a Rust-experienced builder; PySide/Qt fits an all-Python team but still needs web components for a modern editor and PDF view; a browser app is a poor fit for local LaTeX, git, and large files. TypeScript also has the largest ecosystem of tooling for building with AI assistance.

Adapters: the core knows that an operation exists ("add a verified reference to the project") but not the details of Zotero; the Zotero adapter translates it into API calls. The same separation holds for git, LaTeX, search APIs, LLM providers, DOCX export, and scientific file handling. Swapping one tool means rewriting one adapter.

## 12. Development plan

**Stage 0: verify the dangerous assumptions.** Six small prototypes on real projects before any large interface: (1) stable block IDs survive editing and moving of text; (2) several real journal templates compile through one profile mechanism; (3) PDF opens in-app and SyncTeX links it to the source; (4) Zotero elements become a project .bib; (5) the chosen editor supports local comparison of a paragraph to the right of the source; (6) Pandoc produces an acceptable DOCX from real papers, not demos. If one fails, the architecture changes before the system is built around it.

**Stage 1: author workbench.** The first genuinely useful version: one user, one OS, projects on local disk; .tex and .md editor; PDF view; compilation profiles; Zotero and automatic .bib; single-block rewrite; comparison and acceptance; change journal; git snapshots; PDF and basic DOCX export. This already removes most of my current tool sprawl.

**Stage 2: lab data.** Experiment forms with enforced fields and form versions; student submission packages; file catalog with checksums; co-author records; links from data to figures to paragraphs. Any file can be attached, but automatic preview covers TIFF, CSV, and Parquet first.

**Stage 3: research search.** The M7 flow: LLM terms → official APIs → dedupe → DOI verification → relevance notes → selection → Zotero import with the abstract/full-text honesty in the notes.

**Stage 4: conductor.** Built last, because it can only manage the system reliably once every module has verified commands. Working operations first; the AI learns to compose them afterwards, not the other way round.

## 13. What v1 excludes

Explicit decisions, not forgotten features: real-time multi-user editing; importing edited DOCX back into LaTeX; a third-party plugin system; an own Zotero clone; a full task manager (task assignment stays minimal: form + status); automatic understanding of arbitrary scientific formats; direct Google Scholar parsing; shell or terminal access for the conductor; guaranteed automatic switching of any journal template (verifiable migration only); a SQLite file synced between computers.

## 14. Open questions

- **Collaboration:** read-only live view for colleagues after v1? Real-time co-editing later? Exports are the current answer.
- **Task management:** v1 keeps form + status; how much of a manager is actually needed once students use packages?
- **Accounts and installs:** shared lab install vs per-user installs, decided at deployment time; students run a local simplified mode on their own machines either way.
- **Small server:** tasks, forms, statuses, users, file pointers — added only after the package flow proves what it needs.
- **To confirm before Stage 1:** what shared storage the lab has today; how students hand over data now; which OS Stage 1 targets.

## 15. Positioning and next step

The product is positioned as a lab workstation for publication preparation, developed in sequence: reliable author workbench, then lab data catalog, then research search, then autonomous conductor. Overleaf is mentioned only as what this is not: people expect install-free browser access and simultaneous co-editing from it, and the first version has neither, so the comparison would create wrong expectations.

The strongest core of the product is the verifiable chain from experiment to file to figure to paragraph to source to document version. Such a chain is harder to copy than a rewrite button, and it is what the rest of the system is built around.

Next step: run the Stage 0 prototypes on real projects (section 12), starting with stable block IDs and journal template profiles, because M1, M6, and M8 all depend on them.
