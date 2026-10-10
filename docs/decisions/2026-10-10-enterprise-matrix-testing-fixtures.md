---
title: "ADR: Enterprise Multi-Version Matrix Testing & Fixture Architecture"
status: "active"
created: 2026-10-10
updated: 2026-10-10
author: "Naveen"
scribe: "Antigravity"
tags: [decisions, architecture, testing, expo, matrix]
---

# ADR: Enterprise Multi-Version Matrix Testing & Fixture Architecture

## Context & Problem Statement

To verify `@intuitui-labs/form-builder-engine` across multiple major framework versions (specifically **Expo SDK 57** and **Expo SDK 58**), earlier workflows relied on an ad-hoc single-showcase pattern:
* Manually copying manifest files (`package.sdk57.json` $\leftrightarrow$ `package.sdk58.json`).
* Re-downloading node dependencies via `npm install --legacy-peer-deps` on every switch.
* Running tests inside a local gitignored folder using relative file symlinks (`file:..`).

This shallow workflow was slow, created uncommitted state drift, risked lockfile corruption, hid real packaging/export defects, and could not be run in automated parallel CI pipelines.

## Decision Drivers

1. **Deterministic Execution**: Zero dynamic network downloads during local test runs.
2. **True Consumer Simulation**: Testing authentic `.tgz` npm tarballs emitted by `pnpm pack` rather than symlinks.
3. **Parallelism**: Testing Expo SDK 57 and SDK 58 side-by-side in parallel in seconds.
4. **CI Integration**: Native integration with GitHub Actions `strategy.matrix`.

## Considered Alternatives

1. **Single mutable showcase directory** (Rejected): Slow, fragile, destructive to caches, and cannot test multiple versions concurrently.
2. **Dynamic dependency resolution in CI via `npx expo install`** (Rejected): Flaky in CI due to upstream network latency and non-deterministic package resolution.
3. **Dedicated Immutable Parallel Fixtures with Pack-and-Test Runner** (Accepted): Standard pattern used by Software Mansion, Callstack, and Expo.

## Decision Outcome

We decided to adopt the **Parallel Immutable Fixture & Tarball Pack-and-Test Architecture**:

1. **Parallel Fixture Workspaces**:
   * Established `fixtures/expo-57/` pinned to Expo SDK 57, React Native 0.86, and React 19.2.
   * Established `fixtures/expo-58/` pinned to Expo SDK 58, React Native 0.88-rc, and React 19.3.
2. **Tarball Packaging Pipeline**:
   * Root scripts invoke `pnpm pack` to generate `@intuitui-labs/form-builder-engine-<version>.tgz` into `.tarball/`.
   * Runner unpacks and verifies the authentic package directly against fixture environments.
3. **Unified Runner**:
   * Added `scripts/run-matrix-test.mjs` providing `pnpm test:matrix`, `pnpm test:matrix:57`, `pnpm test:matrix:58`, and `pnpm clean:fixtures`.
4. **CI/CD Quality Gate**:
   * Deployed `.github/workflows/matrix-test.yml` running parallel matrix jobs across both fixtures on every PR.

## Consequences

### Positive
* **Speed**: Complete multi-version matrix execution runs in $<3$ seconds locally.
* **Zero Bloat**: No repeated multi-hundred-megabyte npm downloads.
* **Packaging Integrity**: Catches missing files in `dist`, subpath export mistakes in `package.json`, and broken imports before publishing.
* **Audit Compliance**: Fixtures are fully tracked, reviewed, and audited.

### Negative
* New major Expo versions (e.g. SDK 59 in the future) require adding a corresponding `fixtures/expo-59/` workspace rather than editing a single manifest.
