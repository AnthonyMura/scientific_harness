# Scientific Writing Workbench

A lab workstation for publication preparation — one client that unifies scientific writing, references, student data, compilation, research search, and LLM assistance. Full conception: [docs/technical_description_v3.md](docs/technical_description_v3.md).

## Status

Planning. The active build plan is **workbench v0**: an Electron + React UI with a Python FastAPI sidecar — file explorer, editor, LaTeX compile targets (local / wsl / ssh), embedded PDF viewer. No LLM, no Zotero, and no block IDs in this slice. See [docs/workbench_v0_plan.md](docs/workbench_v0_plan.md).

## Documents

| Document | What it is |
|---|---|
| [docs/workbench_v0_plan.md](docs/workbench_v0_plan.md) | **Active plan** — v0 slice: architecture, API surface, milestones M0–M4 |
| [docs/technical_description_v3.md](docs/technical_description_v3.md) | Current conception and roadmap (v3) |
| [docs/technical_description_v2.md](docs/technical_description_v2.md) | Earlier conception (v2), superseded by v3 |
| [docs/technical_description_v1_original.md](docs/technical_description_v1_original.md) | Original brainstorm, kept for reference |
| [docs/reviews/gpt-sol-pro.md](docs/reviews/gpt-sol-pro.md) | Expert review (in Russian) that shaped v3 |

## Layout

- `AGENTS.md` — environment notes for agents working in this folder
- `docs/` — conception and plan documents
- `external/` — reference material not part of the project (currently: a generic full-stack web app builder skill prompt, SKILL.md)