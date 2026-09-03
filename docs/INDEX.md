---
title: "Documentation Directory Index"
status: "active"
created: 2026-06-12
updated: 2026-06-12
author: "Naveen"
scribe: "Antigravity"
tags: [index, index-map]
---

# Form Builder Engine Documentation Index

Welcome to the technical documentation library for `@intuitui-labs/form-builder-engine`.

## Documentation Navigation

*   [Architecture Decision Records (ADRs)](./decisions/2026-06-12-transition-to-tanstack-form.md)
    *   [2026-06-12: Transition to TanStack Form & Multi-Step Wizard Support](./decisions/2026-06-12-transition-to-tanstack-form.md) — The rationale behind choosing TSF over RHF for headless, offline-first execution.
    *   [2026-06-20: Dynamic Exporter Codegen & Dependency Isolation](./decisions/2026-06-20-codegen-addition-and-dependency-isolation.md) — How we support React Hook Form codegen without polluting the headless package.
*   [Core Documentation](./Core/form-engine-architecture.md)
    *   [Headless Form Engine Architecture](./Core/form-engine-architecture.md) — UML Class layouts, structural interactions, and code integrations.

---

## Changelog

### [1.2.0] - 2026-06-20
#### Added
- Added `ReactCodeGen.ts` to output copy-pasteable React Hook Form & Zod schema code templates.
- Added decision record documentation for dynamic codegen.

### [1.1.0] - 2026-06-12
#### Added
*   Introduced `MultiStepFormManager.ts` state machine to coordinate step-by-step navigation, page layout extraction, and localized page-boundary validation checks.
*   Exposed `MultiStepFormManager` exports in the core engine package index.
*   Created structured `docs/` subdirectory structure complying with the platform's Documentation SOP.

#### Changed
*   Refactored `FormManager.ts` to wrap `@tanstack/form-core` instead of a custom in-memory pub-sub implementation.
*   Ported state subscription models to use TanStack Form store selectors under the hood, enhancing render performance for inputs.
