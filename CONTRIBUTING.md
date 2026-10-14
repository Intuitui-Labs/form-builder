# Contributing to Form Builder Engine

Thank you for your interest in contributing to `@intuitui-labs/form-builder-engine`. This document details the developer environment setup, quality gates, and multi-version testing workflow.

---

## 🛠️ Development & Quality Gates

The engine requires strict TypeScript compilation, zero runtime dependency leakage into Tier 1 core, and 100% green test passes across all suites:

```bash
# 1. Typecheck Engine & Showcase Workspaces
pnpm run check-types

# 2. Run Complete Vitest Suite (37 Suites, 257 Tests)
pnpm test

# 3. Compile Production Distribution Bundle
pnpm run build

# 4. Verify Both Interactive Expo Showcases (SDK 57 & 58)
pnpm run showcase:verify
pnpm run showcase:verify:next
```

---

## 📱 Dual-SDK Native Matrix Testing

The engine is continuously verified against parallel Expo matrix fixtures to guarantee seamless operation across React Native versions:

* **Expo SDK 57 (Stable / Expo Go)**: React Native `0.86.3` / React `19.2.3`
* **Expo SDK 58 (Next / Beta)**: React Native `0.88.0` / React `19.3.0`

```bash
# Run matrix validation pipeline across both SDKs
pnpm test:matrix

# Run matrix against a specific target SDK
pnpm test:matrix:57
pnpm test:matrix:58
```

---

## 🗺️ Architecture & Decisions

* [Enterprise Form Platform Architecture & Evolution Roadmap](docs/architecture/enterprise-form-platform-roadmap.md)
* [ADR 2026-10-11: Headless-Only Scope for Embedded React Native](docs/decisions/2026-10-11-headless-only-embedded-scope.md)
* [ADR 2026-10-13: Hexagonal Experimentation & Feature Flags](docs/decisions/2026-10-13-hexagonal-experimentation-and-feature-flags.md)
* [Form UX Heuristics & Pitfalls Audit](docs/architecture/form-ux-heuristics-and-pitfalls-audit.md)
* [Multi-Version Testing Strategy](docs/architecture/multi-version-testing-strategy.md)
* [Documentation SOP](docs/docs-sop.md)

---

## 📄 Pull Request Standards

1. All new features must maintain a zero-dependency Tier 1 core. Tier 2 dependencies (Effect, XState, Zod) must be isolated behind optional subpath exports.
2. Every bug fix or feature must include regression tests.
3. Both showcase apps (`apps/showcase-latest` and `apps/showcase-next`) must build and typecheck with 0 errors before submitting PRs.
