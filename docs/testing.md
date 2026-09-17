# Testing Architecture & Evidence Specification

> **Package:** `@intuitui-labs/form-builder`  
> **Test Engine:** Vitest 5.0+  
> **Coverage Provider:** `@vitest/coverage-v8`  
> **Evidence Levels:** G0 Contract & Mathematical Evaluation  

---

## 1. Evidence Level Classification

### Level G0: Pure Mathematical & Evaluation Contracts
- **Engine**: Vitest 5.0+ running on Node.js 22/24+
- **Suite**: `test/evaluate.test.ts`
- **Assertions prove**:
  - Evaluation ranking algorithms prioritize goal-aligned candidates above unaligned candidates.
  - Multi-attribute weighted trade-off matrices evaluate deterministically.
  - Share-state serialization is lossless, bidirectional, and resistant to tampered payloads.
- **What is not proven**:
  - Remote HTTP network fetching timeouts or rate limits.

---

## 2. Advanced Vitest 5 Capabilities Employed

| Capability | Configuration | Benefit |
| :--- | :--- | :--- |
| **T2 `fsModuleCache`** | `test.fsModuleCache: true` in `vitest.config.ts` | Transformed ASTs cached on disk; warm runs execute in $<300\text{ms}$. |
| **V11 `sharedViteServer`** | `test.sharedViteServer: true` in `vitest.config.ts` | Shared Vite pipeline. |
| **V8 Coverage Engine** | `@vitest/coverage-v8` | Native C++ branch, statement, and line coverage mapping. |

