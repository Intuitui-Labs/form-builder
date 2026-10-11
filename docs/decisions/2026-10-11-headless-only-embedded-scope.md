---
title: "ADR: Headless-Only Scope for Embedded React Native & Deferring Canned UI / Cloud BaaS"
status: "accepted"
created: 2026-10-11
updated: 2026-10-11
author: "Naveen"
scribe: "Antigravity"
tags: [decisions, architecture, headless, react-native, mobile, offline]
---

# ADR: Headless-Only Scope for Embedded React Native & Deferring Canned UI / Cloud BaaS

## Context & Problem Statement

Initial architectural roadmaps for `@intuitui-labs/form-builder-engine` proposed two companion expansions:
* **Pillar II (Drop-in UI Presets & Theming)**: Shipping pre-styled visual components (`<FormRenderer theme="material" />`).
* **Pillar IV (Cloud BaaS Connectors)**: Shipping direct client-side connectors for Supabase, Firebase, and Cloudflare Workers.

However, an engineering review of real enterprise mobile scenarios revealed that these two pillars represent false categories and anti-patterns for an embedded React Native form kernel.

## Decision Drivers

1. **Host App Design System Ownership:**
   Production React Native applications already possess established Design Systems (built on Tamagui, Gluestack, NativeWind, or proprietary Figma tokens). Canned visual UI cards and inputs create friction because product teams cannot compromise on exact brand typography, focus states, corner radiuses, and accessibility standards.
2. **Authenticated Gateway Architecture (BFF):**
   Enterprise mobile apps almost never submit form payloads directly to a third-party client-side BaaS database. Submissions must flow through the host app's authenticated API gateway or microservices with session cookies, JWT refresh lifecycles, and tenant telemetry.
3. **Zero-Bloat Headless Engine:**
   Shipping UI styling and cloud SDKs would bloat the bundle, introduce brittle peer dependencies, and create native linking headaches across Expo and bare React Native.

## Considered Alternatives

1. **Monolithic Full-Stack Form Suite (Engine + UI + BaaS SDKs)** (Rejected): Heavy, high maintenance rot, opinionated styling conflicts, and vendor lock-in.
2. **Multi-Package Monorepo (`@intuitui-labs/form-builder-ui`, `@intuitui-labs/form-builder-supabase`)** (Deferred): Can be built in the future if standalone consumer demand arises, but out of scope for the core engine.
3. **Pure Headless Kernel with Hexagonal Outbox & Traversal Metadata** (Accepted): Focus 100% on what host apps cannot easily build themselves: dynamic multi-path branching, async persistence, offline FIFO queuing, keyboard focus traversal metadata, and hydration state.

## Decision Outcome

We decided to **scope out Pillars II and IV from the core engine** and focus strictly on an ultra-resilient, 100% headless form state and offline kernel:

1. **Pure Presentation Independence:**
   The engine exposes reactive state (`useAffordanceState`, `getVisibleFields`) and focus metadata (`getStepFocusPlan`), leaving JSX and styling completely to the host application.
2. **Clean Transport Boundary:**
   Submissions are handled via `onSubmit: (values) => Promise<void>` or `CallbackTransportAdapter`. The host app retains complete control over network headers, authentication, and endpoints.
3. **React Native-Specific Ergonomics Solved:**
   * **Async Hydration Readiness (`isHydrated: boolean`)**: Exposes whether asynchronous storage reading (e.g. `AsyncStorage`, `MMKV`) has finished, eliminating screen flash/flicker on launch.
   * **Ref-Based Keyboard Traversal (`StepFocusPlan`)**: Returns `traversalOrder` and `returnKeyTypes` so host RN components can map them to React `useRef` without DOM APIs.
   * **Multiline Return Key Protection**: Textareas are guarded with `returnKeyType: 'default'` to preserve carriage return newlines.
   * **Offline FIFO Outbox Queue (`OfflineOutboxQueue`)**: Buffers submissions when offline, with automatic replay upon network reconnection.

## Consequences

### Positive
* **Zero UI Bloat**: The package remains lean with zero React Native styling or native component dependencies.
* **100% Embeddable**: Fits seamlessly into any Expo SDK 57/58, bare React Native, Next.js, or web application.
* **Architecture Purity**: Clear separation of concerns between business logic/branching/offline state and presentation.

### Negative
* Developers must wire their own `<TextInput>` and button components (supported by our documented quickstart examples and showcase).
