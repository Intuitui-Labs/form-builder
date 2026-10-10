# Expo SDK 58 Readiness & Dual-SDK Testing Guide

This guide documents the Expo SDK 58 upgrade path and dual-SDK testing strategy for the `@intuitui-labs/form-builder-engine` showcase application.

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
   * **Simulators / Emulators**: When you run `npx expo start` in the showcase directory and press `a` (Android) or `i` (iOS), the **Expo CLI automatically downloads and provisions the matching SDK 58 beta client** directly into the local simulator/emulator.
   * **Web Browser**: Run `npx expo start --web` or `npx expo export --platform web`. The Metro bundler compiles cleanly with zero native dependencies.
   * **Physical Devices**: On physical hardware, SDK 58 apps use Development Builds (`npx expo run:android` / `npx expo run:ios` or `eas build --profile development`) or EAS Go (`eas go`).

---

## 3. Switching Between SDK 57 and SDK 58 in Showcase

The showcase directory includes dual package manifests for instantaneous switching:
* `showcase/package.sdk57.json` (SDK 57 stable)
* `showcase/package.sdk58.json` (SDK 58 beta)

### To switch to Expo SDK 57 (Expo Go compatible):
```powershell
cd showcase
npm run use:sdk57
npm install --legacy-peer-deps
npx expo start
```

### To switch to Expo SDK 58:
```powershell
cd showcase
npm run use:sdk58
npm install --legacy-peer-deps
npx expo start --web
```

---

## 4. Verification & Health Commands

Run these checks within the `showcase` directory:

```powershell
# 1. Run Node smoke test suite against local form-builder-engine
npm test

# 2. Strict TypeScript typechecking
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; npm run typecheck

# 3. Metro Web Bundle validation
npx expo export --platform web
```

All 6 test cases in `engine.smoke.test.mjs` pass across both SDK 57 and SDK 58, confirming that the engine's validation recovery, multi-step page gating, JSON hydration, and response analytics operate identically across React Native versions.
