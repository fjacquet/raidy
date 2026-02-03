# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
