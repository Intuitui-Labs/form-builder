---
title: "Documentation SOP (Standard Operating Procedure)"
status: "active"
created: 2026-06-10
updated: 2026-10-10
author: "Naveen"
scribe: "Antigravity"
tags: [standards, documentation, sop]
---

# Polymath Platform Documentation SOP (Standard Operating Procedure)

This document establishes the official standard for creating, maintaining, and organizing technical documentation across all applications and packages . All developers and agents must adhere to these rules.

---

## 0. Scope, Tiers & Exemptions

**In scope:** every tracked `.md` file under `apps/`, `packages/`, `docs/`, and the repository root (`README.md`, `AGENTS.md`).

**Exempt from frontmatter requirement** (third-party or machine-owned files; do not add frontmatter — it will be overwritten or breaks tooling):

| Path | Reason |
|---|---|
| `.agents/**` | Vendored agent skills with their own conventions |
| `.claude/**` | Vendored Claude skills |
| `.changeset/**` | Changesets tooling boilerplate |
| `node_modules/**` | Not ours |

### Documentation tiers

Every in-scope document belongs to exactly one tier, decided by deterministic signals (filename date prefix, folder, frontmatter `status`):

| Tier | Signals | Maintenance contract |
|---|---|---|
| **Living** | Static kebab-case name; READMEs, guides, SOPs, INDEX, CONTEXT files | Must stay accurate. Audit on every structural repo change; `updated:` reflects last real review. |
| **Historical** | `YYYY-MM-DD-` prefix, or lives under `current_progress/`, `old_docs/`, `decisions/` | Point-in-time record. Never content-edit after the fact; frontmatter must exist but is allowed to age. |
| **Generated** | Output of a generator (e.g. `docs/stack-map/landscape/*.md`, `catalog/*.md`) | Exempt from frontmatter. Never hand-edit; regenerate via owning script. The generator's README documents ownership. |

Ambiguous files default to Living. Re-classify by renaming/folder move, never by editing history.

---

## 1. Directory Structure

All documentation must be placed in one of the following subdirectories under the respective package or application's `docs/` folder based on its purpose:

```text
docs/
├── docs-sop.md                 # This document (rules and guidelines)
├── INDEX.md                    # Central index and chronological changelog
├── architecture/               # System design, data engines, security models, schemas
├── decisions/                  # ADRs (Architecture Decision Records)
├── current_progress/           # Active plans, task lists, current implementations
│   └── old_docs/               # Timeframe-based historical archives (e.g. Q1-2026)
├── infra/                      # CI/CD, builds, release checklists, environment setup
└── Core/                       # Core package/app logic, engine details, UI doctrine
```

---

## 2. Document Naming Convention

We use a dual-naming convention to keep references clean while ensuring chronological visibility:

### A. Static Reference Documents
* **Purpose**: General guides, playbooks, specifications, and files that are continuously updated as the source of truth.
* **Naming**: Flat kebab-case without dates.
* **Example**: `/docs/architecture/multi-version-testing-strategy.md`, `/docs/Core/form-engine-architecture.md`

### B. Point-in-time / Historical Documents
* **Purpose**: Audit reports, progress plans, architectural proposals (RFCs), and ADRs.
* **Naming**: Prefix with the creation date `YYYY-MM-DD-file-title.md`.
* **Example**: `/docs/decisions/2026-06-12-transition-to-tanstack-form.md`, `/docs/decisions/2026-06-20-codegen-addition-and-dependency-isolation.md`

---

## 3. Mandatory YAML Frontmatter

Every markdown file must start with a YAML block. Copy and customize this template for every new file:

```yaml
---
title: "Document Title"
status: "active" | "draft" | "superseded" | "deprecated"
created: YYYY-MM-DD
updated: YYYY-MM-DD
author: "Naveen" # Primary author
scribe: "Antigravity" # Agent scribe (if generated/maintained by AI)
tags: [package, testing, architecture]
superseded_by: "relative/path/to/newer-doc.md" # Optional
---
```

---

## 4. Lifecycle & Archiving Strategy

* **Active Documents**: Remain in their context directories and have `status: active`.
* **Superseded ADRs**: Keep in the `decisions/` directory to preserve structural history. Update the frontmatter:
  ```yaml
  status: "superseded"
  superseded_by: "decisions/2026-XX-XX-new-adr.md"
  ```
  And add a notice block at the top of the file linking to the replacement.
* **Transient Implementation Plans**: Once a feature is deployed and finalized, move the implementation file from `current_progress/` to `current_progress/old_docs/` to keep the active work environment clean.
