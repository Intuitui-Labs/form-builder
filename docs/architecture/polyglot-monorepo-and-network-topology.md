---
title: "Polyglot Monorepo & Network Topology Architecture"
status: "active"
created: 2026-10-17
updated: 2026-10-17
author: "Naveen"
scribe: "Antigravity"
tags: [monorepo, pnpm, python, django, topology, sqlite, networking]
---

# Polyglot Monorepo & Network Topology Architecture

> **Executive Summary**: This document details the unified polyglot monorepo architecture linking the TypeScript/React Native engine (`@intuitui-labs/form-builder-engine`) with Gihini's Python Django research platform (`gihini-research`). It establishes the physical network bindings, database single-source-of-truth invariants, and cross-runtime execution bridges.

---

## 1. Monorepo Structural Blueprint

The workspace uses **PNPM v12.14** with the experimental Python package manager enabled (`pnpm-workspace.yaml`).

```
c:\projects\
├── packages\
│   └── form-builder-engine\           # TypeScript Headless Form Engine (0 kB runtime dependencies)
│       ├── apps\
│       │   ├── feedora-showcase\      # Expo SDK 58 / React Native Mobile Application
│       │   ├── showcase-latest\       # Expo SDK 57 Verification App
│       │   └── showcase-next\         # Expo SDK 58 Verification App
│       ├── services\
│       │   └── gihini-research -> c:\projects\gihini-research # Workspace symlink/junction
│       ├── pnpm-workspace.yaml        # Declares packages, apps, and Python services
│       └── package.json               # Root scripts bridging TS and Python tasks
└── gihini-research\                   # Python 3.14 Django 6.0 Research Platform
    ├── pyproject.toml                 # Standard PEP 621 packaging metadata
    ├── package.json                   # Polyglot lifecycle bridge
    ├── db.sqlite3                     # Canonical Single Source of Truth database (21 active surveys)
    ├── feedora_project\               # Project root, settings, API seam, and OpenAPI views
    ├── surveys\                       # Core research models (Survey, Question, Choice, Response)
    └── accounts\                      # User auth, CreatorProfile, RespondentProfile, and Level models
```

### 1.1 The Polyglot Bridge Mechanism

To ensure developers and CI/CD pipelines can run commands across both runtimes without manual path gymnastics, the root `package.json` in `packages/form-builder-engine` exposes zero-friction bridge scripts:

```json
{
  "scripts": {
    "research:dev": "pnpm --filter gihini-research run dev",
    "research:test": "pnpm --filter gihini-research run test",
    "research:check": "pnpm --filter gihini-research run check"
  }
}
```

In `c:\projects\gihini-research\package.json`, cross-platform Node child processes invoke the project's local virtual environment (`venv/Scripts/python.exe` on Windows, `venv/bin/python` on POSIX):

```json
{
  "name": "gihini-research",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "dev": "node -e \"const py = process.platform === 'win32' ? 'venv/Scripts/python.exe' : 'venv/bin/python'; require('child_process').spawn(py, ['manage.py', 'runserver', '0.0.0.0:8000'], { stdio: 'inherit' });\"",
    "test": "node -e \"const py = process.platform === 'win32' ? 'venv/Scripts/python.exe' : 'venv/bin/python'; require('child_process').spawnSync(py, ['manage.py', 'test'], { stdio: 'inherit' });\"",
    "check": "node -e \"const py = process.platform === 'win32' ? 'venv/Scripts/python.exe' : 'venv/bin/python'; require('child_process').spawnSync(py, ['manage.py', 'check'], { stdio: 'inherit' });\""
  }
}
```

---

## 2. Physical Network & Binding Topology

Physical devices running Expo Go or mobile simulators cannot connect to `localhost:8000` because `localhost` on mobile resolves to the mobile device itself.

```
       [ Physical Mobile Device (Expo Go) ]
               IP: 10.10.66.x
                     │
         Wi-Fi LAN   │ (HTTP / JSON REST)
                     ▼
       [ Host Machine (Developer Workstation) ]
               LAN IP: 10.10.66.76
        ┌───────────────────────────────────────────────┐
        │  Django API Server                            │
        │  Bound to: 0.0.0.0:8000                       │
        │  ALLOWED_HOSTS = ['*']                        │
        │                                               │
        │  Expo Metro Bundler                           │
        │  Bound to: 10.10.66.76:8081                   │
        │  exp://10.10.66.76:8081                       │
        └───────────────────────────────────────────────┘
```

### 2.1 Dynamic IP Resolution in Mobile Config

To prevent hardcoded IP breakages when switching networks, `apps/feedora-showcase/src/config.ts` computes the target host dynamically:

1. **Web Environment**: Resolves to `window.location.hostname:8000`.
2. **Native Environment (Expo Go)**: Extracts the Metro host IP from `Constants.expoConfig?.hostUri` or `debuggerHost`.
3. **Fallback**: Defaults to workstation LAN IP `10.10.66.76:8000`.

---

## 3. Database Single-Source-of-Truth Invariant

> [!IMPORTANT]
> Mobile clients MUST NEVER establish direct socket or database connections to the host SQLite or PostgreSQL database.

### Architectural Invariants:
1. **Single Source of Truth**: Django's SQLite database (`db.sqlite3`) remains the definitive authority for user accounts, survey definitions, questions, response records, and calculated point levels.
2. **On-Device Ephemeral Cache**: The mobile application maintains an in-memory and local cache (`IEntityStore`) purely for optimistic UI rendering, temporary draft recovery, and offline queuing.
3. **Battery-Aware Resilient Outbox**: When a respondent submits a survey while offline, answers are enqueued in `OfflineOutboxQueue` (backed by MMKV/Memory) with an idempotency token. When network reconnects and battery level $> 15\%$, requests are posted to `POST /api/v1/surveys/{uuid}/submit/`.

---

## 4. Future Scaling Traps & Roadmap

| Architectural Concern | Current Pattern | Future Scaling Risk | Mitigation Protocol |
| :--- | :--- | :--- | :--- |
| **Database Engine** | SQLite 3 (`db.sqlite3`) | Write locks during concurrent mobile survey submissions under high concurrency. | Migrate Django database setting to PostgreSQL via Docker Compose; SQLite is purely for local dev. |
| **Network Security** | `ALLOWED_HOSTS = ['*']` | Permissive host headers in production allow Host-Header poisoning and SSRF attacks. | Scope `ALLOWED_HOSTS` to `.feedora.org` and specific LAN subnets via environment variables (`DJANGO_ALLOWED_HOSTS`). |
| **Authentication Transport** | Session cookies with `credentials: 'include'` | Native mobile environments (especially iOS WKWebView or pure native fetch) sometimes discard session cookies on app termination. | Transition to dual-token architecture: Session cookies for Web + Bearer JWT / API Tokens stored in SecureStore for Native. |
| **Monorepo Boundary** | pnpm workspace directory symlink | Symlink breakage on Windows if git cloned without developer mode or elevated symlink privileges. | Replace path symlink with Git Submodule or subtree if repository is decoupled permanently. |
