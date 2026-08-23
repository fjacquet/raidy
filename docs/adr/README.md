# Architecture decision records

Decisions that shaped this codebase and would otherwise have to be reconstructed from comments.

A comment is found by someone already inside the file. An ADR is found by someone deciding whether
to change it — a different person, usually with a plan to "simplify" something load-bearing.

## Product and code

| # | Decision | Why you might come looking |
|---|---|---|
| [0003](./0003-strategy-pattern-per-platform.md) | One strategy per platform, not a switch per engine | Adding a platform, or wondering why there are sixty small files |
| [0004](./0004-engines-are-pure-functions.md) | Engines are pure functions, and never speak to the user | Before returning a formatted string from an engine |
| [0005](./0005-url-hash-as-sole-persistence.md) | The URL hash is the only persistence, and it omits defaults | **Before changing any default value** |
| [0006](./0006-monte-carlo-and-the-superset-invariant.md) | Monte Carlo resilience, bounded by a superset invariant | Before making the resilience model "more accurate" |
| [0007](./0007-sourced-lists-over-probed-flags.md) | Sourced lists and probed flags answer different questions | Before merging two per-platform lists that look redundant |
| [0012](./0012-per-platform-output-relevance.md) | Outputs are filtered per platform, like inputs | Adding a KPI or a dashboard section |
| [0013](./0013-sizing-tool-not-provisioning.md) | Raidy sizes storage; it does not provision it | When "export to Terraform" is proposed again |
| [0014](./0014-vendor-lookup-tables.md) | Ship the vendor's table when no closed form reproduces it | Before approximating a number a vendor publishes exactly |

## Tooling and delivery

| # | Decision | Why you might come looking |
|---|---|---|
| [0001](./0001-supply-chain-audit-gate.md) | Supply-chain and dependency-advisory gates | Why the denylist runs *before* `npm ci` |
| [0002](./0002-intentional-divergences-from-vatlas.md) | Intentional divergences from vatlas | Before "aligning" raidy with its sibling project |
| [0008](./0008-biome-as-single-toolchain.md) | Biome replaces ESLint and Prettier | Looking for the ESLint config |
| [0009](./0009-federated-ci.md) | CI is federated to reusable workflows | Asking what actually runs on a PR |
| [0010](./0010-dead-code-gate.md) | A dead-code gate, in a git hook, without husky | When knip reports something and you want to silence it |
| [0011](./0011-four-swiss-languages.md) | Four Swiss languages, technical terms untranslated | Adding user-facing text |

## What is deliberately not here

**There is no ADR per storage platform**, and there should not be. "We support ZFS" is a feature,
not a decision with alternatives. The per-platform material — S2D's stepped Reed-Solomon tables,
vSAN ESA having no controller layer, BeeGFS modelling local RAID plus buddy mirroring rather than
its own redundancy — is *vendor fact*, and it belongs where its citation can sit beside it:
[ENGINES.md](../ENGINES.md) for the formulas, [vendor-specs/](../vendor-specs/) for the source
documents, and `tests/fixtures/*-vectors.ts` for the numbers that pin them.

The test for whether something belongs here: **could a competent person reasonably have decided
otherwise?** If yes, record the alternative and why it lost. If it is simply what the vendor
documents, it is reference material.


## Writing a new one

Number sequentially, keep the shape: **Context → Decision → Consequences → Alternatives rejected**.

The Consequences section is the valuable part. Record what the decision cost as well as what it
bought, and name the incidents — "this shape has already produced a 45× overstatement" is worth
more to a future reader than a principle. Alternatives rejected stops the same proposal being
re-litigated every six months.

0003–0013 were written retroactively on 2026-08-05, when a documentation review found this
directory recorded no product architecture decision at all — only meta ones. The decisions
themselves are older; each ADR says so.
