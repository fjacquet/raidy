# ADR 0005 — The URL hash is the only persistence, and it omits defaults

- **Status:** Accepted
- **Date:** 2026-08-05 (recorded retroactively)

## Context

"Copy URL to Share" is a core feature: a sizing scenario must be reproducible from a link, with no
account, no backend and no export step. Raidy has no server, so the link *is* the document.

## Decision

The whole configuration is serialised, LZ-String compressed and stored in the URL hash as
`#raidy=<data>` (`src/store/urlStorage.ts`). There is no localStorage of configuration and no
backend. `partialize` in `configStore.ts` runs `omitDefaults`, so the hash carries **only the
values that differ from the defaults** — without it the compressed payload roughly triples and
long links break in chat clients and email.

Incoming hashes are validated with Zod (`src/utils/schemas.ts`) before reaching the store: a
malformed or hostile link falls back to defaults with a toast rather than crashing.

## Consequences

**Changing a default silently rewrites every old link that relied on it.** This is the trap, and
it is invisible from the diff, because changing a default touches no URL code. It happened in
v2.0.0: `hotSpares` went from 1 to 0, so a link created under the old default — which therefore
never recorded `hotSpares` — now resolves to 0 and reports one drive per server *more* usable
capacity than when it was shared. Links where the user had changed the value are unaffected,
because a non-default value is written into the hash.

Any PR changing a `DEFAULT_*` or a slice's initial value must state the effect on existing links
in its CHANGELOG entry.

**Removing an option field is the harmless case, but only if the schema changes too.** The nested
schemas are plain `z.object()`: they strip unknown keys, so an old link carrying a deleted control
still loads — but they *require* declared ones, so deleting a field from the type without deleting
it from the schema breaks parsing for every link.

**No sensitive data is at stake**, which is what makes this acceptable. Raidy is a calculator; its
inputs are drive models and counts. See [ADR-0002](./0002-intentional-divergences-from-vatlas.md)
for why the sibling project made the opposite choice.

## Alternatives rejected

- **localStorage.** Does not survive being sent to a colleague, which is the entire point.
- **A backend with short links.** Adds an account, a database, a privacy surface and an operating
  cost to a tool that otherwise deploys as static files.
- **Serialising everything, defaults included.** Simpler and immune to the trap above, at roughly
  triple the payload. Rejected for link length; the trap is handled by documentation and this ADR
  instead.
