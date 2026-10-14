# Form Engine Lab — Expo SDK 57 (Latest / Stable)

A standalone React Native showcase for **`@intuitui-labs/form-builder-engine@0.2.0`**. It uses Expo SDK 57, React Native 0.86, and React 19.2, with a custom native renderer designed to run in standard public Expo Go on iOS and Android.

## Run

From the monorepo root:
```sh
# Start Expo Go on LAN (prints QR code for mobile)
pnpm expo:go

# Or preview in web browser
pnpm expo:web
```

Or within `apps/showcase-latest`:
```sh
pnpm run start:go
pnpm run web
```

Open it in Expo Go on Android/iOS, or press `w` in the Expo terminal for the web preview. The app includes:

- **Multi-step (5 Domain Archetypes & Chooser):** an interactive domain gallery featuring 5 distinct form workflows:
  1. **Product Ops (Launch Readiness Review):** linear 4-stage pipeline, numeric Likert scales (1-10), sprint health gauge visualization, file attachment constraints.
  2. **HealthTech (Clinical Patient Triage & Intake):** sanitized Markdown medical disclaimers (`rich-text`), dynamic field visibility (`visibleIf`), conditional required rules (`requiredIfField`), and semantic intents (`name-full`, `birth-date`, `contact-phone`).
  3. **FinTech (Commercial Credit & KYC Underwriting):** Luhn algorithm validation on payment cards, card expiry checks, IRS EIN regex patterns, and cross-field comparisons (`greaterThanField`, `matchesField`).
  4. **DevSecOps (Production Incident Post-Mortem & War Room):** conditional wizard branching (`jumpRules` where P0 severity jumps straight to the emergency war room bridge), technical Markdown SOPs, and MTTR/SLA error budget telemetry.
  5. **People Ops (360 Talent & Peer Leadership Review):** emoji Likert scales (😡 to 🤩), value creed statement cards (`statement`), rich option badges, and sensitive psychological safety privacy rationales.
- **JSON hydrate:** a form built from JSON-shaped definitions through `FormHydrator`, including a host-registered custom validator.
- **Insights:** real `AnalyticsEngine.aggregate()`, CSV output and clipboard copy, plus a preview of the package's Excel-compatible XML output.
- **Notes:** compatibility facts, exact package names, and architectural boundaries.

The submit callback is simulated locally; no data is sent to a backend. Each interactive form includes a **Fill sample** path for a fast valid-first-pass run.

## Verify

```sh
pnpm test
pnpm run typecheck
pnpm run verify
```

## Compatibility snapshot

- Expo `~57.0.27`
- React Native `0.86.3`
- React `19.2.3`
- `@tanstack/form-core` `^0.42.1`
- Zod `4.6.5`
- Engine package: monorepo workspace build (`workspace:*`)

The package has no React or React Native UI dependency in its manifest. It is a **headless engine**, not a ready-made native component library. The showcase renders its supported field types with React Native `TextInput`, `Pressable`, and layout primitives.

### Resolved issue: submit error recovery

In the local engine build, `FormManager.validateField()` now properly synchronizes and clears TanStack Form's internal `errorMap` when a field is corrected. After an invalid value is corrected:

- `FormManager.getState().errors` is empty and `validate()` returns `true`;
- TanStack Form's internal `errorMap` removes the previous error;
- `handleSubmit()` executes the configured `onSubmit`, and `submitSuccess` becomes `true`.

The Node smoke suite (`engine.smoke.test.mjs`) verifies this full recovery across `FormManager`, `MultiStepFormManager`, and `FormHydrator`.

### Other v0.1.0 boundaries

Declared field types: text, email, password, select, textarea, number, heading, divider, slider, and likert. The schema type includes `conditions`, but the current multi-step manager flattens all page fields and validates them; conditional visibility and repeat-group behavior are not implemented by this runtime. Checkbox, date, file, and repeat-group controls are not declared. A React Native renderer / adapter must own presentation and any additional branching or complex field models.

`AnalyticsEngine.toXLSX()` currently returns SpreadsheetML XML text, not a zipped `.xlsx` workbook. The app labels and previews its actual output.

## Does no React Native form-builder package exist?

That absolute claim is **not correct**. Existing examples include:

- [`react-native-form-builder`](https://www.npmjs.com/package/react-native-form-builder) — `1.0.16`, registry last modified 2022-06-26; [GitHub README](https://github.com/bietkul/react-native-form-builder) describes generated fields, validation, nested forms, and NativeBase components.
- [`react-native-paper-form-builder`](https://www.npmjs.com/package/react-native-paper-form-builder) — `2.1.2`, registry last modified 2022-05-14; [GitHub README](https://github.com/fateh999/react-native-paper-form-builder) documents React Native Paper fields, React Hook Form, validation, dropdowns, autocomplete, checkbox, switch, and radio.
- [`react-native-jsonschema-form`](https://www.npmjs.com/package/react-native-jsonschema-form) — `0.0.8`, registry last modified 2022-05-14; npm describes it as generating React Native layout forms from JSON Schema.

These counterexamples do not establish that any one meets your target feature set, and the inspected npm releases are old. A more precise positioning is: **a modern, headless, schema-driven form engine designed to power custom React Native renderers**, with this SDK 57 showcase as integration evidence—while fixing the submit regression and README package-name mismatch before promoting v0.1.0 as production-ready.

## Evidence links

- [Expo SDK 57 changelog](https://expo.dev/changelog/sdk-57) — SDK 57 targets React Native 0.86 and React 19.2.
- [SDK 57 version table](https://docs.expo.dev/versions/v57.0.0/) — lists React Native 0.86, React 19.2.3, React Native Web 0.21.0, and minimum Node 22.13.x.
- [Published engine package](https://www.npmjs.com/package/@intuitui-labs/form-builder-engine)
- [Engine source repository](https://github.com/intuitui-labs/form-builder)


### Dependency audit note (2026-10-10)

`npm audit --omit=dev` reports **30 dependency-tree advisories (20 high, 10 moderate)** for this SDK 57 install. The clearest production-library concern is [`GHSA-ggv3-vmgw-xv2q`](https://github.com/advisories/GHSA-ggv3-vmgw-xv2q) / CVE-2024-57068: `@tanstack/form-core` versions `<0.42.1` are affected; the advisory rates it High and identifies `0.42.1` as patched. The showcase resolves `0.20.3`, and the engine currently requests `^0.20.0`, which excludes the patch line. The engine is flagged high through this dependency. The engine should widen/update its TanStack range and add compatibility/security regression coverage before release.

Other audit findings are largely transitive Expo CLI, Metro, and React Native toolchain dependencies; npm's tree report alone does not establish that each is reachable in a shipped client bundle. Do not run `npm audit fix --force` here: npm offers changes that cross major SDK/package versions (including Expo 44 in its proposed path), conflicting with the requested SDK 57 verification. Review and upgrade the Expo/RN toolchain deliberately, then rerun the audit.


## Final preview

![Successful multi-step sample submission](artifacts/final-preview.png)
