---
title: "PR & Upstream Collaboration Playbook"
status: "active"
created: 2026-10-17
updated: 2026-10-17
author: "Naveen"
scribe: "Antigravity"
tags: [git, pr, upstream, collaboration, ci-cd, hygiene, gihini-research]
---

# PR & Upstream Collaboration Playbook

> **Operational Directive**: Establish a safe, zero-regression protocol for collaborating on Gihini's research platform, submitting pull requests back to her repository (`Gihini-Uni/research` or `NeevSK/research`), and maintaining polyglot monorepo hygiene without breaking legacy workflows.

---

## 1. Upstream Repository Boundaries

When collaborating across repos, maintaining clear boundaries prevents accidental regressions:

```
[ Upstream Repository: Gihini-Uni/research or NeevSK/research ]
                         │
                         ▼
[ Local Working Tree: c:\projects\gihini-research ]
┌─────────────────────────────────────────────────────────────────┐
│ 1. LEGACY SURFACES (UNTOUCHED / READ-ONLY FOR COMPATIBILITY)    │
│    • surveys/views.py (server-rendered templates)               │
│    • accounts/views.py (server-rendered auth views)             │
│    • templates/ (*.html Jinja2 templates)                       │
│    • static/ (CSS, JS, assets)                                  │
│                                                                 │
│ 2. ADDITIVE REST SEAM (MODERN CLIENT CAPABILITIES)             │
│    • feedora_project/api_views.py (REST endpoints)              │
│    • feedora_project/api_urls.py (API router)                   │
│    • feedora_project/test_api.py (Automated test suite)         │
│                                                                 │
│ 3. POLYGLOT PACKAGING (STANDARDS COMPLIANT)                    │
│    • pyproject.toml (PEP 621 metadata)                          │
│    • package.json (Polyglot pnpm bridge)                        │
│    • .gitignore (Pycache and environment shielding)             │
└─────────────────────────────────────────────────────────────────┘
```

### 1.1 Invariant Rules of Engagement
1. **Never mutate legacy HTML views**: Gihini's existing survey taking flow (`/surveys/respond/{uuid}/`), her survey builder (`/surveys/new/`), and admin dashboard must remain untouched.
2. **Never alter existing database tables destructively**: Do not rename columns, delete fields, or change default constraints in `surveys/models.py` or `accounts/models.py`. Any new fields must be nullable (`null=True`) or have default values (`default=...`).
3. **Additive APIs Only**: All new endpoints must live under the versioned `/api/v1/` prefix.

---

## 2. Git Hygiene & Artifact Shielding

### 2.1 Pycache Collision Prevention
In Gihini's initial repository commits, Python bytecode files (`__pycache__/*.pyc`) were committed directly into git tracking. When Python runs on different OS versions (e.g. Windows vs Linux) or different Python versions (3.12 vs 3.14), these files cause perpetual git diff noise and merge conflicts.

**Mitigation Implemented**:
- Root `.gitignore` in `gihini-research` explicitly ignores:
  ```gitignore
  __pycache__/
  *.py[cod]
  *$py.class
  venv/
  .env
  *.sqlite3-journal
  ```
- Any tracked pycache files should be un-staged using `git rm --cached` before committing when preparing a PR.

---

## 3. Pull Request Submission Checklist

Before opening a pull request to Gihini's branch:

### Step 1: Run Full Test Verification
Execute the automated test suites across both Python and TypeScript:

```powershell
# 1. Verify Django API test suite (all 10 tests must pass)
c:\projects\gihini-research\venv\Scripts\python.exe manage.py test feedora_project.test_api

# 2. Verify through polyglot monorepo bridge
pnpm --filter gihini-research run test

# 3. Verify TypeScript engine tests (all 476 tests must pass)
pnpm test

# 4. Verify TypeScript static types (0 errors)
pnpm run check-types
pnpm --filter @intuitui-labs/feedora-showcase run typecheck
```

### Step 2: Verify Database Migration Status
Ensure no unapplied migrations exist:
```powershell
c:\projects\gihini-research\venv\Scripts\python.exe manage.py showmigrations
```

### Step 3: Inspect Git Diff
Ensure only additive files are included in the changeset:
```powershell
git status -s
```
**Permitted files in PR**:
- `feedora_project/api_views.py`
- `feedora_project/api_urls.py`
- `feedora_project/urls.py` (only the `path('api/v1/', include(...))` line)
- `feedora_project/test_api.py`
- `feedora_project/settings.py` (only `ALLOWED_HOSTS` configuration)
- `pyproject.toml`
- `.gitignore`

---

## 4. Emergency Rollback Protocol

If an upstream update causes a conflict:
1. The REST Seam is completely decoupled from Django core. Simply unlinking `path('api/v1/', include('feedora_project.api_urls'))` in `feedora_project/urls.py` instantly disables all mobile endpoints without touching any other view in the system.
2. The SQLite database retains full transactional integrity via Django's atomic transactions (`transaction.atomic()`).
