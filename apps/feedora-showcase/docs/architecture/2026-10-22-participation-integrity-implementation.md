---
title: "Participation Integrity Implementation"
status: "active"
created: 2026-10-22
updated: 2026-10-22
author: "Codex"
tags: [participation, offline, scope, policy, identity]
---

# Participation Integrity Implementation

This document records the completed implementation slice for server-owned participation scope, guest identity, offline submissions, effective policy versioning, response history, and account claims.

## Capability map

| Capability | Authority | Client persistence | Integration points |
| --- | --- | --- | --- |
| Organization scope | Django `Survey.organization_scope` and `scope_kind` | Existing selection preference | Survey creation, catalog, metadata, response receipt, leaderboard |
| Guest identity | Django `GuestPrincipal`; raw random token is returned once and only its SHA-256 hash is stored | Expo SecureStore on native; origin-local storage on web | Session bootstrap, catalog status, submit, history, account claim |
| Submission durability | Engine `OfflineOutboxQueue` | Existing SQLite-backed native store / browser storage adapter | Submission screen, immediate transport, reconnection sync, receipt reconciliation |
| Policy version | Django normalized policy resolver | Captured with the submission intent | Meta/catalog, submit validation, idempotent response receipt |
| Repeat history | Django response rows and stable response/submission IDs | Local history keyed by response or submission ID | Insights, progress, catalog eligibility, leaderboard |
| Guest-to-account claim | Authenticated Django session plus guest bearer credential | Local projection transfer follows server claim | Claim endpoint, account history, attempts, scope points, leaderboard |

## Data flow

```text
App boot
  -> load guest token from platform credential storage
  -> otherwise POST /api/v1/guest/session/
  -> retain opaque token; backend stores only its hash

Survey completion
  -> save complete submission envelope to outbox
  -> if reachable, send using stable submission ID and guest credential
  -> server derives principal and scope; validates effective policy
  -> commit Response + Answers + points + receipt
  -> reconcile local profile/history from canonical receipt

Sign in after guest work
  -> POST /api/v1/guest/claim/ with Django auth cookie and guest credential
  -> link GuestPrincipal.claimed_by to account
  -> account history, attempt rules, scoped points, and standings include linked rows
```

## Contracts and invariants

- Client JSON cannot choose `guestParticipantId`; the API derives it from `X-Feedora-Guest-Token`.
- Creator supplied `features.scope` and `features.is_global` are stripped. Scope is stored separately on `Survey` and a creator may select only an organization they actively own. A platform scope must be set by server administration.
- `Survey.created_by` records authorship independently from `organization_scope`, which is the participation boundary. Organization-scope owner permissions come from active memberships, and creator access never substitutes for a resource scope.
- Claiming does not rewrite or merge response rows. `GuestPrincipal.claimed_by` links them to the account, preserving original guest provenance and avoiding collisions between user and guest idempotency constraints.
- A claimed guest token cannot submit anonymously again. Sign out rotates to a new server guest session.
- A policy version hashes normalized attempt, prerequisite, sequence, cooldown, account, access-code, score, and reward inputs. Meta, catalog and submission use the same resolver for effective attempt policy.
- Local survey history deduplicates by `responseId` or `submissionId`, so multiple permitted attempts for one survey remain visible.
- Outbox intents are persisted before transport. An intent is removed only after the server receipt and local receipt reconciliation succeed. Age does not delete pending intents; capacity refuses a new intent rather than evicting saved work.
- Permanent submit failures move into the recoverable dead-letter store and appear in the app banner with a retry action. A rejected answer remains the original intent; retrying it does not bypass changed server rules.

## Scaling and recovery limits

- Queue operations are O(n) in the number of pending envelopes because the current store serializes the queue as one JSON value. The default cap is 50 envelopes; response size remains the dominant storage cost. A later slice should move queue rows to SQLite on native and IndexedDB on web if sustained use pushes this bound.
- The queue has no age-based eviction. A full queue blocks the next submission with an explicit message. Storage quota failures also prevent acceptance before the app shows completion.
- A guest token is a bearer credential. Native uses device-only keychain/keystore storage; browser storage is origin-local and is not protected from same-origin script execution.
- If the app is first opened offline, it uses a temporary local principal and queues responses. Session bootstrap retries every 15 seconds; once online it obtains a server credential and transfers local projections before queue sync. Server acceptance waits for that credential.
- Guest credentials created by earlier app versions cannot be claimed because those versions let the client choose the guest ID and stored no proof of ownership. Existing rows remain intact under their legacy identifiers.
- The current account claim endpoint authenticates through the configured Django session provider. Other providers need a trusted token-validation adapter before they can claim server history; the app currently selects Django.
- The bearer session endpoint currently has no expiry or cleanup policy. Add retention/abuse controls before public scale; do not delete guest records until their linked response retention requirements are defined.

## Deployment sequence

1. Apply Django migrations `accounts.0004_guest_principal_and_server_scope` and `surveys.0012_guest_principal_and_server_scope`.
2. Deploy the API routes for guest session and claim. Set `FEEDORA_CORS_ALLOWED_ORIGINS` to the exact web app origins and include those origins in `DJANGO_CSRF_TRUSTED_ORIGINS` for Django session authentication. The CORS preflight accepts `X-Feedora-Guest-Token`.
3. Ship the client with `expo-secure-store` and persist-first queue behavior.
4. Confirm a guest response appears in server history, then sign in and confirm the same `responseId` is present in account history and the organization leaderboard.

The local Django database was migrated in this workspace. The migration adds identity and scope records and backfills each survey's organization scope; it leaves accepted response rows and their historical scope values intact.

## Hostile review outcomes

The addressed failure cases were client identity spoofing, client-declared platform scope, crash between network send and local queue write, silent age/capacity eviction, discarded permanent failures, repeat-attempt history collapse, policy fingerprint omissions, and guest progress missing from account views after claim. Automated checks cover guest isolation and claim, scope escalation, policy fingerprints, repeat attempts, durable outbox ordering, capacity behavior, retry retention, and the existing submit concurrency path.
