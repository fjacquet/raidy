# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.8.0] - 2026-06-25

### Added
- **vSAN compression & deduplication now affect usable capacity.** The compression and deduplication toggles in the vSAN panel were dead — `vsanOptions` was never forwarded to the data-reduction stage and that stage had no vSAN branch, so toggling them changed nothing (both OSA and ESA). Each toggle now drives effective capacity (`C_eff = C_usable × comp × dedup`), with dedicated ratio sliders in the vSAN panel. Defaults follow ESA: compression on (1.5×), dedup off. The redundant global compression/dedup sliders are hidden for vSAN, consistent with Nutanix/Ceph/PowerStore.

### Fixed
- **vSAN no longer reserves dedicated hot spares.** vSAN (OSA and ESA) rebuilds from distributed slack space, not dedicated spare drives, yet the app defaulted to 1 hot spare and deducted a full drive's capacity from usable. Selecting a vSAN topology now forces 0 spares (enforced in the store and defensively in the volumetry/performance hooks so shared URLs cannot reintroduce one), and the hot-spares slider is replaced by an explanatory note.
- **vSAN ESA bottleneck chain no longer shows a SAS HBA.** ESA is NVMe-only with drives attached directly to PCIe, but the performance chain always inserted a controller layer and defaulted ESA to a "Generic SAS HBA". The controller layer is now dropped for ESA (the chain becomes Media → PCIe → Network), the IOPS ceiling falls back to the PCIe/network limit, and ESA defaults its controller to the NVMe HBA.

### Changed
- **Realistic vSAN network bottleneck model.** The network stage compared raw aggregate media bandwidth against a one-directional port aggregate (`speed × nodes`), so a small NVMe cluster was always flagged network-bound. The vSAN network ceiling now accounts for full-duplex links, on-the-wire compression (ESA compresses before replication), and the fraction of throughput that actually crosses the fabric (writes × replication/EC factor + remote reads). Non-vSAN topologies keep the previous model unchanged.

## [1.7.1] - 2026-05-24

### Fixed
- **Ceph compression now reduces effective capacity.** Enabling compression on a Ceph pool previously had no effect — the toggle, the algorithm selector, and the global compression slider were all dead. Effective capacity now reflects the chosen BlueStore algorithm (ZSTD 1.7×, LZ4 1.4×, Snappy 1.3×), gated by the compression toggle. The Ceph panel shows the resulting ratio, and the redundant global compression/dedup sliders are hidden for Ceph (consistent with Nutanix/PowerStore). Ceph has no native inline dedup, so only compression applies.

## [1.7.0] - 2026-05-24

### Added
- **Auto light/dark mode.** A header toggle (Auto / Light / Dark) switches the theme; Auto follows the OS (`prefers-color-scheme`) and reacts to changes. The preference persists (`raidy-theme`) and applies before first paint (no flash). Built on Tailwind's class-based `dark:` variant.
- The PowerPoint export **follows the app theme** — a light deck (white paper) in light mode, the dark deck in dark mode, with charts captured on a matching background.

## [1.6.1] - 2026-05-24

### Changed
- PowerPoint export is now a single executive one-pager instead of a 7-slide deck. The slide keeps all visuals — Sankey capacity waterfall, performance speedometers, and resilience donut — alongside a compact key-metrics grid (usable capacity, efficiency, IOPS, power, energy, CO₂, survival) and a bottleneck footer.

## [1.6.0] - 2026-05-24

### Changed
- Federated developer conventions with the sibling **vatlas** project (reference): Biome config (now identical), TypeScript layout + test type-checking via `tsconfig.test.json`, dependency versions, and the `docs/` structure.
- Upgraded Vite 7→8, `@vitejs/plugin-react` 5→6, i18next 25→26, react-i18next 16→17, jsdom 28→29; removed unused `autoprefixer`/`postcss`.
- Consolidated CI into a single hardened pipeline (`static.yml`): Node 24, SHA-pinned actions, supply-chain denylist, `npm audit` (LOW+), OSV-Scanner gate, bundle-size budgets, and a CycloneDX SBOM. Removed Snyk.
- Restructured documentation under `docs/` (ARCHITECTURE, DEVELOPMENT, TESTING, CONFIGURATION, GETTING-STARTED) with ADRs for the security gate and the intentional divergences from vatlas.

### Fixed
- PowerPoint export: the drive-detail slide now reads the correct nested fields — Active Power (`power.load_watts`) and DWPD (`reliability.dwpd`, shown only for flash). Previously rendered "undefined W" and never emitted the DWPD row.
- Resolved 170 latent type errors across the test suite, which is now type-checked in CI (the previous `typecheck` script was a no-op for app/test code).

### Security
- Bumped `dompurify` to 3.4.5 (resolves a moderate advisory). CI now fails on LOW+ advisories via both `npm audit` and OSV-Scanner, and adds a telemetry-package denylist supply-chain gate.

## [1.2.0] - 2026-02-03

### Added
- Backup Requirements calculation connecting existing retention/change rate settings to a new output card (#8)

## [1.1.0] - 2026-02-03

### Added
- Filesystem selector now affects capacity calculations (#6)
  - XFS: 1%, ext4: 5%, ZFS: 1%, Btrfs: 4%, ReFS: 2%, NTFS: 2%

### Security
- Updated jspdf to 4.1.0 (fixes 4 vulnerabilities)

## [1.0.0] - 2026-02-03

### Added
- User-defined performance capacity threshold (50-100%) for operational capacity planning (#5)
- Contextual help tooltips throughout the UI
- Sizing guide documentation
- Smart drive connectivity filtering based on topology
- Independent calculation hooks with focused dependencies for better performance
- i18n support for EN, FR, DE, IT (Swiss languages)

### Changed
- Anonymized drive database (removed vendor brand names)
- Refactored `useCalculations` hook to orchestrate independent hooks

### Fixed
- Nutanix RF2/RF3/EC efficiency calculations
- TypeScript build errors
- Edge case in standard error calculation
- Lint errors with React import suppressions

## [0.1.0] - Initial Development

### Added
- Core volumetry engine with strategy pattern for multiple platforms
- Performance engine with bottleneck analysis
- Resilience engine with Monte Carlo simulation
- Sustainability engine with power/CO2 calculations
- Support for: RAID, ZFS, vSAN, S2D, Ceph, Nutanix, Dell (PowerFlex, PowerStore, PowerScale, PowerVault), NetApp, Synology
- Sankey diagram visualization
- PDF export
- URL-based state sharing (LZ-String compression)
