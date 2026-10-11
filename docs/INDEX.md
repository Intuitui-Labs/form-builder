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
*   [Architecture Documentation](./architecture/enterprise-form-platform-roadmap.md)
    *   [Enterprise Form Platform Roadmap](./architecture/enterprise-form-platform-roadmap.md) — Strategic execution pillars and architectural evolution.
    *   [Conditional Branching & Dynamic Visibility Engine](./architecture/conditional-branching-and-jump-logic.md) — Pure TypeScript rule evaluation, `visibleIf`, `jumpRules`, non-linear rewinding, and branch diversion protection.
    *   [Offline-First Persistence, Draft Management & Outbox Queue](./architecture/offline-first-persistence-and-outbox.md) — Hexagonal storage ports, debounced draft auto-saving, 14-day TTL outbox queue, and auto-reconnect synchronization.
    *   [Meaningful Progress & Rewardification Architecture](./architecture/meaningful-progress-and-rewardification.md) — Behavioral psychology, 2026 UX research findings, and hexagonal architecture for reciprocal value loops in multi-stage forms.
    *   [Enterprise Multi-Version Matrix Testing Strategy](./architecture/multi-version-testing-strategy.md) — Modern monorepo fixture, tarball packaging, and CI matrix testing architecture for cross-SDK verification.
    *   [Form UX Heuristics, Common Pitfalls & Engine Alignment Audit](./architecture/form-ux-heuristics-and-pitfalls-audit.md) — Comprehensive Baymard Institute, Nielsen Norman Group, and WCAG 1.3.5 heuristics audit, mobile keyboard traps, and engine alignment matrix.
    *   [Enterprise Mobile Form Seams & React 19 / React Native 0.86–0.88 Architecture](./architecture/enterprise-mobile-form-seams-and-react-19.md) — React 19 ref cleanup protocols, `forwardRef` deprecation, Fabric host handles, and the 5 Universal Architectural Seams for mobile forms.
*   [Core Documentation](./Core/form-engine-architecture.md)

    *   [Headless Form Engine Architecture](./Core/form-engine-architecture.md) — UML Class layouts, structural interactions, and code integrations.
    *   [Testing Architecture & Evidence Specification](./testing.md) — Evidence levels, Vitest configuration, and verification contracts.
    *   [Expo SDK 58 Readiness Guide](./EXPO_58_READINESS.md) — Dual-SDK (57/58) compatibility and CLI verification workflows.
*   [Architecture Decision Records (ADRs)](./decisions/2026-06-12-transition-to-tanstack-form.md)
    *   [2026-10-11: Headless-Only Scope for Embedded React Native & Deferring Canned UI / Cloud BaaS](./decisions/2026-10-11-headless-only-embedded-scope.md) — The rationale for maintaining pure headless separation of concerns and scoping out pre-baked UI components and direct BaaS SDKs.
    *   [2026-10-10: Enterprise Multi-Version Matrix Testing & Fixture Architecture](./decisions/2026-10-10-enterprise-matrix-testing-fixtures.md) — Transition from mutable single-folder showcases to parallel immutable fixtures and tarball pack-testing.
    *   [2026-06-12: Transition to TanStack Form & Multi-Step Wizard Support](./decisions/2026-06-12-transition-to-tanstack-form.md) — The rationale behind choosing TSF over RHF for headless, offline-first execution.
    *   [2026-06-20: Dynamic Exporter Codegen & Dependency Isolation](./decisions/2026-06-20-codegen-addition-and-dependency-isolation.md) — How we support React Hook Form codegen without polluting the headless package.

---

## Changelog

### [1.4.0] - 2026-10-11
#### Added
*   **Pillar I: Conditional Branching & Dynamic Visibility Engine**:
    *   Zero-dependency pure TypeScript `ConditionEvaluator` supporting `equals`, `contains`, `greaterThan`, `lessThan`, `in`, `isEmpty`, and nested `AND`/`OR` compound expressions.
    *   Field-level reactive visibility (`visibleIf`) with automatic validation bypass and stale-state pruning on submission (`clearValueOnHide`).
    *   Page-level dynamic jumping (`jumpRules`, `targetPageId`, `defaultNextPageId`) with accurate `stepHistory` rewinding.
    *   Branch diversion detection (`willDivertBranch()`, `hasDownstreamBranchData()`) with isolated downstream branch invalidation.
*   **Phase 2: Hexagonal Offline-First Persistence & Outbox Queue**:
    *   Outbound ports: `IStoragePort`, `INetworkStatusPort`, `ITransportPort` (0 kB core dependencies).
    *   Adapters: `MemoryStorageAdapter`, `WebStorageAdapter`, `AlwaysOnlineNetworkAdapter`, `WebNetworkStatusAdapter`, `CallbackTransportAdapter`.
    *   `DraftManager`: Debounced auto-saving on user input, session snapshot persistence, and dual auto/prompted restoration.
    *   `OfflineOutboxQueue`: Persistent FIFO queue with 14-day TTL, 50-item capacity limit, and automatic reconnection flush with exponential backoff.
    *   `FormAffordanceState.persistence`: Native UI projection of draft and sync states.
*   **Hexagonal Schema Validation**:
    *   `ISchemaValidator<T>` and `StandardSchemaV1` specifications supporting zero-dependency `PureSchemaAdapter`, `ZodSchemaAdapter`, and `StandardSchemaAdapter`.
*   **Meaningful Progress & Rewardification**:
    *   Cognitive effort calculation (`WeightedFieldProgressAdapter`), velocity estimation, and reciprocal value unlocks (`PeerBenchmarkInsightAdapter`).
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
