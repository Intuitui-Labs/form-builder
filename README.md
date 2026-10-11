# Form Builder Engine (`@intuitui-labs/form-builder-engine`)

[![CI](https://github.com/intuitui-labs/form-builder/actions/workflows/ci.yml/badge.svg)](https://github.com/intuitui-labs/form-builder/actions/workflows/ci.yml)
[![Matrix Tests](https://github.com/intuitui-labs/form-builder/actions/workflows/matrix-test.yml/badge.svg)](https://github.com/intuitui-labs/form-builder/actions/workflows/matrix-test.yml)
[![npm](https://img.shields.io/npm/v/@intuitui-labs/form-builder-engine?style=flat-square&color=2563EB)](https://www.npmjs.com/package/@intuitui-labs/form-builder-engine)
[![Downloads](https://img.shields.io/npm/dm/@intuitui-labs/form-builder-engine?style=flat-square&color=059669)](https://www.npmjs.com/package/@intuitui-labs/form-builder-engine)
[![Bundle Size](https://img.shields.io/bundlephobia/minzip/@intuitui-labs/form-builder-engine?style=flat-square&color=7C3AED)](https://bundlephobia.com/package/@intuitui-labs/form-builder-engine)
[![Expo SDK 57 | 58](https://img.shields.io/badge/Expo-SDK%2057%20(Expo%20Go)%20%7C%20SDK%2058-4630EB?style=flat-square&logo=expo&logoColor=white)](https://expo.dev/)
[![React Native](https://img.shields.io/badge/React_Native-0.86%2B-61DAFB?style=flat-square&logo=react&logoColor=white)](https://reactnative.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-7.0.2-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Vitest 5](https://img.shields.io/badge/tested_with-Vitest_5-729B1B?style=flat-square&logo=vitest&logoColor=white)](https://vitest.dev/)
[![TanStack Form](https://img.shields.io/badge/TanStack_Form-v0.42.1-FF4154?style=flat-square&logo=react&logoColor=white)](https://tanstack.com/form)
[![Zod](https://img.shields.io/badge/Validation-Zod_v4-3E67B1?style=flat-square&logo=zod&logoColor=white)](https://zod.dev/)
[![Standard Schema](https://img.shields.io/badge/Standard_Schema-v1_Compatible-10B981?style=flat-square)](https://standardschema.dev/)
[![License: MIT](https://img.shields.io/badge/License-MIT-D97706?style=flat-square)](https://opensource.org/licenses/MIT)

> **Headless, schema-driven form evaluation, validation, offline-first persistence, and analytics engine for React Native, Expo, and Web — powered by TanStack Form and Hexagonal Architecture.**

`@intuitui-labs/form-builder-engine` is an enterprise embeddable form kernel designed to power dynamic multi-step wizards, surveys, and complex intake flows on mobile devices without tying your runtime to DOM or framework-specific UI elements.

---

## 🌟 Key Architecture Capabilities

* ⚡ **Zero-Dependency Core (0 kB bundle overhead)**: Pure TypeScript condition evaluator and default schema validator (`PureSchemaAdapter`).
* 🔀 **Conditional Branching & Reactive Visibility**: Deterministic field `visibleIf` rules and dynamic page `jumpRules` with non-linear history rewinding and branch diversion protection.
* 📦 **Offline-First Persistence & Outbox Sync**: Hexagonal storage ports (`IStoragePort`, `INetworkStatusPort`), debounced draft auto-saving, and durable offline FIFO outbox queue with 14-day TTL and auto-reconnection flush.
* 🎯 **Native Focus Controller & React 19 Protocol**: Callback ref cleanup closures conforming to React 19 / RN 0.86–0.88, Fabric host handles, step auto-focusing (`focusFirstInvalid`), and 60 FPS fine-grained keystroke selectors (`subscribeToField`).
* 💎 **Meaningful Progress & Rewardification**: Cognitive effort weighting (`WeightedFieldProgressAdapter`), velocity estimation, and reciprocal value unlocks (`PeerBenchmarkInsightAdapter`).
* 🔌 **Hexagonal Validation Architecture**: Swappable schema validators via `ISchemaValidator` supporting Standard Schema v1 (Valibot, ArkType), Zod v4, and 0 kB Pure TypeScript.
* 📱 **Native-First & Multi-Version Verified**: Tested across parallel **Expo SDK 57** (React Native 0.86 / React 19.2) and **Expo SDK 58** (React Native 0.88 / React 19.3) matrix fixtures.


---

## 📱 Native Renderer in Action

The engine is intentionally **headless**, allowing you to bring your own design system or native components. 

Below is the engine driving our live **React Native & Expo SDK 57/58 Showcase** (`showcase/`), managing multi-page intake, dynamic branching, localized validation boundaries, and instant offline recovery:

<p align="center">
  <img src="showcase/artifacts/final-preview.png" alt="React Native & Expo Form Engine Showcase" width="420" />
</p>

### Try the Live Showcase on Your Device
```bash
# Clone and run directly in Expo Go on iOS or Android:
pnpm expo:go

# Or preview in your browser:
pnpm expo:web
```

---

## 📦 Installation & Setup

Install the published package and its peer dependencies (`@tanstack/form-core` and optional `zod`):

```bash
# React Native / Expo projects:
npx expo install @intuitui-labs/form-builder-engine @tanstack/form-core zod

# pnpm:
pnpm add @intuitui-labs/form-builder-engine @tanstack/form-core zod

# npm:
npm install @intuitui-labs/form-builder-engine @tanstack/form-core zod

# yarn:
yarn add @intuitui-labs/form-builder-engine @tanstack/form-core zod
```

---

## 🚀 Quickstarts & Guides

### 1. Basic Multi-Step Native Form
Drive native `TextInput`, `Pressable`, and pagination state directly from a JSON schema:

```tsx
import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native';
import { MultiStepFormManager } from '@intuitui-labs/form-builder-engine';
import type { FormSchema } from '@intuitui-labs/form-builder-engine/schema';

const schema: FormSchema = {
  v: '1.0',
  id: 'customer-intake',
  tenantId: 'tenant-enterprise',
  title: 'Onboarding Flow',
  pages: [
    {
      id: 'step-contact',
      title: 'Contact Information',
      fields: [
        {
          id: 'f-email',
          name: 'email',
          type: 'email',
          label: 'Email Address',
          required: true,
          order: 0,
          rules: [{ type: 'email', message: 'Enter a valid email' }]
        }
      ]
    }
  ],
  settings: {},
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString()
};

export function IntakeScreen() {
  const [manager] = useState(() => new MultiStepFormManager(schema, async (values) => {
    console.log('Submitted successfully:', values);
  }));

  const [, setTick] = useState(0);
  useEffect(() => manager.subscribe(() => setTick(t => t + 1)), [manager]);

  const activePage = manager.getCurrentPage();
  const formState = manager.getFormManager().getState();

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{activePage.title}</Text>
      {activePage.fields.map(field => (
        <View key={field.id} style={styles.fieldGroup}>
          <Text style={styles.label}>{field.label}</Text>
          <TextInput
            style={styles.input}
            value={String(formState.values[field.name] ?? '')}
            onChangeText={(val) => manager.getFormManager().setFieldValue(field.name, val)}
          />
        </View>
      ))}
      <Pressable style={styles.button} onPress={() => manager.submit()}>
        <Text style={styles.buttonText}>Submit</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20 },
  title: { fontSize: 20, fontWeight: '700', marginBottom: 16 },
  fieldGroup: { marginBottom: 12 },
  label: { fontSize: 14, fontWeight: '600', marginBottom: 4 },
  input: { borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 8, padding: 12 },
  button: { backgroundColor: '#2563EB', padding: 14, borderRadius: 8, alignItems: 'center' },
  buttonText: { color: '#FFF', fontWeight: '600' }
});
```

---

### 2. Conditional Branching & Dynamic Visibility
Fields react in real-time, and wizard steps jump dynamically based on answers:

```json
{
  "pages": [
    {
      "id": "step-plan",
      "title": "Select Plan",
      "fields": [
        {
          "name": "planType",
          "type": "select",
          "label": "Account Tier",
          "required": true
        },
        {
          "name": "enterpriseDomain",
          "type": "text",
          "label": "Corporate SSO Domain",
          "required": true,
          "visibleIf": {
            "field": "planType",
            "operator": "equals",
            "value": "enterprise"
          },
          "clearValueOnHide": true
        }
      ],
      "jumpRules": [
        {
          "condition": { "field": "planType", "operator": "equals", "value": "enterprise" },
          "targetPageId": "step-enterprise-setup"
        }
      ]
    }
  ]
}
```

* **Stale State Pruning**: Hidden fields automatically bypass validation. If toggled off, values are cleanly pruned on `submit()` while preserving draft answers in memory.
* **Diversion Protection**: Revisiting a branching step exposes `manager.willDivertBranch()`, allowing the host UI to confirm before resetting invalidated branch data.

---

### 3. Hexagonal Offline-First Persistence & Outbox Queue
Connect your host app's existing storage (MMKV, AsyncStorage, Expo SQLite) without bundle bloat:

```typescript
import { MultiStepFormManager } from '@intuitui-labs/form-builder-engine';
import type { IStoragePort, INetworkStatusPort } from '@intuitui-labs/form-builder-engine/ports';
import NetInfo from '@react-native-community/netinfo';
import { MMKV } from 'react-native-mmkv';

const mmkv = new MMKV();

// 1. Host storage adapter (zero external dependencies in engine)
const storage: IStoragePort = {
  getItem: (key) => mmkv.getString(key) ?? null,
  setItem: (key, val) => mmkv.set(key, val),
  removeItem: (key) => mmkv.delete(key),
};

// 2. Host network monitor
const networkStatus: INetworkStatusPort = {
  isOnline: async () => (await NetInfo.fetch()).isConnected ?? true,
  subscribe: (cb) => NetInfo.addEventListener((s) => cb(s.isConnected ?? true)),
};

// 3. Initialize manager with debounced drafts & outbox
const manager = new MultiStepFormManager(schema, handleSubmit, {
  storage,
  networkStatus,
  autoSaveDraft: true,
  draftDebounceMs: 500,
  autoRestoreDraft: false, // Prompt user via manager.restoreDraft()
  enableOutbox: true,      // 14-day TTL, 50-item limit, auto-reconnect flush
});
```

Inspect reactive persistence state at any time via `manager.getAffordanceState().persistence`:
```typescript
const { persistence } = manager.getAffordanceState();
// persistence.hasSavedDraft     => true | false
// persistence.pendingOutboxCount => number
// persistence.isOnline           => true | false
// persistence.syncStatus         => 'idle' | 'saving' | 'offline-queued' | 'syncing' | 'synced' | 'error'
```

---

### 4. Meaningful Progress & Behavioral Affordances
Replace mechanical `Step 1 of 5` bars with cognitive effort weighting, velocity time estimation, and reciprocal rewards:

```typescript
const manager = new MultiStepFormManager(schema, handleSubmit, {
  affordanceConfig: {
    preset: 'frictionless-onboarding',
    progress: 'weighted-velocity', // Cognitive effort & time estimation
    navigation: 'visited-only',    // Allow random access to completed steps
  },
});

const { progress, breadcrumbs } = manager.getAffordanceState();
console.log(progress.percentage); // e.g. 35
console.log(progress.estimatedTimeRemainingText); // "~2 min remaining"
```

---

## 📦 Tree-Shakable Subpath Exports

Import only the exact modules your platform requires:

| Subpath | Description |
| :--- | :--- |
| `@intuitui-labs/form-builder-engine` | Root export: `FormManager`, `MultiStepFormManager`, `ConditionEvaluator`. |
| `@intuitui-labs/form-builder-engine/schema` | Schema definitions, `ComparisonOperator`, `visibleIf`, `jumpRules`, `FormDraftSnapshot`. |
| `@intuitui-labs/form-builder-engine/ports` | Hexagonal port contracts: `IStoragePort`, `INetworkStatusPort`, `ITransportPort`, `ISchemaValidator`. |
| `@intuitui-labs/form-builder-engine/adapters` | Built-in adapters: `MemoryStorageAdapter`, `WebStorageAdapter`, `CallbackTransportAdapter`. |
| `@intuitui-labs/form-builder-engine/persistence` | Persistence engine: `DraftManager`, `OfflineOutboxQueue`. |
| `@intuitui-labs/form-builder-engine/affordance` | Affordance engine: `WeightedFieldProgressAdapter`, `LinearStepProgressAdapter`, presets. |
| `@intuitui-labs/form-builder-engine/validation` | `ValidationEngine`, `applyRule`. |
| `@intuitui-labs/form-builder-engine/hydration` | `FormHydrator`, custom validator registry. |
| `@intuitui-labs/form-builder-engine/analytics` | Telemetry funnels, response aggregators, CSV/Excel export. |
| `@intuitui-labs/form-builder-engine/codegen` | Dynamic static React & Zod code exporter. |

---

## 🛠️ Development & Quality Gates

The engine uses strict TypeScript compilation and Vitest 5:

```bash
# Strict TypeScript Typecheck
pnpm run check-types

# Full Unit Test Matrix (98 Tests)
pnpm test

# Dual-SDK Native Matrix Pipeline (Expo SDK 57 & 58 Fixtures)
pnpm test:matrix

# Compile Production Distribution Bundle
pnpm run build
```

---

## 🗺️ Architectural Roadmap
See our full [Enterprise Form Platform Architecture & Evolution Roadmap](docs/architecture/enterprise-form-platform-roadmap.md) and [ADR 2026-10-11: Headless-Only Scope for Embedded React Native](docs/decisions/2026-10-11-headless-only-embedded-scope.md):
* **Pillar I**: Dynamic conditional branching & jump rules &rarr; **✅ Shipped & Verified**
* **Pillar III / Phase 2**: Hexagonal offline-first persistence & outbox sync &rarr; **✅ Shipped & Verified**
* **Pillar II (Drop-in UI)** & **Pillar IV (BaaS Connectors)**: Scoped out to preserve zero bundle bloat and 100% host design system ownership &rarr; **✅ Formally Decided in ADR**

---

## 📚 Technical Documentation Library
* [ADR: Headless-Only Scope for Embedded React Native](docs/decisions/2026-10-11-headless-only-embedded-scope.md)
* [Form UX Heuristics, Common Pitfalls & Engine Alignment Audit](docs/architecture/form-ux-heuristics-and-pitfalls-audit.md)
* [Conditional Branching Architecture](docs/architecture/conditional-branching-and-jump-logic.md)
* [Offline-First Persistence & Outbox Queue](docs/architecture/offline-first-persistence-and-outbox.md)
* [Meaningful Progress & Rewardification Architecture](docs/architecture/meaningful-progress-and-rewardification.md)
* [Enterprise Multi-Version Matrix Testing Strategy](docs/architecture/multi-version-testing-strategy.md)
* [Documentation SOP](docs/docs-sop.md)

---

## 📄 License
MIT © Intuitui Labs & Neev Foundation.
