# Drive database gap-fill — design

Date: 2026-06-26
Status: approved (brainstorming) → ready for implementation plan

## Context

Raidy's drive database (`src/data/drives.json`, 57 drives) backs every calculation and the
drive picker. The `Drive` schema (`src/types/drive.ts`) is already rich — beyond the
`DriveType` enum (`HDD | SSD_SATA | SSD_SAS | SSD_NVMe`) it carries optional `recording`
(CMR/SMR/HAMR), `nandType` (SLC/MLC/TLC/QLC/3DXPoint), `dualActuator`, `latency_us` (SCM),
`rpm`, `tier`, plus separate `interface` and `formFactor` fields.

Auditing coverage surfaced gaps not in the *type system* but in the *data and the union
members that have zero or near-zero representation*:

- **`nandType` TLC and MLC are defined but used by zero drives**, although TLC is the dominant
  enterprise cell type — 44 SSDs are untagged.
- **Form factors `E1.L`, `E3.L`, `AIC` have zero drives.** `AIC` is additionally absent from
  every form-factor filter (fully orphaned).
- **Capacity holes:** HDD 14/20/22/26/28/30 TB; 24G-SAS SSD 6.4/7.68/15.36 TB; small SATA SSD
  boot capacities (480/960 GB).
- `recording: SMR` and `HAMR` have only one drive each.

The fix is **data completeness**, not a taxonomy change: add ~15 real-world entries that fill
the holes and exercise the thin union members, backfill `nandType` on existing SSDs, and prune
the one truly dead form-factor member.

## Goals

- Add ~15 anonymized, spec-accurate drive entries filling the **highest-value** capacity /
  form-factor / cell-type holes above. Lower-value holes (14 TB HDD — sits between existing
  12 and 16 TB; 6.4 TB 24G-SAS SSD) are intentionally deferred to keep the set focused.
- Backfill `nandType` on the ~44 untagged existing SSDs so TLC is a well-represented member.
- Remove the orphaned `AIC` form factor.

## Non-goals

- No change to `DriveType`, `DriveConnectivity`, or the engines' `type.startsWith('SSD')` logic.
- No new media class (SCM/Optane already modeled via `nandType: 3DXPoint` + `latency_us`).
- No tape/LTO, no `MLC` drives (legacy; member retained but stays unused — acceptable).

## New drive entries (~15)

Anonymized naming follows the existing convention (e.g. `Enterprise HDD 7.2K SAS 3.5" 30TB HAMR`,
`Datacenter NVMe PCIe5 E1.L 122.88TB QLC Read-Intensive`). IDs follow the existing scheme
`<tier>-<media>-<iface>-<capacity>[-<nand>]-<formfactor>[-<endurance>]`
(e.g. `ent-hdd-7k2-sas-30tb-hamr`, `dc-nvme-pcie5-122880gb-qlc-e1l-ri`).

| # | type | capacity | interface | formFactor | recording / nandType | tier | endurance |
|---|------|----------|-----------|------------|----------------------|------|-----------|
| 1 | HDD | 20 TB | SATA | 3.5" | CMR | enterprise | — |
| 2 | HDD | 22 TB | SAS | 3.5" | CMR | enterprise | — |
| 3 | HDD | 28 TB | SAS | 3.5" | HAMR | enterprise | — |
| 4 | HDD | 30 TB | SATA | 3.5" | HAMR | enterprise | — |
| 5 | HDD | 26 TB | SATA | 3.5" | SMR | enterprise (archival) | — |
| 6 | SSD_SAS | 7.68 TB | SAS (24G) | 2.5" | TLC | enterprise | Mixed-Use |
| 7 | SSD_SAS | 15.36 TB | SAS (24G) | 2.5" | TLC | enterprise | Read-Intensive |
| 8 | SSD_NVMe | 30.72 TB | PCIe5 | E1.L | QLC | datacenter | Read-Intensive |
| 9 | SSD_NVMe | 122.88 TB | PCIe5 | E1.L | QLC | datacenter | Read-Intensive |
| 10 | SSD_NVMe | 61.44 TB | PCIe5 | E3.L | QLC | datacenter | Read-Intensive |
| 11 | SSD_NVMe | 3.84 TB | PCIe5 | E3.S | TLC | datacenter | Mixed-Use |
| 12 | SSD_NVMe | 7.68 TB | PCIe5 | U.3 | TLC | enterprise | Read-Intensive |
| 13 | SSD_NVMe | 1.92 TB | PCIe5 | M.2 | TLC | enterprise | (boot/edge) |
| 14 | SSD_SATA | 960 GB | SATA | 2.5" | TLC | enterprise | Mixed-Use |
| 15 | SSD_SATA | 480 GB | SATA | 2.5" | TLC | enterprise | (boot) |

Each entry must populate every required `Drive` field: `id, model, type, capacity_raw` (decimal
bytes), `sector_size` (4096), `performance{iops_read, iops_write, bandwidth_read_mb,
bandwidth_write_mb}`, `reliability{ure_rate, afr, dwpd, mtbf_hours}`, `power{idle_watts,
load_watts}`, `cost_usd`, plus the optional `formFactor, interface, tier, recording/nandType,
rpm` (HDD) as applicable.

**Spec sourcing (per the repo's MCP rule):** every numeric spec is validated against a real
2025-26 enterprise drive via Perplexity before writing, then de-branded. Anchors (for the
implementer): Seagate Exos / WD Ultrastar (HDD incl. HAMR 30/32 TB and SMR), Solidigm D5-P5336
(QLC ruler E1.L/E3.S up to 122 TB), Micron 6550/9550 and Kioxia CD/CM (TLC PCIe5), and 24G-SAS
TLC SSDs.

## TLC backfill (existing SSDs)

Set `nandType` on the ~44 untagged SSDs in `drives.json` using this heuristic from existing
fields (no new data needed):

- High-capacity, low endurance (DWPD ≲ 1, Read-Intensive, ≥ ~15 TB) → `QLC`.
- Mainstream Mixed-Use / Read-Intensive (DWPD ~1–3) → `TLC`.
- High-endurance Write-Intensive (DWPD ≳ 10) → `TLC` (modern) — do **not** introduce MLC.
- Leave drives already carrying `nandType` (SLC/QLC/3DXPoint) untouched.

This is additive (a new optional field per entry); it changes no IDs, capacities, or specs, so
no existing test that looks drives up by ID is affected.

## AIC prune (the only type change)

Remove `'AIC'` from the `FormFactor` union (`src/types/drive.ts`) and from the `all` array in
`FORM_FACTOR_TO_TYPES`. No drive uses it and no filter maps to it, so the removal is inert.
`MLC` stays in `NandType` (valid historical member, simply unused).

## Verification

- `npm run typecheck` (catches any AIC references; the discriminated `FormFactor` union enforces
  valid form factors on every new entry), `npm run lint`, `npm test`, `npm run build` — all green.
- No test asserts the drive count, so additions are safe; run the full suite to confirm the new
  entries parse and feed the engines without NaN/zero-state regressions.
- `npm run dev`: drive picker shows the new entries; the EDSFF form-factor filter now returns
  E1.L / E3.L drives; capacity sort shows the new HDD/SSD points; a tiered S2D/vSAN config can
  select the new ruler QLC as a capacity tier.
- Sanity-check a couple of new entries' computed IOPS/power against their Perplexity source.

## Risks

- **Spec accuracy** — invented specs would mislead users; mitigated by Perplexity validation +
  spot-checks against the source datasheet.
- **TLC backfill misclassification** — a borderline RI drive tagged TLC vs QLC; low impact
  (cell type is informational/endurance-adjacent, not a calc input today) and reviewable in the diff.
