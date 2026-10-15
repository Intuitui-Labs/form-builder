# Feedora Showcase

A gamified research-survey product built on the headless
`@intuitui-labs/form-builder-engine`.

This is a **downstream** application: it consumes the engine as a library and
never reaches back into engine internals. All product-specific logic lives here
as **hexagonal adapters** written against engine ports, plus two
application-level ports that describe capabilities the engine does not model.

## Architecture

```
                         engine (upstream, untouched)
   IRewardEnginePort  <── FeedoraRewardAdapter      (her points rules)
   IProgressStrategyPort <─ FeedoraProgressAdapter   (velocity / effort)
   IFeedbackNotifierPort <─ FeedoraRewardNotifier    (toast stream)
                         +  application-level ports (downstream, this app)
   IMeasurementPort   <── HmsamMeasurementAdapter    (HMSAM constructs + Cronbach α)
   IContributionPort  <── FeedoraContributionAdapter (levels, voice economy, entities)
```

### Entities (organizations)

A **Feedora Entity** is an organization (university / school / company /
research / community) that hosts surveys. Users join an entity; their
contributions (points, completed surveys, badges) persist per `(user, entity)`
and drive both the level curve and the entity leaderboard.

## Screens

- **Survey** — the 38-item HMSAM instrument rendered by the engine, with live
  voice-points rewards and level progression.
- **Insights** — the `IMeasurementPort` report: per-construct means, normalized
  scores, and Cronbach's α across responses collected this session.
- **Community** — entities, persistent contributors, and the within-entity
  leaderboard driven by the `IContributionPort`.

## Run

```bash
pnpm install
pnpm --filter @intuitui-labs/feedora-showcase run web
```

## Status

Storage is in-memory (seeded demo data). The transport/storage layer is a port
boundary; a Supabase adapter can be dropped in without touching the domain.
