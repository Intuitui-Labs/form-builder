---
title: "Package Badges & Metrics Specification"
status: "active"
created: 2026-10-10
updated: 2026-10-10
author: "Naveen"
scribe: "Antigravity"
tags: [badges, metrics, npm, github, shields]
---

# Package Badges & Metrics Specification

This document details the official badge suite, health indicators, and telemetry metrics for **`@intuitui-labs/form-builder-engine`**.

---

## 1. Badge Matrix Overview

| Category | Vendor / Source | Badge URL / Preview | Target URL |
| :--- | :--- | :--- | :--- |
| **Build & CI** | GitHub Actions | `https://github.com/intuitui-labs/form-builder/actions/workflows/ci.yml/badge.svg` | Actions workflow |
| **Matrix Tests** | GitHub Actions | `https://github.com/intuitui-labs/form-builder/actions/workflows/matrix-test.yml/badge.svg` | Matrix test workflow |
| **Test Runner** | Shields.io | `https://img.shields.io/badge/tested_with-Vitest_5-729B1B?style=flat-square&logo=vitest&logoColor=white` | Vitest site |
| **Type Engine** | Shields.io | `https://img.shields.io/badge/TypeScript-7.0.2-3178C6?style=flat-square&logo=typescript&logoColor=white` | TypeScript site |
| **npm Version** | Shields.io (npm) | `https://img.shields.io/npm/v/@intuitui-labs/form-builder-engine?style=flat-square&color=2563EB` | npm registry |
| **Downloads** | Shields.io (npm) | `https://img.shields.io/npm/dm/@intuitui-labs/form-builder-engine?style=flat-square&color=059669` | npm statistics |
| **Bundle Size** | Bundlephobia | `https://img.shields.io/bundlephobia/minzip/@intuitui-labs/form-builder-engine?style=flat-square&color=7C3AED` | Bundlephobia analysis |
| **License** | Shields.io (npm) | `https://img.shields.io/badge/License-MIT-D97706?style=flat-square` | Open source license |
| **Expo Support** | Shields.io | `https://img.shields.io/badge/Expo-SDK%2057%20(Expo%20Go)%20%7C%20SDK%2058-4630EB?style=flat-square&logo=expo&logoColor=white` | Expo ecosystem |
| **Form Core** | Shields.io | `https://img.shields.io/badge/TanStack_Form-v0.42.1-FF4154?style=flat-square&logo=react&logoColor=white` | TanStack documentation |
| **Validation** | Shields.io | `https://img.shields.io/badge/Validation-Zod_v4-3E67B1?style=flat-square&logo=zod&logoColor=white` | Zod documentation |

---

## 2. GitHub Markdown Snippet

Copy and paste this snippet directly into `README.md`:

```markdown
[![CI](https://github.com/intuitui-labs/form-builder/actions/workflows/ci.yml/badge.svg)](https://github.com/intuitui-labs/form-builder/actions/workflows/ci.yml)
[![Matrix Tests](https://github.com/intuitui-labs/form-builder/actions/workflows/matrix-test.yml/badge.svg)](https://github.com/intuitui-labs/form-builder/actions/workflows/matrix-test.yml)
[![npm](https://img.shields.io/npm/v/@intuitui-labs/form-builder-engine?style=flat-square&color=2563EB)](https://www.npmjs.com/package/@intuitui-labs/form-builder-engine)
[![Downloads](https://img.shields.io/npm/dm/@intuitui-labs/form-builder-engine?style=flat-square&color=059669)](https://www.npmjs.com/package/@intuitui-labs/form-builder-engine)
[![Bundle Size](https://img.shields.io/bundlephobia/minzip/@intuitui-labs/form-builder-engine?style=flat-square&color=7C3AED)](https://bundlephobia.com/package/@intuitui-labs/form-builder-engine)
[![TypeScript](https://img.shields.io/badge/TypeScript-7.0.2-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Vitest 5](https://img.shields.io/badge/tested_with-Vitest_5-729B1B?style=flat-square&logo=vitest&logoColor=white)](https://vitest.dev/)
[![Expo SDK 57 | 58](https://img.shields.io/badge/Expo-SDK%2057%20(Expo%20Go)%20%7C%20SDK%2058-4630EB?style=flat-square&logo=expo&logoColor=white)](https://expo.dev/)
[![TanStack Form](https://img.shields.io/badge/TanStack_Form-v0.42.1-FF4154?style=flat-square&logo=react&logoColor=white)](https://tanstack.com/form)
[![Zod](https://img.shields.io/badge/Validation-Zod_v4-3E67B1?style=flat-square&logo=zod&logoColor=white)](https://zod.dev/)
[![License: MIT](https://img.shields.io/badge/License-MIT-D97706?style=flat-square)](https://opensource.org/licenses/MIT)
```
