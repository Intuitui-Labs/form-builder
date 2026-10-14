---
name: form-builder-ai
description: Authoritative guide and workflow for AI agents to scaffold, validate, and operationalize enterprise multi-step forms using @intuitui-labs/form-builder-engine.
---

# Form Builder Engine: AI Scaffolding & Form Authoring Skill

Use this skill when tasked with generating, modifying, or auditing forms using `@intuitui-labs/form-builder-engine`.

## Core Philosophy

1. **Zero Runtime Hallucinations**: All generated schemas must strictly satisfy the `FormSchema` Zod/PureSchema contracts.
2. **Cognitive Chunking**: Break large forms into discrete, logical stages (maximum 6–8 inputs per page).
3. **WCAG & Accessibility**: Always declare `semanticIntent` on personal, contact, payment, and address inputs.
4. **Resilience & Defenses**:
   - Zero circular jump logic.
   - Strip malicious script tags.
   - Enforce privacy rationales for sensitive inputs (`identity-tax-id`, `contact-phone`).
   - Protect tabular exports from OWASP Formula Injection.

## High-Level Form Scaffolding Pattern

```typescript
import {
  compilePromptToSchema,
  FormScaffolder,
  type FormSchema,
} from '@intuitui-labs/form-builder-engine';

// 1. Scaffolder synthesizes requirements into schema
const scaffold = await FormScaffolder.scaffoldFromPrompt(
  "Loan intake form with applicant personal info, monthly income slider, and loan amount with approval odds gauge",
  llmCaller
);

// 2. Validate structural integrity and lint heuristics
if (!scaffold.success || !scaffold.schema) {
  throw new Error(`Scaffolding failed: ${scaffold.errors?.join(', ')}`);
}

// 3. Initialize Runtime MultiStepFormManager
const manager = new MultiStepFormManager(scaffold.schema, async (values) => {
  await apiClient.submit(values);
});
```

## Supported Field Types
`text`, `email`, `password`, `select`, `textarea`, `number`, `slider`, `likert`, `rich-text`, `statement`, `heading`, `divider`, `file`, `image-capture`, `audio-record`, `visualization`.

## Interactive Visualization Descriptors
Embed real-time visual calculators inside forms using:
```typescript
visualization: {
  visualizationType: 'gauge' | 'bar' | 'line' | 'comparison' | 'projection',
  title: 'Estimated Debt-to-Income Ratio',
  metrics: [{ label: 'DTI', value: 28, target: 36, unit: '%' }],
  computedFrom: ['monthlyIncome', 'monthlyDebt']
}
```
