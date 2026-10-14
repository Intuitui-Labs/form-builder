---
title: "Exhaustive Primitives, Hexagonal Ports, and Adapters Catalog"
status: "active"
created: 2026-10-14
updated: 2026-10-14
author: "Antigravity & Solution Architecture"
tags: [catalog, primitives, ports, adapters, hexagonal, ai-scaffolding]
---

# Form Builder Engine: Exhaustive Primitives, Ports & Adapters Catalog

This catalog documents the complete foundation of `@intuitui-labs/form-builder-engine`. It serves as the single source of truth for human engineers and autonomous AI agents constructing enterprise-grade, offline-first, schema-driven forms across React Native, Expo, and Web.

---

## 1. Architectural Topology (Hexagonal Ports & Adapters)

The engine enforces strict **Hexagonal Architecture** (Ports and Adapters). The domain core contains 0 framework dependencies and 0 side effects.

```
       +-----------------------------------------------------------+
       |                  INBOUND PRESENTATION PORTS               |
       |  - React Native / Expo Native Screens                     |
       |  - Web UI (TanStack Form bindings / React 19 callback ref)|
       |  - AI Form Scaffolder & Headless CLI                      |
       +-----------------------------+-----------------------------+
                                     |
                                     v
       +-----------------------------------------------------------+
       |                       DOMAIN CORE                         |
       |  - MultiStepFormManager (FSM, Jumps, Backtracks, History) |
       |  - FormManager (TanStack Core Store, Atomic Batches)      |
       |  - ConditionEvaluator (8 Boolean & Relational Operators)  |
       |  - SchemaGraph (Tarjan's SCC Cycles, Reachability, Trees) |
       |  - SchemaLint (WCAG, Cognitive Load, ReDoS Defenses)      |
       |  - AnalyticsEngine (Friction Scoring, OWASP CSV Defense)  |
       +-----------------------------+-----------------------------+
                                     |
                                     v
       +-----------------------------------------------------------+
       |                  OUTBOUND HEXAGONAL PORTS                 |
       |  IStoragePort           IDraftStoragePort  ITransportPort |
       |  ITelemetryPort         IAddressAutofill   IContactPicker |
       |  IExperimentPort        IProgressStrategy  IRewardEngine  |
       |  ISanitizerPort         IFormLifecycle     ISchemaValidator
       +-----------------------------+-----------------------------+
                                     |
                                     v
       +-----------------------------------------------------------+
       |                     PLUGGABLE ADAPTERS                    |
       |  - Memory / MMKV / AsyncStorage / IndexedDB               |
       |  - Resilient FIFO Outbox (14-Day TTL, Dead-Letter Queue)  |
       |  - Nominatim / LkEduGeo / Google Places / W3C Contacts    |
       |  - PureSchema / Zod v4 / StandardSchema (Valibot/ArkType) |
       |  - PostHog / Mixpanel / Console Telemetry                 |
       +-----------------------------------------------------------+
```

---

## 2. Exhaustive Atomic Input Primitives

Every input type supported by `FieldType` in [`FormSchema.ts`](file:///c:/projects/packages/form-builder-engine/src/schema/FormSchema.ts):

| Primitive Field Type | Description | Key Schema Properties | React Native / Web Component Affordance |
| :--- | :--- | :--- | :--- |
| `text` | Single-line alphanumeric input | `formatMask`, `formatExample`, `autoCapitalize` | Native `TextInput`, `<input type="text">` |
| `email` | RFC-5322 email input with autocorrect off | `autoComplete: 'email'`, `keyboardType: 'email-address'` | Email keyboard with `@` and domain extensions |
| `password` | Obfuscated secure text input | `textContentType: 'password'`, `sensitive: true` | `secureTextEntry={true}`, autofill keychain |
| `number` | Numeric and currency value input | `min`, `max`, `inputMode: 'decimal'` | `keyboardType="numeric"`, stepper controls |
| `select` | Single choice from discrete options | `options: FormFieldOption[]`, `scaleType` | Radio button group, segmented control, picker |
| `textarea` | Multiline long-form narrative | `rules: [{ type: 'maxLength', value: 1000 }]` | Native multiline `TextInput`, `<textarea>` |
| `slider` | Continuous numeric range selector | `min`, `max`, `step`, `defaultValue` | `@react-native-community/slider`, range track |
| `likert` | Psychometric scale (satisfaction / agreement) | `scaleType: 'emoji' \| 'numeric'`, `min: 1, max: 5` | Star rating, emoji sentiment scale, 1–5 pills |
| `rich-text` | Formatted descriptive commentary | `content`, `config.allowedHtmlTags` | Markdown preview, sanitized HTML container |
| `statement` | Informational block / transition card | `content`, `badge`, `media` | Callout card, value-proposition banner |
| `heading` | Structural typographic section header | `content`, `order` | Semantic `Text` / `<h2>`, divider |
| `divider` | Visual separator between field clusters | `order` | Border rule `<View style={styles.divider} />` |
| `file` | Document upload (PDF, DOCX) | `rules: [{ type: 'fileSize' }, { type: 'fileType' }]` | File picker with progress indicator |
| `image-capture` | Camera snapshot or gallery pick | `media.aspectRatio`, max bytes | Camera roll modal, thumbnail preview |
| `audio-record` | Voice note recorder & dictation | max seconds, transcription URL | Audio wave recorder, mic trigger |
| `visualization` | Real-time interactive calculation & charts | `visualization: InteractiveVisualizationDescriptor` | SVG gauge, live projection chart, progress bar |

---

## 3. Semantic Intents (WCAG & Auto-Fill Matrix)

Specifying `semanticIntent` allows password managers, browser autofill, and assistive technologies to instantly populate fields while maintaining privacy compliance:

```typescript
export type SemanticIntent =
  // Authentication & Passkeys
  | 'username' | 'current-password' | 'new-password' | 'one-time-code' | 'webauthn-passkey'
  // Payment & Billing
  | 'payment-card-number' | 'payment-card-expiry' | 'payment-card-cvc' | 'payment-card-holder'
  // Physical Address & Location
  | 'address-line1' | 'address-line2' | 'address-city' | 'address-state' | 'address-postal-code' | 'address-country'
  // Personal & Identity
  | 'name-full' | 'name-given' | 'name-middle' | 'name-family' | 'name-prefix' | 'name-suffix'
  | 'contact-email' | 'contact-phone' | 'organization-name' | 'birth-date' | 'identity-tax-id';
```

> [!IMPORTANT]
> When `semanticIntent` is set to `contact-phone` or `identity-tax-id`, `privacyRationale` should always be populated to provide respondent transparency and prevent cognitive abandonment.

---

## 4. Built-in Validation Rules Matrix

The engine provides 16 built-in declarative validation rules executed synchronously or asynchronously via pure TypeScript or Zod:

1. `required`: Non-empty check for strings, arrays, booleans, and numbers.
2. `email`: RFC 5322 email syntax validation.
3. `minLength` / `maxLength`: Character bound assertions.
4. `min` / `max`: Numeric boundary assertion.
5. `pattern`: Regular expression check (ReDoS guarded).
6. `custom`: Deterministic validator function `(val, allValues) => boolean`.
7. `matchesField`: Cross-field equality (e.g. `confirmPassword` matches `password`).
8. `greaterThanField` / `lessThanField`: Relational order (e.g. `departureDate` > `arrivalDate`).
9. `requiredIfField`: Conditional obligation (e.g. `taxId` required if `citizenship === 'US'`).
10. `luhn`: Luhn checksum algorithm for credit cards and ISO 7812 identifiers.
11. `cardExpiry`: MM/YY expiry assertion against current calendar month/year.
12. `passwordStrength`: Entropy calculation (uppercase, lowercase, digits, symbols).
13. `fileSize`: Maximum byte cap enforcement.
14. `fileType`: MIME type whitelist verification.
15. `maxFiles`: Array length boundary enforcement.

---

## 5. Hexagonal Ports & Pluggable Adapters Specification

### 5.1 Inbound Ports (Drivers)
*   [`IFormManager<T>`](file:///c:/projects/packages/form-builder-engine/src/ports/index.ts#L29-L40): The master controller wrapping `@tanstack/form-core`. Manages atomic multi-field enrichment, rollbacks, validation lifecycle, and fine-grained state subscriptions.
*   [`MultiStepFormManager<T>`](file:///c:/projects/packages/form-builder-engine/src/manager/MultiStepFormManager.ts): Top-level orchestrator for multi-page flows, handling branching rules, breadcrumbs, linear checkpoints, outbox submission, and cross-page transactional enrichment.

### 5.2 Outbound Ports (Driven Adapters)
*   [`IStoragePort`](file:///c:/projects/packages/form-builder-engine/src/ports/IStoragePort.ts): Key-value storage abstraction (`getItem`, `setItem`, `removeItem`, `clear`).
*   [`IDraftStoragePort`](file:///c:/projects/packages/form-builder-engine/src/ports/IDraftStoragePort.ts): Debounced auto-saving for partial form drafts with schema version tags.
*   [`ITransportPort`](file:///c:/projects/packages/form-builder-engine/src/ports/ITransportPort.ts): Resilient transmission port supporting idempotency keys and offline queuing.
*   [`ITelemetryPort`](file:///c:/projects/packages/form-builder-engine/src/ports/ITelemetryPort.ts): Emits fine-grained events (`form_started`, `field_focused`, `field_blurred`, `field_error`, `fields_enriched`, `step_completed`, `form_abandoned`).
*   [`IAddressAutofillPort`](file:///c:/projects/packages/form-builder-engine/src/ports/IAddressAutofillPort.ts): Omni-search, reverse geocoding, and postal code administrative resolution.
*   [`IContactPickerPort`](file:///c:/projects/packages/form-builder-engine/src/ports/IAddressAutofillPort.ts#L84-L88): W3C and mobile native contact picker adapter.
*   [`IExperimentPort`](file:///c:/projects/packages/form-builder-engine/src/ports/IExperimentPort.ts): Flag evaluation and deterministic hash variant assignments for A/B testing.
*   [`IProgressStrategyPort`](file:///c:/projects/packages/form-builder-engine/src/ports/IProgressStrategyPort.ts): Computes cognitive progress (weighted fields, time estimation, linear steps).
*   [`IRewardEnginePort`](file:///c:/projects/packages/form-builder-engine/src/ports/IRewardEnginePort.ts): Triggers reciprocal value unlocks (benchmarks, badges, insights) at step boundaries.
*   [`ISanitizerPort`](file:///c:/projects/packages/form-builder-engine/src/ports/ISanitizerPort.ts): Anti-XSS and CSV formula injection mitigation.
*   [`ISchemaValidator<T>`](file:///c:/projects/packages/form-builder-engine/src/ports/index.ts#L103-L107): Swappable structural validator conforming to StandardSchema v1.

### 5.3 Heuristic Identity & Address Enrichment System
*   [`NameParser`](file:///c:/projects/packages/form-builder-engine/src/affordance/NameParser.ts): Culturally-aware name decomposition handling mononyms, honorific prefixes, compound Germanic/Romance/Arabic surnames, inverted comma syntax, and initials.
*   [`ContactFieldMapper`](file:///c:/projects/packages/form-builder-engine/src/affordance/ContactFieldMapper.ts): Maps native `PickedContact` cards (W3C Contact Picker) to form fields via `semanticIntent` and fuzzy heuristics, unpacking embedded postal addresses.
*   [`AddressFieldMapper`](file:///c:/projects/packages/form-builder-engine/src/affordance/AddressFieldMapper.ts): Maps `AddressCandidate` lookups to form schemas.
*   [`StandardFetchAddressAdapter`](file:///c:/projects/packages/form-builder-engine/src/adapters/geo/StandardFetchAddressAdapter.ts): OSM Photon / Nominatim REST client with `AbortSignal` and strict timeout budgets.
*   [`LkEduGeoAddressAdapter`](file:///c:/projects/packages/form-builder-engine/src/adapters/geo/LkEduGeoAddressAdapter.ts): Zero-latency Sri Lanka administrative and postal code hierarchy resolution.
*   [`CompositeAddressAutofillAdapter`](file:///c:/projects/packages/form-builder-engine/src/adapters/geo/CompositeAddressAutofillAdapter.ts): Cascades local offline caches with remote fallbacks and fail-safe error isolation.
*   [`BrowserGeolocationAdapter`](file:///c:/projects/packages/form-builder-engine/src/adapters/geo/BrowserGeolocationAdapter.ts): Acquires current GPS coordinates and reverse-geocodes to structured address fields.
*   [`BrowserContactPickerAdapter`](file:///c:/projects/packages/form-builder-engine/src/adapters/geo/BrowserContactPickerAdapter.ts): Safe W3C Contact Picker API adapter with permission denial handling.

### 5.4 Unstructured Entity Extraction & Ghost Forms
*   [`IEntityExtractorPort`](file:///c:/projects/packages/form-builder-engine/src/ports/IEntityExtractorPort.ts): Ingests unorganized text blobs (emails, bios, receipts, signatures) and extracts typed form field values with confidence ranking.
*   [`RegexRuleExtractorAdapter`](file:///c:/projects/packages/form-builder-engine/src/adapters/ai/RegexRuleExtractorAdapter.ts): 0 kB deterministic offline extractor for emails, phone numbers, postal codes, currencies, and names.
*   [`CallbackLLMExtractorAdapter`](file:///c:/projects/packages/form-builder-engine/src/adapters/ai/CallbackLLMExtractorAdapter.ts): Connects any LLM with prototype pollution defenses, timeout isolation, and JSON fence extraction.
*   [`CompositeEntityExtractorAdapter`](file:///c:/projects/packages/form-builder-engine/src/adapters/ai/CompositeEntityExtractorAdapter.ts): Chains local regex fast-paths with remote LLM fallbacks, merging the highest-confidence entity predictions.

### 5.5 Tactile Sensory Micro-Feedback & Ergonomics
*   [`IHapticFeedbackPort`](file:///c:/projects/packages/form-builder-engine/src/ports/IHapticFeedbackPort.ts): Physical sensory confirmation contract (`selection`, `light-click`, `medium-bump`, `success`, `warning`, `error`).
*   [`NullHapticAdapter`](file:///c:/projects/packages/form-builder-engine/src/adapters/haptics/NullHapticAdapter.ts): Zero-overhead fallback for desktop browsers, testing, and SSR environments.
*   [`WebVibrationAdapter`](file:///c:/projects/packages/form-builder-engine/src/adapters/haptics/WebVibrationAdapter.ts): Translates tactile patterns to `navigator.vibrate()` with 80ms main-thread throttling guards.
*   [`ExpoHapticsAdapter`](file:///c:/projects/packages/form-builder-engine/src/adapters/haptics/ExpoHapticsAdapter.ts): Connects `@expo/haptics` for React Native/Expo mobile apps with bridge starvation throttling.

### 5.6 Ambient Self-Shrinking Forms
*   [`AmbientFieldCollapser`](file:///c:/projects/packages/form-builder-engine/src/affordance/AmbientFieldCollapser.ts): Groups related fields into clusters (e.g. address, personal info) and automatically collapses them into a confirmed summary card with 1-click editability once all fields are satisfied by ambient sources. Includes hostile focus defense that strictly prevents collapsing while an input has active user focus.

---

## 6. Real-time Interactive Visualizations & Safe Mathematical Computation

The engine supports dynamic visual widgets embedded inside form pages or terminal summary screens without external heavy charting dependencies:

*   [`MathExpressionEvaluator`](file:///c:/projects/packages/form-builder-engine/src/core/MathExpressionEvaluator.ts): Safe, AST-free recursive descent math parser strictly avoiding `eval()` and `new Function()`. Includes zero-division guards, bounded exponentiation, function whitelisting (`min`, `max`, `round`, `abs`, `clamp`, `sqrt`, `floor`, `ceil`), and ternary logic (`? :`).
*   [`VisualizationEngine`](file:///c:/projects/packages/form-builder-engine/src/analytics/VisualizationEngine.ts): Computes immediate layout states for gauges, proportional bars, cohort percentiles, and SVG projection curves.

```typescript
export interface InteractiveVisualizationDescriptor {
  visualizationType: 'gauge' | 'bar' | 'line' | 'comparison' | 'projection';
  title: string;
  description?: string;
  metrics: VisualizationMetric[];
  computedFrom?: string[];
  formula?: string;
  dataFallback: { label: string; value: string | number }[];
}
```

*   **`gauge`**: Renders radial progress (e.g., credit eligibility index, health quotient, BMI).
*   **`bar`**: Category frequency or score breakdowns.
*   **`line`**: Projections across time (e.g., mortgage amortization, retirement savings).
*   **`comparison`**: Real-time peer benchmarking against cohort percentiles.
*   **`projection`**: What-if scenario forecasting based on interactive field sliders.

---

## 7. Operational Checklist for AI Form Scaffolding

When an AI Agent is tasked with generating a form schema from a user's prompt:
1. **Analyze Requirements**: Group fields into distinct progressive stages (maximum 7–8 fields per page).
2. **Assign Semantic Intents**: Map every personal, contact, payment, and address field to its standard `semanticIntent`.
3. **Attach Privacy Rationales**: Include a plain-language explanation for every sensitive field.
4. **Validate Against Schema**: Execute `safeValidateFormSchema()`.
5. **Run Lint Checks**: Execute `lintFormSchema()` to verify 0 circular jumps, 0 orphan pages, and 0 ReDoS regular expressions.
6. **Integrate Analytics & Visualizations**: Attach telemetry hooks and dynamic metric descriptors for rich respondent feedback.
