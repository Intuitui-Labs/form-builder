---
title: "@intuitui-labs/form-builder-engine"
status: "active"
created: 2026-05-22
updated: 2026-05-22
author: "Naveen"
scribe: "opencode"
tags: [packages, form-builder-engine]
---

# @intuitui-labs/form-builder-engine

Headless, hexagonal, offline-first form engine with schema-driven validation and adapter ports.

## What this package provides
- versioned form schema types
- validation helpers
- form state manager
- schema hydration
- analytics interfaces and primitives
- storage/sync/analytics adapter ports
- QR code and public-share URL ports for hosts that need distribution flows

## What this package does not provide
- React or React Native UI
- app routing
- repository-specific APIs
- design-system components
- QR/scanner integrations

## Design rule
Anything environment-specific should be supplied through adapters, not imported from a host app.
