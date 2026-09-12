# Scientific Writing Workbench — Conception

> **Status:** conception only (v2, expanded from the initial vision). Next step: architecture and technology selection.
>
> **One line:** a single client application that unifies scientific text preparation for a laboratory — writing, references, student data, compilation, research search, LLM assistance — usable by non-programmers, built on integrated existing tools rather than re-implementations. A modern alternative to Overleaf, but covering the whole lab workflow, not just collaborative LaTeX.

## 1. Background

I work in biophysics and do research in applied medicine. I am head of a laboratory and prepare texts for journal manuscripts, reports, books, guidelines, etc. Currently I use DeepSeek Harness (DSH) to work with files; mostly I compile .tex files using journals' or grants' templates. I keep data about authors in an independent file — txt files that work as a database of co-authors with information about their impact, ORCIDs, etc. I also created special protocols for my students and people who work with me: they provide their data as a folder with a README.md describing the experiment, setup, goal, motivation, plus the data source (a stack of TIFFs, or csv/parquet/pickle) or figures (with the expanded caption as an independent file). This helps me check data, workflows, and metadata. The reference manager is Zotero, but I keep a folder with all PDFs in the same project. Notes and ideas live in .tex or .md files. Version control is git plus manual saving of compiled PDFs as versions.

## 2. Problem

Two problems compound each other.

**Tool sprawl.** To prepare one manuscript I currently use DSH, LaTeX, a terminal, a PDF viewer, Zotero, PubMed and Google Scholar, and manually choose models for rewriting, planning, and construction from local provider like Unsloth Studio. Colleagues require .doc files. Student data arrives as free-form folders that I must audit manually. It is complicated and consumes time.

**Adoption cannot be enforced in a lab.** In a company you can mandate a unified data workflow (for example Teams) — IT enforces it and people comply even when it is inconvenient. In a medical/biology lab you cannot: students rotate, collaborators are external, there is no IT department behind you. So the only way to get unified data and process is to make the compliant path easier than the sloppy one. A single client where the right workflow is the default workflow solves both problems at once: it removes tool sprawl for me, and it makes structured data submission trivial for students.

## 3. Goals and non-goals

### Goals

- A single client application usable by non-programmers (students, colleagues): one window, no terminal, no model selection exposed.
- Integrate existing tools as services: Zotero via API, git, local LaTeX, LLM providers (UNSLOTH or others), DSH logic for sessions and the conductor. Users may continue using Zotero standalone or work entirely inside the client.
- Structured student data intake that replaces manual folder audits.
- Paragraph-level editing: split-pane rewrite with per-task writing skills/rules and versioned acceptance.
- Project-scoped references and data through one common tag system.
- An LLM conductor that can execute multi-step workflows ("edit section N, add 2 co-authors, add 7 new references, change template from MDPI to Nature") without the user doing it by hand.

### Non-goals (explicit)

- Not re-implementing a reference manager from scratch — Zotero remains the reference backend, accessed via API.
- Not replacing file sync or network storage (no "our own Teams"). The system owns metadata and workflow; files stay on disk where they are.
- Not a generic LLM chat product. Chat is one face of the conductor, not the center of the app.
- Not real-time collaborative editing in the first version — external colleagues get .docx/PDF exports (a live read-only view is an open question).

## 4. Users

| Role | What they need | LLM exposure |
|---|---|---|
| PI / lab head (power user) | Full control: profiles, templates, skills, conductor workflows; manages the lab's projects | Direct chat with the conductor + invisible AI buttons |
| Student / lab member | Fill intake forms, submit data, receive tasks — zero terminal or LLM knowledge | Invisible only ("submit", "check") |
| External collaborator | Receives .docx/PDF exports of the current version | None |

## 5. Core principles

1. **Integrate, don't re-implement.** Zotero, git, LaTeX, and LLM providers exist and work; the product is the integration layer that makes them one system.
2. **Invisible intelligence.** For ordinary users the LLM appears as buttons ("rewrite", "add reference", "check data"), not as a chat window or model picker. The conductor exists as a service behind those buttons; direct chat is reserved for power users.
3. **Make the compliant path easier.** Structure is enforced by the UI (forms, fields, tags), not by discipline. This is what makes unified data possible in a lab that cannot mandate anything.
4. **Local-first: own metadata and workflow, not storage.** Files (.tex, .pdf, TIFF, csv…) stay on disk; the system keeps structured records about them and git history for versions.
5. **Modules as independent units on a common spine ("injection system").** Every module plugs into shared primitives (project, tags, addressed document) and can be developed independently. Every module can be supported by an LLM with specific skills and rules — the same provider and model, different context per task.

## 6. The spine: shared primitives that connect modules

Three primitives are shared by all modules; most inter-module connections flow through them.

**Project** — the unit of work (a manuscript, report, grant, or guideline). A project owns: its addressed text, its template/compilation profile, its scoped reference library, its scoped data set, and its git history. Everything a module does is done *to* or *from* a project.

**Tag system** — one universal linking mechanism, with the same logic for references and data records. Tag a paper or a data record with `project-1` and it appears in that project's library/data view; tag it with two projects and it appears in both. Linking is by reference/symlink, never by copying files. Each project's tagged references auto-generate its .bib.

**Addressed document model** — every structural element of the text has a stable ID: `S2SS3P4L325` (section 2, subsection 3, paragraph 4, line 325). This is what makes LLM operations precise (act on an exact span, not the whole file), enables versioned replacement of individual paragraphs, and lets citations and figures be anchored to text positions.

### Connection map

| Connection | What flows between modules |
|---|---|
| Editor ↔ References | Citations inserted/updated from the project library; "add reference" from editor context |
| Editor ↔ Data store | Figure/table + expanded caption pulled from a student record into a manuscript section |
| Editor ↔ LaTeX | The template profile determines compilation; edits recompile to the PDF preview |
| Research → References | Selected papers imported into the library with per-paper notes |
| References & Data ↔ Project | Tag-based scoping without file copies; auto .bib per project |
| Conductor ↔ all modules | MCP tools exposing each module's operations; multi-step natural-language workflows |
| Version control ↔ everything | Paragraph versions in the editor; project snapshots (text + references + data metadata) |

## 7. Modules

### M1 — File editor (core)

The classical main tool to write text and check grammar and syntax (.tex, .md).

- **Paragraph addressing:** stable IDs (S2SS3P4L325) visible and usable for any operation.
- **Split-pane rewrite:** select lines → click "rewrite" → a split opens *to the right of the selection* (not a second window); text before and after stays in place. The pane is empty space where you write new text by hand or with an LLM (UNSLOTH or another provider).
- **Skills/rules per task:** calling "write with AI" / "rewrite with AI" is a prompt injection into a new temporary chat carrying the specific rules for that writing task — same provider, same model, different context. Rules are swappable per module and task; this is why the editor is built from submodules that can be developed independently.
- **Accept / accept-with-version:** accept removes the selected text and inserts the new one; "accept with version control" additionally saves the replaced paragraph as a version (git-backed).

### M2 — LaTeX compilation

Nothing fancy: profiles per journal/grant/report (template + commands). Compilation runs local LaTeX inside a sandbox of the software — an isolated process with a controlled environment, not a VM (a VM only if isolation needs grow). Compile-on-change feeds the PDF viewer; compiled PDFs are saved as versions (formalizing the current manual habit).

### M3 — PDF viewer

Embedded in the client; paired with the editor to see updates of .tex files without opening another app.

### M4 — References (Zotero integration)

- **Via Zotero API**, two modes: keep using Zotero standalone as before, or work entirely inside the client with PDFs kept in the project folder — no need to open many apps.
- General library + project libraries by tag: a paper tagged `project-1` and `project-2` is visible in both projects' independent libraries.
- Automatic .bib creation inside each project.
- Parse and add references via PubMed / arXiv / DOI.

### M5 — Data & artifacts (student intake)

- **Structured form instead of a free folder:** a student getting a task fills fields — goal, instrument, materials, motivation, data files — to add the record to the database. Enforced fields replace my manual audit; reviewing becomes checking filled structure, not reconstructing missing information.
- Accepts any data format: TIFF stacks, csv, parquet, pickle…
- **Tag system with the same logic as the reference manager:** data is linked to a "specific project database" by symlink/reference instead of real copying.
- This part is for cooperation and data control; records can be used in any project they are tagged to.

### M6 — Conductor

An LLM service layer with built-in MCP exposing commands inside the software — i.e., the operations of all other modules.

- **Invisible face:** the AI buttons inside each module (M1 rewrite, M4 add reference, M5 check data…).
- **Direct face:** a chat for power users, following DSH logic with many sessions.
- Example workflow: "edit section N in the manuscript, add 2 co-authors, add 7 new references, change template from MDPI to Nature" — executed end-to-end without the user doing it by hand. It also helps people who do not like doing things manually (for example editing a journal template).

### M7 — Research

A parser of PubMed, Scholar, and other data resources with an LLM.

- The user provides a prompt about research and an interesting field; the LLM returns keywords, the rewritten idea, and field topics. The user controls sorting (by date), year range, and how many papers are needed; the module returns a list of papers with URL/DOI and a brief explanation each.
- **Multi-session logic (chat/DSH style):** I found 9 papers, read them, want to add 7 to my project — with a specific reason as a note per paper. 50 papers → 50 notes; these notes can later be used as references/justifications in the text of the paper.

### M8 — Version control & storage

- git for text and metadata; a database for structured records (co-authors, data, references).
- The co-author "database" (currently txt files with impact, ORCIDs, etc.) becomes a structured record type inside it.
- Compiled PDFs saved as versions.

## 8. End-to-end workflows (modules in practice)

**A. Student experiment → manuscript.** Student fills the intake form (M5) → PI reviews the enforced fields → figure + expanded caption are pulled into the relevant section (M1↔M5) → cited with a reference from the project library (M1↔M4) → compiled (M2) → snapshot versioned (M8).

**B. Rewrite with rules.** Select a paragraph (M1) → choose the writing skill/rules for the task → split pane shows the LLM rewrite alongside the original → accept-with-version (M1, M8).

**C. Conductor workflow.** One sentence: "edit section N, add 2 co-authors, add 7 references, switch template MDPI→Nature" — the conductor executes across M1/M4/M5/M2 (M6).

**D. Research session.** Prompt → filtered paper list (M7) → import 7 papers with reason-notes into the project library (M7→M4) → notes become citation justifications in the text (M4→M1).

## 9. Open questions

- **Collaboration:** read-only live view for colleagues? Real-time co-editing later?
- **Task management:** students receive tasks, fill forms; data comes into the database and can be used in any project.
- **.docx round-trip depth:** export only, or import colleagues' .doc edits back too?
- **Default reference mode:** Zotero standalone vs client-local PDFs.
- **Accounts:** one shared install on a lab machine vs per-user installs.

## 10. What the conception implies for technology

Conceptual constraints to resolve in the architecture phase (no stack chosen yet):

- **Single window with editor + split pane + embedded PDF** → desktop or web client; the editor component must support stable addressing of text spans — the addressed document model (section 6) is the key early design decision, because M1, M6, and M8 all depend on it.
- **Headless LaTeX on the user's machine** → a profile is a declarative command script; compilation runs in an isolated process per project.
- **Zotero integration** → HTTP API (Zotero / Better BibTeX local server); no need to store a reference database ourselves initially.
- **LLM service layer** → provider-agnostic client (UNSLOTH or others); skills/rules as prompt packs; MCP for exposing module operations to the conductor.
- **Data & records** → SQLite-style metadata database + files on disk; tags as relations; symlinks/references for project scoping.
- **Versioning** → git repository per project (or one per lab) plus database snapshots.
- **Non-programmer UX** → one window, no terminal exposure, minimal configuration (profiles and skills managed by the PI).

## 11. Next step

Design the architecture: choose the technology stack from the constraints in section 10, starting with the two foundations every module depends on — the addressed document model and the project/tag schema.
