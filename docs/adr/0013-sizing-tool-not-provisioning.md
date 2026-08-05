# ADR 0013 — Raidy sizes storage; it does not provision it

- **Status:** Accepted
- **Date:** 2026-08-05
- **Closes:** [#124](https://github.com/fjacquet/raidy/issues/124)

## Context

Raidy once emitted YAML, Ansible and Terraform from a configuration. It was proposed to extend
that export as a home for settings the calculation model does not use — which forced the question
of what it was for.

## Decision

**Raidy is a sizing tool.** Its deliverables are the numbers and the documents that carry them:
the dashboard, the PDF report, the PowerPoint one-pager.

The YAML/Ansible/Terraform export was **removed in v2.0.0**. What remains, and stays, is the
copy-pasteable ZFS provisioning command block in the Take-away card — the part people actually
used.

## Consequences

**The export was not deployable, and could not be made so.** A Terraform fragment derived from a
capacity estimate has no hosts, no network and no credentials. Closing that gap means Raidy
learning about infrastructure it deliberately knows nothing about.

**It cost more than it looked.** 429 lines, no dedicated test, and it knew only ZFS — one platform
of fifteen. Every new platform arrived with an implicit obligation to wire it in, which nobody
ever discharged.

**This ADR exists to stop the proposal recurring.** "Export to Terraform" is a reasonable-sounding
request that will be made again; the answer is not "no" but "that is a different product".

**The boundary also applies inward.** Raidy does not read an existing array, does not monitor, and
does not do capacity planning against real usage. It is the tool for the conversation *before* a
vendor sizer, not a replacement for one.

## Alternatives rejected

- **Extend it to all fifteen platforms.** Building more of something whose value nobody had
  established — the mistake the issue was opened to prevent.
- **Keep it ZFS-only, documented as a starting point.** Zero cost today, but it stays a place every
  new platform "should" be wired into, and it keeps implying a capability the tool does not have.
