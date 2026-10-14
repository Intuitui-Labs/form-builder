---
title: "ADR: Hexagonal Experimentation & Feature Flagging Architecture"
status: "accepted"
created: 2026-10-13
updated: 2026-10-13
author: "Naveen"
scribe: "Antigravity"
tags: [decisions, architecture, experimentation, feature-flags, a-b-testing, hexagonal]
---

# ADR: Hexagonal Experimentation & Feature Flagging Architecture

## Context & Problem Statement

Modern enterprise applications require high-velocity A/B testing and feature flagging across form funnels (e.g., testing multi-step wizards vs. single-page layouts, reordering steps to minimize drop-off, testing micro-copy and validation rules).

However, introducing experimentation directly into a core headless form engine poses severe architectural risks:
1. **Bundle Bloat & Vendor Lock-In**: Importing SDKs for LaunchDarkly, Statsig, GrowthBook, PostHog, or Vercel Flags pollutes the core kernel with heavy transitive dependencies and unstable APIs.
2. **Flash of Incorrect Content (FOIC)**: Asynchronous network-dependent flag resolution triggers unmounting and re-rendering, erasing user keystrokes mid-flow.
3. **Mid-Session Variant Thrashing**: Mutating user context attributes (e.g. typing email) can re-bucket an active form session, flipping step layouts mid-input.
4. **False Exposure Over-Reporting**: Evaluating schemas at parse-time logs exposure events for steps the user never actually sees, invalidating experiment statistical power.
5. **Cross-Variant Draft Poisoning**: Resuming an offline draft created on Variant A inside Variant B can cause validation crashes or silent field drops.

## Decision Drivers

1. **0 kB Core Footprint**: Zero external dependencies added to `@intuitui-labs/form-builder-engine`.
2. **Synchronous Evaluation Contract**: Guarantees zero FOIC or layout thrashing within the render loop.
3. **OpenFeature & Modern Flag Compatibility**: Seamless 3-line interoperability with CNCF OpenFeature, Vercel Flags SDK, Statsig, GrowthBook, PostHog, and LaunchDarkly.
4. **Form Session Sticky Lock**: Absolute immutability of variant assignments for the lifespan of an active form instance.
5. **Decoupled Exposure Tracking**: Exposures are triggered strictly when the target step/field becomes active in the viewport.
6. **Cross-Variant Draft Lineage**: Persistent tagging of `experimentKey` and `variantId` in drafts and submission envelopes.

## Decision Outcome

We decided to implement the **Hexagonal Experimentation & Feature Flag Architecture**:

1. **Outbound Port (`IExperimentPort`)**:
   * OpenFeature-compatible contracts: `isEnabled`, `getVariant`, `resolveDetails`, and optional `trackExposure`.
   * Standardized `ExperimentContext` supporting `userId`, `sessionId`, `tenantId`, `country`, `devicePlatform`, and arbitrary targeting attributes.
2. **Three Core Zero-Dependency Adapters**:
   * `MemoryExperimentAdapter`: Static in-memory dictionary for local testing, CI, and developer overrides.
   * `DeterministicHashExperimentAdapter`: Offline consistent hashing algorithm (DJB2) mapping `(id + experimentKey)` to 0–99 buckets with configurable weights.
   * `CallbackExperimentAdapter`: Universal bridge adapter connecting Vercel Flags, Statsig, GrowthBook, or PostHog in 3 lines.
3. **Experiment Hydrator (`ExperimentFormHydrator`)**:
   * Full schema variant selection (`selectSchema`).
   * Schema patch overrides (`patchSchema`).
   * Instance-level sticky locking preserving state across context changes.
   * `validateDraftCompatibility` rejecting or warning on mismatched drafts.
4. **Analytics Cohort Integration (`AnalyticsEngine.aggregateByVariant`)**:
   * Automatically segments response rates and metrics by experiment variant.

## Consequences

### Positive
* **No Vendor Lock-In**: Product teams can swap feature flag providers (e.g. from LaunchDarkly to Statsig or Vercel Flags) without modifying any form schemas or engine code.
* **Resilience**: Zero network round-trips required during form execution; offline users receive deterministic consistent bucketing.
* **Data Integrity**: Zero exposure contamination and zero draft corruption across variant changes.

### Negative
* Host applications that use async remote configuration must precompute or seed flags prior to form hydration to benefit from synchronous evaluation guarantees.
