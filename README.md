# Form Builder Engine (`@intuitui-labs/form-builder-engine`)

[![CI](https://github.com/intuitui-labs/form-builder/actions/workflows/ci.yml/badge.svg)](https://github.com/intuitui-labs/form-builder/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@intuitui-labs/form-builder-engine?style=flat-square&color=blue)](https://www.npmjs.com/package/@intuitui-labs/form-builder-engine)
[![TypeScript](https://img.shields.io/badge/TypeScript-7.0.2-blue.svg?style=flat-square)](https://www.typescriptlang.org/)
[![Vitest 5](https://img.shields.io/badge/tested%20with-Vitest%205-729B1B.svg?style=flat-square)](https://vitest.dev/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](https://opensource.org/licenses/MIT)

> **Headless schema-driven form evaluation, validation, hydration, and analytics engine built on TanStack Form and Zod.**

---

## 📦 Installation & Usage

```bash
pnpm add @intuitui-labs/form-builder-engine @tanstack/form-core zod
```

### Tree-Shakable Subpaths
```typescript
import { createFormSchema } from '@intuitui-labs/form-builder-engine/schema';
import { validateField } from '@intuitui-labs/form-builder-engine/validation';
import { hydrateFormValues } from '@intuitui-labs/form-builder-engine/hydration';
import { trackFormMetrics } from '@intuitui-labs/form-builder-engine/analytics';
```

---

## 🛠️ Development & Quality Gates

```bash
pnpm run check-types
pnpm test
pnpm run build
```

---

## 📄 License
MIT © Intuitui Labs & Neev Foundation.
