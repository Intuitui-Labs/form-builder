# Publishing Guide for `@intuitui-labs/form-builder`

This guide details the release cycle, quality verification gates, authentication, and CI/CD automation for publishing 
**`@intuitui-labs/form-builder`** to the public npm registry.

---

## 1. Prerequisites & Access

1. **npm Organization**: Owner/maintainer in [`@intuitui-labs`](https://www.npmjs.com/org/intuitui-labs).
2. **Account 2FA**: Mandatory Two-Factor Authentication for publishes.
3. **Verification**: `npm whoami`.

---

## 2. Preflight Quality Verification Gate

```bash
# 1. Zero-error strict TypeScript check
pnpm run check-types

# 2. Vitest 5 Test Suite with v8 Coverage
pnpm run test:coverage

# 3. Clean production compilation
pnpm run build
```

---

## 3. Manual Publishing via CLI (Local)

```bash
npm publish --access public
# Or with inline OTP:
npm publish --access public --otp=123456
```

---

## 4. Automated CI/CD Publishing (GitHub Actions with Provenance)

When a release is created in `https://github.com/intuitui-labs/openeval`, the package is published with cryptographic 
build provenance:

```yaml
name: Publish to npm

on:
  release:
    types: [published]

jobs:
  publish:
    name: Publish @intuitui-labs/form-builder
    runs-on: ubuntu-latest
    permissions:
      contents: read
      id-token: write
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4
        with:
          version: 12.4.2

      - uses: actions/setup-node@v4
        with:
          node-version: 22
          registry-url: 'https://registry.npmjs.org'

      - run: pnpm install --frozen-lockfile
      - run: pnpm run check-types
      - run: pnpm run test
      - run: pnpm run build

      - name: Publish Package
        run: npm publish --access public --provenance
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

