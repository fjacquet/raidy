# ADR 0003 — One strategy per platform, not a switch per engine

- **Status:** Accepted
- **Date:** 2026-08-05 (recorded retroactively; the pattern predates this file)

## Context

Raidy models fifteen storage platforms across four calculation engines. Every engine has to answer
the same questions — how much capacity survives protection, what the write penalty is, which layer
binds — and each platform answers them differently, often with vendor-specific stepped tables
rather than formulas.

The obvious implementation is a `switch (topology.type)` inside each engine. With fifteen types and
four engines that is sixty branches, and adding a platform means finding all of them.

## Decision

Each engine is an **orchestrator plus a strategy per platform**:

```
src/engines/<module>/
├── index.ts           # selects and calls the strategy
├── strategies/        # one file per platform, one shared interface
├── helpers/
└── overhead/
```

Adding a platform is: a strategy file, a registration in `index.ts`, a type in
`src/types/topology.ts`, a store option, a UI panel.

TypeScript makes most of that mandatory rather than remembered. `TopologyType` is a closed union,
the strategy registries are `Record<TopologyType, …>` or end in `assertNever`, so the build fails
until every engine has an answer for a new platform.

## Consequences

**The compiler catches the branches; it does not catch the tables.** A handful of call sites are
keyed by string or fall through a `default` and stay silent when a platform is added — the
`VALID_TOPOLOGY_TYPES` list, `getParityDrives` in the resilience worker, the filesystem-overhead
switch, and the Zod schema. Each has produced a real defect (silent 100% efficiency, parity
defaulting to 1). They are enumerated in the "silent if forgotten" list in the BeeGFS design spec,
and the capability probe suite exists partly to catch them.

**Strategy files invite copy-paste, and copy-paste has been expensive here twice.** The S2D read
blend duplicated into vSAN would have propagated a 45× overstatement (#111); two paths computing
raw capacity produced a 10× error in the Hardware panel (#121). Shared behaviour belongs in
`helpers/` or a parameterised function — see ADR-0006 for the resilience equivalent.

## Alternatives rejected

- **A switch per engine.** Sixty branches, and no compiler pressure to complete them.
- **A single data table per platform.** Several platforms are not expressible as coefficients: S2D
  dual parity is a stepped table that differs between all-flash and hybrid, vSAN ESA adapts its
  stripe width to cluster size, PowerVault ADAPT distributes spare capacity. Code was needed.
