---
title: "Expo SDK 58 Readiness & Dual-SDK Architecture Guide"
status: "active"
created: 2026-10-10
updated: 2026-10-10
author: "Naveen"
scribe: "Antigravity"
tags: [expo, sdk57, sdk58, mobile, testing, pnpm]
---

# Expo SDK 58 Readiness & Dual-SDK Testing Guide

This guide documents the Expo SDK 58 upgrade path and dual-SDK testing strategy for the `@intuitui-labs/form-builder-engine` monorepo.

---

## 1. Executive Summary & Version Comparison

| Metric / Layer | Expo SDK 57 (Stable / Default) | Expo SDK 58 (Next / Beta) | Notes |
| :--- | :--- | :--- | :--- |
| **Branch Target** | `main` | `feat/expo-58-readiness` | Separate branches for stability & preview |
| **Expo Core** | `~57.0.27` | `~58.0.7` (`expo@next`) | Modules 2.0 beta included in SDK 58 |
| **React Native** | `0.86.3` | `0.88.0-rc.4` | React Native 0.88 release candidate |
| **React / React DOM** | `19.2.3` | `19.3.0` | React 19.3 runtime |
| **Expo Router** | `~57.0.25` | `~58.0.17` | Async web routes enabled by default |
| **Metro Runtime** | `~57.0.16` | `~58.0.14` | Split chunk bundling on web |
| **Form Core Dependency** | `@tanstack/form-core@^0.42.1` | `@tanstack/form-core@^0.42.1` | CVE-2024-57068 patched |
| **Mobile Client Support** | **Public Expo Go** (App Store / Play Store) | **Expo CLI / Simulators / Development Builds** | Explained below |

---

## 2. Why Expo 58 Requires "The CLI Way"

When running projects on **Expo SDK 58 beta**:
1. **App Store Expo Go Incompatibility**: The publicly distributed Expo Go app in the Apple App Store and Google Play Store only targets the current stable release (**SDK 57**). Attempting to load an SDK 58 project in standard Expo Go will fail due to native runtime mismatch.
2. **The Expo CLI Way**:
   * **Simulators / Emulators**: When you run `pnpm expo:next` (or `npx expo start` in `apps/showcase-next`) and press `a` (Android) or `i` (iOS), the **Expo CLI automatically downloads and provisions the matching SDK 58 beta client** directly into the local simulator/emulator.
   * **Web Browser**: Run `pnpm expo:next:web` (or `npx expo export --platform web`). The Metro bundler compiles cleanly with zero native dependencies.
   * **Physical Devices**: On physical hardware, SDK 58 apps use Development Builds (`npx expo run:android` / `npx expo run:ios` or `eas build --profile development`) or EAS Go (`eas go`).

---

## 3. Running Interactive Showcases with pnpm

Both showcase applications are managed as first-class hoisted workspace members in `pnpm-workspace.yaml`:
* `apps/showcase-latest` (`@intuitui-labs/showcase-latest`): Expo SDK 57 (Stable)
* `apps/showcase-next` (`@intuitui-labs/showcase-next`): Expo SDK 58 (Next / Beta)

### 1. Launch Expo Go for Expo SDK 57 (Latest):
```powershell
pnpm expo:go
# Or explicitly:
pnpm expo:latest:go
```
This executes `expo start --go` inside the `apps/showcase-latest` workspace, spins up Metro on port 8081, and prints the QR code to scan with your iOS or Android Expo Go client.

### 2. Launch Web Preview (SDK 57 Latest):
```powershell
pnpm expo:web
# Or explicitly:
pnpm expo:latest:web
```

### 3. Launch Expo SDK 58 (Next / Beta):
```powershell
# Web Preview
pnpm expo:next:web

# CLI Dev Server for Simulator / Dev Client
pnpm expo:next:start
```

---

## 4. Headless Multi-Version Matrix Testing (CI & Local)

To test the engine against both Expo SDK 57 and SDK 58 simultaneously without launching interactive UI servers or triggering network downloads:

```powershell
# Run zero-network smoke tests across both SDK 57 and SDK 58
pnpm test:matrix

# Run target-specific smoke tests
pnpm test:matrix:57
pnpm test:matrix:58
```

Both fixtures (`fixtures/expo-57` and `fixtures/expo-58`) test:
- Zod schema validation
- TanStack Form evaluation
- Submission error recovery
- JSON form hydration
- Response timing analytics
