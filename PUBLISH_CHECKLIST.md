---
title: "Form Builder Engine Publish Checklist"
status: "active"
created: 2026-05-22
updated: 2026-05-22
author: "Naveen"
scribe: "opencode"
tags: [packages, form-builder-engine]
---

# Form Builder Engine Publish Checklist

Use this before tagging or publishing `@intuitui-labs/form-builder-engine`.

## Boundary checks
- No imports from `@repo/*`
- No imports from app folders
- No React or React Native UI exports
- No routing, screen, or feature-shell code
- No scanner-kit or QR service implementation in core

## API checks
- `src/index.ts` only re-exports the portable core surface
- Public exports are documented and intentional
- Adapter ports are typed and host-owned
- Runtime helpers do not hardcode infrastructure choices

## Quality checks
- TypeScript builds cleanly
- Tests pass
- Exported API is stable enough for semver
- README describes the package as a headless engine
- Version is bumped with a changelog entry before release

## QR and sharing checks
- The engine exposes a port, not a QR provider implementation
- The host package decides how to build share URLs
- The host package decides how QR images are generated

## Release checks
- Package name, version, and license are correct
- `exports` only expose intended entry points
- No accidental internal-only files are exported
