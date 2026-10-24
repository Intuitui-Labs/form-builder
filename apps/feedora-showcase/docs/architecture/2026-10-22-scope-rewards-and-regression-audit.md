---
title: "Scope Rewards and Changed-File Regression Audit"
status: "active"
created: 2026-10-22
updated: 2026-10-22
author: "Codex"
tags: [feedora, audit, regression, scope, rewards]
---

# Scope Rewards and Changed-File Regression Audit

## Scope and confidence

This audit reviewed the currently modified Feedora showcase and Django API files against their checked-out Git `HEAD`, checked that existing API routes and major app/domain entry points remain present, then traced the affected submission, receipt, history, standings, and organization-selection flows. Both repositories already contained substantial uncommitted changes before this audit. Git therefore cannot reliably identify which earlier edits were made by the user or by a prior agent. This report identifies observable behavior changes and their compatibility impact; it does not claim authorship attribution or prove that every historical UI detail was preserved.

The Expo diff was normalized for CRLF before review (`core.whitespace=cr-at-eol`, `--ignore-space-at-eol`) to avoid treating line-ending changes as removed behavior. The backend model/API files were reviewed semantically and the tests below exercise the new scope invariants.

## Behavior audit

| Area | Observed change | Disposition |
| --- | --- | --- |
| Respondent history totals | `totalPoints` had become platform-only, which broke its prior account-wide meaning for existing clients. | Restored as the account-wide compatibility total; added `accountTotalPoints`, `platformPoints`, and `scopePoints` for explicit consumers. |
| Submission receipt totals | Existing `totalPoints` was at risk of being interpreted as selected-scope balance. | Preserved the account-wide alias and added `scopeTotalPoints` and `platformPoints`. |
| Completion notice | The configured negative-reinforcement perk description was no longer appended to the successful-submission notice. | Restored the configured description. |
| Remote answer persistence | Raw remote answers are not copied into the local response store after submission; the server remains canonical. | Intentional authority/privacy boundary. Local-only and AirDrop submission paths still store their response data; server history is merged for authenticated accounts. Creator analysis remains server-backed. |
| Creator registration | Registration no longer silently creates an organization from account fields. | Intentional: a global account is not an organization. Organization creation/ownership is separate. |
| Joining an organization | Membership is represented separately from the person's owned organization. | Intentional multi-organization identity behavior; joining does not rename or replace the user's own organization. |
| Guest identity | Requests use a server-issued guest bearer credential instead of trusting a client-supplied guest ID. | Intentional security change; existing guest participation is keyed by the server principal. |
| Outbox retention | Pending submissions are persisted before delivery; retry/dead-letter state is preserved rather than silently expired or dropped at capacity. | Intentional durability behavior; queue bounds reject new work instead of deleting accepted pending work. |
| Survey policy and routes | Survey submit, policy, metadata, analysis, history, leaderboard, organization, and auth routes remain present. | No removed route or major app-context entry point found in the reviewed changes. |

## Scope and reward contract

- Platform is a first-class `platform` scope, not a synthetic organization.
- Each response and reward total belongs to exactly one organization or platform scope.
- Platform standing counts platform-scoped responses only. Organization standing counts that organization's responses only.
- The legacy account-wide total remains available for compatibility, but is not a reward balance and must not be used to calculate a scope's level or leaderboard position.
- Organization-to-platform aggregate sharing defaults **on**. An organization owner (or authorized platform administrator) can turn it off. Sharing is limited to a monthly completion-count projection and contains no person identifier, answer, or individual point value. Existing organizations are migrated to this default without backfilling earlier response counts.
- Turning sharing off deletes that organization's saved aggregate projections. Organization points are never added to platform points through this setting.
- Platform aggregate reporting is administrator-only. This slice does not define public cross-organization rankings or cross-app reward transfer.
- Assessment marks/correctness remain a separate future capability; existing `points_earned` are not silently relabeled as quiz marks.

## Verification record

- Engine test suite: **510 tests passed across 79 files**.
- Engine TypeScript check and production build: passed. Feedora showcase TypeScript check: passed.
- Django project check and migration drift check: passed. Full Django API suite: **46 tests passed** on rerun.
- The full Django suite initially exposed a stale test expectation for account-wide `totalPoints`; the test now asserts the explicit per-scope field and confirms the legacy account-wide field remains compatible. One concurrency assertion failed during that first full run, then passed in an isolated run and in the full rerun.
- The local Django database received the two additive scope-sharing migrations. Its existing response count remained **42** before and after migration.

The audit's regression conclusion is bounded to current changed files and executable behavior covered by these checks; it cannot establish what an uncommitted pre-existing edit intended to preserve.
