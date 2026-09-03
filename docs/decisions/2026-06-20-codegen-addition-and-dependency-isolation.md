---
title: "Dynamic Exporter Codegen & Dependency Isolation"
status: "active"
created: 2026-06-20
updated: 2026-06-20
author: "Naveen"
scribe: "Antigravity"
tags: [form-engine, architecture, decisions, codegen]
---

# ADR: Dynamic Exporter Codegen & Dependency Isolation

## Context & Problem Statement

We want to allow users to build forms visually in our form builder, and also support developers who want to output static React/React Native code (similar to FormCanvas) using React Hook Form (RHF) and Zod.

However, `@intuitui-labs/form-builder-engine` is a pure JS/TS library designed to be headless, server-side runnable, and platform-agnostic. Importing `react-hook-form` or React DOM/Native framework adapters as true package dependencies would pollute the package's dependencies, bloat bundle sizes, and break server-side runtime compliance (e.g. WinterCG, Cloudflare Workers, Hono).

## Decision Outcome

**Chosen Option: Text-based Code Generation with Strict Dependency Isolation**

### Rationale:
* **Zero Dependency Pollution**: The code generator functions (`exportToStaticReact`) output standard React component code entirely as structured string templates. No imports of React or `react-hook-form` are compiled or executed at runtime by the engine.
* **Separation of Concerns**: `@intuitui-labs/form-builder-engine` remains framework-agnostic, with dependencies limited to `@tanstack/form-core` and `zod`.
* **Developer Flexibility**: Generating standard RHF/Zod code ensures developers receive clean, readable, copy-pasteable files without forcing our internal TanStack-core engine architectures onto outside frontend apps.

---

## Implementation Details

### 1. Codegen Module (`ReactCodeGen.ts`)
Created the [ReactCodeGen.ts](file:///c:/Users/Naween/projects/polymath-platform/packages/form-builder-engine/src/codegen/ReactCodeGen.ts) utility:
- Parses `FieldDefinition` metadata arrays.
- Dynamically generates a valid TypeScript file content string.
- Includes static `zod` validation schemas matching dynamic field rules.
- References `react-hook-form` strictly as a string literal (no package import).

### 2. Builder UI Integration (`FormBuilder.tsx`)
- Added a visual `'code'` tab under the sub-navigation of [FormBuilder.tsx](file:///c:/Users/Naween/projects/polymath-platform/packages/form-builder/src/FormBuilder.tsx) displaying the output of the codegen module.
- Provided a single-click "Copy to Clipboard" utility.
