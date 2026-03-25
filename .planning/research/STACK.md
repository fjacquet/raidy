# Stack Research

**Domain:** Dell Storage Capacity Formula Fixes (TypeScript calculation engine)
**Researched:** 2026-03-25
**Confidence:** MEDIUM — Dell Sizer requires authenticated login; formula reconstruction from whitepapers/community docs

---

## Recommended Stack

### Core Technologies

No new libraries are required. The fixes are pure arithmetic corrections within existing TypeScript engine files. The current stack is correct for this work.

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| TypeScript (existing) | ~5.x | Formula implementation | Pure functions, no runtime overhead, already in use |
| Vitest (existing) | ~2.x | Test vectors for all corrected formulas | Already configured, fast, supports test fixtures pattern in use |
| fast-check (existing) | ~3.x | Property-based validation of formula properties | Already in use; good for verifying boundary conditions at drive count limits |

### Supporting Libraries

No new npm packages are needed or recommended for the calculation fixes themselves.

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| *(none needed)* | — | All formulas are arithmetic | Pure math, no external dependencies required |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| Dell PowerSizer (web) | Official reference output to derive test vectors | Requires Dell partner/customer login at https://powersizer.dell.com/; use to generate reference capacity numbers for test vectors |
| Dell MidRange Sizer (web) | Reference for PowerVault ME5 | At https://midrangesizer.dell.com/; legacy tool covering ME4/ME5 |
| Dell PowerVault ME5 Admin Guide (PDF) | ADAPT stripe formula source | Publicly available at https://www.dell.com/support/manuals/en-us/powervault-me5012/me5_series_ag/ |
| Dell PowerStore KB 000188491 | PowerStore DRE geometry reference | https://www.dell.com/support/kbdoc/en-us/000188491/ |
| Dell ObjectScale Admin Guide | EC scheme overhead factors | https://www.dell.com/support/manuals/en-us/objectscale/ |
| Dell PowerScale OneFS Admin Guide | Disk usage calculation reference | https://www.dell.com/support/manuals/en-us/isilon-onefs/ifs_pub_9.2.1.0_administration_guide_cli/disk-usage-calculations |

---

## The Formulas (Research Findings)

### PowerVault ME5 — ADAPT

**Current bug:** Hardcoded 0.85/0.87 constants.

**Correct formula (MEDIUM confidence — reconstructed from multiple Dell sources):**

ADAPT uses a distributed spare mechanism. Spare capacity equals the sum of the two largest drives. Stripe geometry is either 8+2 (fewer than 20 drives) or 16+2 (20+ drives).

```
// Step 1: stripe efficiency from geometry
stripeEfficiency = driveCount < 20
  ? 8 / (8 + 2)   // = 0.8
  : 16 / (16 + 2) // = 0.8889

// Step 2: subtract distributed spare (equivalent of 2 drives) from total
effectiveDrives = driveCount - 2

// Step 3: usable fraction of raw
dataFraction = (effectiveDrives / driveCount) * stripeEfficiency
```

For N=12 with 8+2: `(10/12) * 0.8 = 0.667` (≈67%, not 85-87%)
For N=24 with 8+2: `(22/24) * 0.8 = 0.733`
For N=20+ with 16+2: `(18/20) * 0.8889 = 0.800`

**Sources:**
- Dell community formula: `((Ndisks - 2) * DiskSize) - 20%` — aligns with this reconstruction (MEDIUM)
- ME5 Admin Guide: stripe is 8+2 or 16+2 (HIGH — official documentation)
- ME4 community forum: https://www.dell.com/community/en/conversations/powervault/me4-adapt-usable-space-formula/ (MEDIUM)
- The 20% figure from community corresponds to 8+2 stripe parity overhead: 2/(8+2) = 20%

**Validation target:** Run Dell PowerSizer for ME5 with 12, 24, 48 drives and compare.

---

### PowerStore — RAID-5 and RAID-6

**Current bug:** Hardcoded 0.8 (RAID-5) and 0.75 (RAID-6) without accounting for stripe width or system overhead.

**Correct formula (MEDIUM confidence — from Dell KB 000188491 and DRE documentation):**

PowerStore uses the Dynamic Resiliency Engine (DRE). Geometry is auto-selected:
- RAID-5 (DRE SP): 4+1 if < 10 drives at setup, 8+1 if 10+ drives at setup
- RAID-6 (DRE DP): 4+2, 8+2, or 16+2 depending on drive count

Each RRS (RAID Resiliency Set) reserves one drive worth of space as distributed spare.

```
// DRE SP (RAID-5 equivalent)
const geometry_r5 = driveCount < 10 ? { data: 4, parity: 1 } : { data: 8, parity: 1 }
stripeEff_r5 = geometry_r5.data / (geometry_r5.data + geometry_r5.parity)
// 4+1 = 0.800, 8+1 = 0.889

// DRE DP (RAID-6 equivalent)
const geometry_r6 =
  driveCount <= 6  ? { data: 4, parity: 2 }
  : driveCount <= 10 ? { data: 8, parity: 2 }
  : { data: 16, parity: 2 }
stripeEff_r6 = geometry_r6.data / (geometry_r6.data + geometry_r6.parity)
// 4+2 = 0.667, 8+2 = 0.800, 16+2 = 0.889

// System overhead (internal reserved capacity)
// Amount scales with model/DRE size — ~7-8% range noted in milestone context
// Exact value requires PowerSizer validation per model
SYSTEM_OVERHEAD = 0.078  // approx 7.8% — NEEDS VALIDATION against PowerSizer
```

**Sources:**
- Dell KB 000188491: DRE geometry 4+1, 8+1, 4+2, 8+2, 16+2 (HIGH — official)
- Dell KB 000188491: "Each RRS contains spare capacity (a single drive worth of space)" (HIGH)
- Dell KB 000188491: "Appliance Total Physical Capacity = DRE capacity - Internal reserved capacity" (HIGH)
- System overhead percentage: LOW confidence — not disclosed in public docs, needs PowerSizer validation
- Blog post (rickgouin.com): confirms < 10 SSDs → 4+1, 10+ SSDs → 8+1 stripe selection (MEDIUM)

**Validation target:** Dell PowerSizer for PowerStore T-series with 10, 20, 40 drives.

---

### PowerScale (Isilon) — N+x Protection

**Current state:** The existing code `(usableDrives - x) / usableDrives` is the correct base formula for the protection overhead fraction, but does not account for the metadata overhead (journals, protection of metadata at one level higher than data).

**Correct formula (MEDIUM confidence — from Dell Info Hub and community sources):**

OneFS uses file-level erasure coding, not drive-level RAID groups. The protection overhead for a file protected at N+M on a cluster with enough nodes to use an N+M layout is:

```
// Base protection overhead fraction: M/(N+M)
// For +1 protection (N=data blocks, M=1): 1/(N+1)
// For +2d:1n (typical, uses 8+2 layout on 5+ nodes): 2/10 = 20% overhead

// The existing code uses (usableDrives - x) / usableDrives which approximates
// the large-cluster limit: as N→∞, M/(N+M) → M/N which matches (N-M)/N
// For small clusters this underestimates protection overhead

// Additional system overhead per Dell docs: < 0.8% per disk pool
// Metadata is mirrored one level above data protection (higher overhead for small files)
```

For practical purposes with the drive-count-based simulator:
- N+1: `(driveCount - 1) / driveCount` — existing formula is adequate approximation
- N+2: `(driveCount - 2) / driveCount` — existing formula is adequate approximation
- Mirror 2x: 0.5 — correct
- Mirror 3x: 1/3 — correct

The existing formulas are reasonable approximations. The concern is whether they match Dell PowerSizer output within 1%. Given OneFS is file-level and node-count dependent, the current approach may be as accurate as possible without node topology information.

**Sources:**
- Dell Info Hub: "overhead = M/(N+M) where M is the protection number" (HIGH)
- Dell Info Hub: 5-node cluster at +2d:1n → 8+2 layout → 20% overhead (HIGH)
- Dell community calculator (github.com/adamgweeks): empirical results match per-file calculation (MEDIUM)
- Dell OneFS Admin Guide disk-usage-calculations page (blocked at fetch time)

**Validation action needed:** Run PowerSizer for PowerScale cluster scenarios, compare with current formula output.

---

### PowerFlex — Erasure Coding

**Current state:** The existing EC ratios (4/5, 4/6, 8/10, 12/16) for the storage pool data fraction are mathematically correct.

**Additional overhead (MEDIUM confidence):**

PowerFlex has two granularity modes:
- Medium Granularity (MG): lower metadata overhead, suitable for block workloads
- Fine Granularity (FG): higher metadata overhead (required for snapshots/compression), uses NVDIMM

The existing code comment "PowerFlex FG metadata: 12-15% handled in main engine" needs verification. The main engine's overhead calculation for this should be checked.

```
// FG mode adds metadata overhead of approximately 12-15% on top of EC efficiency
// MG mode adds approximately 3-5% metadata overhead
// These are handled in volumetry/index.ts overhead section, NOT in the strategy
```

**Sources:**
- Dell PowerFlex 4.5.x Install Guide: FG requires NVDIMMs and inline compression (HIGH)
- Dell PowerFlex 3.5.x Getting Started: FG vs MG data layout difference (HIGH)
- Specific overhead percentages (12-15%): LOW confidence — not found in current public docs, mentioned in existing code comments as a prior decision

**Validation action needed:** Verify the existing volumetry engine overhead calculation for powerflex_fine_2way matches Dell sizing output.

---

### ObjectScale — Erasure Coding

**Current state:** The existing EC ratios (12/16, 10/12, 24/28, 1/3) are mathematically correct for the raw erasure coding overhead.

**Additional overhead for geo-replication (MEDIUM confidence):**

For geo-replication, ObjectScale replicates full copies between sites. Each site does local EC, then replicates to remote sites.

```
// Single site: EC efficiency = data/(data+coding)
// objectscale_ec_12_4: 12/16 = 0.75
// objectscale_ec_10_2: 10/12 = 0.8333

// Two-site geo-replication: multiply by 0.5 (full replica at each site)
// Three-site with XOR: overhead is lower than 2-site, but not 1/3

// Storage overhead multipliers per Dell ObjectScale docs:
// 12+4 single site: 1.33x overhead (=75% efficiency)
// 12+4 two-site geo: 2.67x overhead (=37.5% efficiency)
// 10+2 single site: 1.2x overhead (=83.3% efficiency)
```

The current code only captures single-site efficiency. Geo-replication multiplier is not implemented. If ObjectScale geo-replication is a selectable option, this overhead needs to be applied.

**Sources:**
- Dell ObjectScale Admin Guide 1.0.0: "12+4 storage protection overhead is 1.33x" (HIGH — official docs)
- Dell ObjectScale Admin Guide: "two-site geo = 2.67x overhead" (HIGH)
- ObjectScale Admin Guide URL: https://www.dell.com/support/manuals/en-us/objectscale/objectscale_p_adminguide_1_0_0/

---

## Installation

No new packages required. All fixes are arithmetic formula corrections in existing TypeScript files.

```bash
# No new dependencies needed for formula fixes

# For test vectors (already installed):
# vitest, fast-check — already in package.json
```

---

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| Pure TypeScript arithmetic | Math.js or decimal.js library | Only if floating-point precision becomes an issue; unlikely for storage capacity (percentages at ±1% tolerance) |
| Manual test vectors from Dell Sizer | Automated API scraping | Dell Sizer has no public API; manual vector extraction required |
| Reconstructing formulas from docs | Contacting Dell SE | Use Dell SE if PowerSizer access is unavailable and docs remain ambiguous |

---

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| Hardcoded percentage constants (0.85, 0.87, 0.75) | Does not scale with drive count | Drive-count-aware formula with geometry lookup |
| Dell Sizer API calls at runtime | No public API exists; SPA must remain static | Encode validated reference vectors as test fixtures |
| New npm dependencies for math | Overkill for simple arithmetic ratios | Native TypeScript arithmetic |

---

## Stack Patterns by Variant

**If verifying ADAPT for fewer than 12 drives:**
- ADAPT requires minimum 12 drives per Dell documentation
- Formula is undefined below 12; validate drive count constraint in input validation

**If verifying PowerStore stripe geometry selection:**
- Stripe width is locked at cluster creation time (not runtime)
- Raidy should treat stripe width as a user-selectable option in PowerStoreOptions, not auto-detected
- Currently auto-determined by driveCount which is a reasonable approximation

**If PowerScale node count is unknown:**
- Current drive-count approximation is the best available without node topology
- Flag as "approximate" in UI tooltip rather than claiming exact accuracy

---

## Version Compatibility

All changes are within existing TypeScript files. No version compatibility concerns.

| Package | Compatible With | Notes |
|---------|-----------------|-------|
| Vitest 2.x (existing) | fast-check 3.x (existing) | No changes needed |
| TypeScript 5.x (existing) | All existing packages | No changes needed |

---

## Sources

- Dell PowerVault ME5 ADAPT Community Formula: https://www.dell.com/community/en/conversations/powervault/me4-adapt-usable-space-formula/647f7f85f4ccf8a8dee04702 — MEDIUM confidence (community, not official)
- Dell PowerVault ME5 Admin Guide (ADAPT section): https://www.dell.com/support/manuals/en-us/powervault-me5012/me5_series_ag/adapt — HIGH confidence (official; blocked at fetch, reconstructed from search snippets)
- Dell PowerVault ME5 ADAPT Whitepaper: https://www.delltechnologies.com/asset/en-us/products/storage/industry-market/dell-powervault-me5-adapt-software-wp.pdf — MEDIUM (binary PDF, extracted via search snippets)
- Dell PowerStore KB 000188491: https://www.dell.com/support/kbdoc/en-us/000188491/ — HIGH confidence (official; blocked at fetch, reconstructed from search snippets confirming DRE geometry)
- Dell PowerStore DRE Info Hub: https://infohub.delltechnologies.com/l/dell-powerstore-clustering-and-high-availability/dynamic-resiliency-engine-dre-6 — HIGH confidence (blocked at fetch)
- Dell ObjectScale Admin Guide 1.0.0: https://www.dell.com/support/manuals/en-us/objectscale/objectscale_p_adminguide_1_0_0/data-protection-with-objectscale-erasure-coding-schemes — HIGH confidence (official; blocked at fetch, confirmed from search snippets with 1.33x overhead figure)
- Dell PowerScale OneFS disk usage calculations: https://www.dell.com/support/manuals/en-us/isilon-onefs/ifs_pub_9.2.1.0_administration_guide_cli/disk-usage-calculations — HIGH confidence (official; blocked at fetch)
- Dell Info Hub — OneFS protection overhead formula M/(N+M): https://infohub.delltechnologies.com/en-us/l/powerscale-onefs-technical-overview-1/data-protection-119/ — HIGH confidence
- Dell PowerSizer (requires auth): https://powersizer.dell.com/ — Authoritative reference tool for generating test vectors
- Dell PowerFlex 4.5.x Install Guide: https://www.dell.com/support/manuals/en-us/scaleio/powerflex_install_upgrade_guide_4.5.x/ — HIGH confidence

---

## Access Constraints

Dell's support portal (dell.com/support/manuals/, dell.com/support/kbdoc/) returns HTTP 403 to automated fetchers even for public documents. Dell Info Hub (infohub.delltechnologies.com) returns reCAPTCHA pages. Dell PowerSizer requires authenticated partner/customer login.

**Recommended approach for test vector generation:**
1. Access dell.com/support/manuals/ in a browser while logged into Dell account
2. Use PowerSizer at powersizer.dell.com for authoritative capacity outputs
3. Record inputs and outputs manually to populate test fixture vectors

---
*Stack research for: Dell storage capacity formula fixes (PowerVault ADAPT, PowerStore, PowerScale, PowerFlex, ObjectScale)*
*Researched: 2026-03-25*
