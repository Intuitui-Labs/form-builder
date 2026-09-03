---
title: "Transition to TanStack Form & Multi-Step Wizard Support"
status: "active"
created: 2026-06-12
updated: 2026-06-12
author: "Naveen"
scribe: "Antigravity"
tags: [form-engine, architecture, core]
---

# ADR: Transition to TanStack Form & Multi-Step Wizard Support

## Context & Problem Statement

The original dynamic form builder state engine (`FormManager.ts`) utilized a custom Publish-Subscribe pattern. While lightweight, this hand-rolled model lacked a structured framework for complex field validation, touched/dirty state tracking, and was difficult to extend for dynamic multi-step form navigation (wizard routing) without substantial boilerplates.

We needed a performant, type-safe library to power form states, with two constraints:
1. **Framework Agnostic**: The core engine must be publishable and usable in node servers or alternative frameworks without React dependencies.
2. **Dynamic UI Rendering**: The layout dynamically builds forms based on database JSON schemas, rather than compile-time static schemas.

## Considered Options

1. **React Hook Form (RHF)**: De facto React standard, but tightly coupled to React hooks and rendering cycle. Impossible to run in non-React microservices.
2. **Formik**: Performance is poor on mobile (re-renders the entire tree on every keystroke).
3. **TanStack Form (TSF)**: Framework-agnostic store system (`@tanstack/form-core`) with separate framework adapters.

## Decision Outcome

**Chosen Option: TanStack Form (`@tanstack/form-core` and `@tanstack/react-form`)**

### Rationale:
* **Decoupled State**: Allows `@intuitui-labs/form-builder-engine` to depend purely on `@tanstack/form-core`, keeping the engine pure JS/TS (publishable and server-side ready).
* **Fine-Grained Performance**: Store-based state updates prevent unnecessary React Native component re-renders.
* **Dynamic-Friendliness**: Can easily adapt dynamically computed keys and values at runtime using headless API primitives.

---

## Implementation Details

### 1. FormManager wrapping TanStack Form
`FormManager` now wraps a TanStack `Form` instance:
* `FormManager.subscribe()` subscribes directly to the underlying TanStack Form store.
* Standard dynamic fields are mapped to `defaultValues` on instantiation.
* Retains compatibility with validation utilities in `ValidationEngine`.

### 2. MultiStepFormManager
A new controller `MultiStepFormManager` was added to handle page-by-page wizard validation:
* Flattens fields across all pages of the `FormSchema` into a single form store.
* Tracks step progression (`nextStep()`, `prevStep()`, `goToStep()`).
* Isolates and validates only the fields belonging to the current active step before allowing progression.
