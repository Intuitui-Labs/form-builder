---
title: "Documentation Directory Index"
status: "active"
created: 2026-06-12
updated: 2026-10-10
author: "Naveen"
scribe: "Antigravity"
tags: [index, index-map]
---

# Form Builder Engine Documentation Index

Welcome to the technical documentation library for `@intuitui-labs/form-builder-engine`.

## Documentation Navigation

*   [Documentation SOP](./docs-sop.md) — Official standard operating procedure for platform documentation structure and YAML frontmatter.
*   [Architecture Documentation](./architecture/multi-version-testing-strategy.md)
    *   [Enterprise Multi-Version Matrix Testing Strategy](./architecture/multi-version-testing-strategy.md) — Modern monorepo fixture, tarball packaging, and CI matrix testing architecture for cross-SDK verification.
*   [Core Documentation](./Core/form-engine-architecture.md)
    *   [Headless Form Engine Architecture](./Core/form-engine-architecture.md) — UML Class layouts, structural interactions, and code integrations.
    *   [Testing Architecture & Evidence Specification](./testing.md) — Evidence levels, Vitest configuration, and verification contracts.
    *   [Expo SDK 58 Readiness Guide](./EXPO_58_READINESS.md) — Dual-SDK (57/58) compatibility and CLI verification workflows.
*   [Architecture Decision Records (ADRs)](./decisions/2026-06-12-transition-to-tanstack-form.md)
    *   [2026-06-12: Transition to TanStack Form & Multi-Step Wizard Support](./decisions/2026-06-12-transition-to-tanstack-form.md) — The rationale behind choosing TSF over RHF for headless, offline-first execution.
    *   [2026-06-20: Dynamic Exporter Codegen & Dependency Isolation](./decisions/2026-06-20-codegen-addition-and-dependency-isolation.md) — How we support React Hook Form codegen without polluting the headless package.

---

## Changelog

### [1.3.0] - 2026-10-10
#### Added
*   Added `docs/docs-sop.md` defining documentation tiers, YAML frontmatter standards, and repository lifecycle.
*   Added `docs/architecture/multi-version-testing-strategy.md` detailing enterprise multi-fixture, tarball packaging, and matrix CI testing.
*   Added `docs/EXPO_58_READINESS.md` detailing the Expo SDK 58 beta transition and CLI workflow.
*   Implemented Levels 1–4 testing matrix, hexagonal ports (`src/ports/index.ts`), and Zod v4 structural schemas (`src/schema/FormSchemaValidation.ts`).
*   Resolved submit regression and patched CVE-2024-57068 by upgrading `@tanstack/form-core` to `^0.42.1`.

### [1.2.0] - 2026-06-20
#### Added
*   Added `ReactCodeGen.ts` to output copy-pasteable React Hook Form & Zod schema code templates.
*   Added decision record documentation for dynamic codegen.

### [1.1.0] - 2026-06-12
#### Added
*   Introduced `MultiStepFormManager.ts` state machine to coordinate step-by-step navigation, page layout extraction, and localized page-boundary validation checks.
*   Exposed `MultiStepFormManager` exports in the core engine package index.
*   Created structured `docs/` subdirectory structure complying with the platform's Documentation SOP.

#### Changed
*   Refactored `FormManager.ts` to wrap `@tanstack/form-core` instead of a custom in-memory pub-sub implementation.
*   Ported state subscription models to use TanStack Form store selectors under the hood, enhancing render performance for inputs.
