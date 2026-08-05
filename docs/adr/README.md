# Architecture decision records

Decisions that shaped this codebase and would otherwise have to be reconstructed from comments.

A comment is found by someone already inside the file. An ADR is found by someone deciding whether
to change it — which is a different person, usually with a plan to "simplify" something load-bearing.

| # | Decision | Why you might come looking |
|---|---|---|
| [0001](./0001-supply-chain-audit-gate.md) | Supply-chain and dependency-advisory gates | Why the denylist runs *before* `npm ci` |
| [0002](./0002-intentional-divergences-from-vatlas.md) | Intentional divergences from vatlas | Before "aligning" raidy with its sibling project |
| [0003](./0003-strategy-pattern-per-platform.md) | One strategy per platform, not a switch per engine | Adding a platform, or wondering why there are sixty small files |
| [0004](./0004-engines-are-pure-functions.md) | Engines are pure functions, and never speak to the user | Before returning a formatted string from an engine |
| [0005](./0005-url-hash-as-sole-persistence.md) | The URL hash is the only persistence, and it omits defaults | Before changing any default value |
| [0006](./0006-monte-carlo-and-the-superset-invariant.md) | Monte Carlo resilience, bounded by a superset invariant | Before making the resilience model "more accurate" |
| [0007](./0007-sourced-lists-over-probed-flags.md) | Sourced lists and probed flags answer different questions | Before merging two per-platform lists that look redundant |

0003–0007 were written retroactively on 2026-08-05, when a documentation review found that this
directory existed but recorded no product architecture decision at all — only meta ones. The
decisions themselves are older; each ADR says where it came from.

## Writing a new one

Number sequentially, keep the shape: **Context → Decision → Consequences → Alternatives rejected**.

The Consequences section is the valuable part. Record what the decision cost as well as what it
bought, and name the incidents — "this shape has already produced a 45× overstatement" is worth
more to a future reader than a principle. Alternatives rejected stops the same proposal being
re-litigated every six months.
