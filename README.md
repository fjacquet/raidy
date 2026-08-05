# Raidy

[![CI](https://github.com/fjacquet/raidy/actions/workflows/ci.yml/badge.svg)](https://github.com/fjacquet/raidy/actions/workflows/ci.yml)
[![Security](https://github.com/fjacquet/raidy/actions/workflows/security.yml/badge.svg)](https://github.com/fjacquet/raidy/actions/workflows/security.yml)
[![Deploy](https://github.com/fjacquet/raidy/actions/workflows/deploy.yml/badge.svg)](https://github.com/fjacquet/raidy/actions/workflows/deploy.yml)
[![Release](https://img.shields.io/github/v/release/fjacquet/raidy?sort=semver)](https://github.com/fjacquet/raidy/releases/latest)
[![Live demo](https://img.shields.io/badge/demo-fjacquet.github.io%2Fraidy-2ea44f)](https://fjacquet.github.io/raidy/)

Browser-based storage infrastructure simulator for enterprise storage platforms.

## Supported Platforms

- **ZFS**: RAID-Z1/Z2/Z3, dRAID, Mirror, Stripe with slop space and special vdev
- **S2D (Storage Spaces Direct)**: Mirror, Parity, Dual Parity, MAP with auto-tiering
- **Ceph**: Replicated (2/3/4x) and Erasure Coded (2+1, 4+2, 8+3, 8+4) pools
- **Longhorn**: SUSE/Kubernetes distributed block storage, R2/R3 replicated pools with free-space and snapshot guardrails
- **BeeGFS**: Parallel filesystem with local RAID storage targets (RAID6/RAID10/RAIDz2/single), Buddy Mirroring, and metadata-target sizing advisory
- **PowerFlex**: Medium (1MB) and Fine (8KB) granularity, 2/3-way mirror, EC 4+1/4+2/8+2/12+4
- **vSAN**: OSA and ESA with RAID-1/5/6 policies
- **NetApp**: RAID-DP, RAID-TEC with ADP, WAFL overhead, and data reduction
- **Synology**: SHR, SHR-2, RAID F1 with Btrfs/ext4
- **Nutanix**: RF2/RF3 and EC-X, all-flash or hybrid clusters
- **Dell**: PowerStore, PowerScale, ObjectScale, and PowerVault ME5 (RAID 1/5/6/10 and ADAPT)
- **Standard RAID**: 0, 1, 5, 6, 10, 50, 60

## Features

- **Presales guided-narrative dashboard**: A persistent headline KPI band followed by five
  narrative "acts" — Capacity, Performance, Resilience, Cost, Take-away — instead of an
  undifferentiated card grid. Headline tiles and sections adapt to the selected platform (e.g.
  no effective-capacity tile for RAID, no dedup framing for Longhorn) so only what's meaningful
  is shown.
- **Volumetry Engine**: Calculate usable/effective capacity with platform-specific overheads
- **Performance Engine**: Identify bottlenecks across media, controller, bus, and network layers
- **Resilience Engine**: Monte Carlo simulations for data loss probability
- **Sustainability Engine**: Energy consumption, CO2 emissions, and flash endurance analysis
- **Backup Engine**: Estimate backup storage requirements based on change rate and retention
- **Unit System Toggle**: Display capacity in binary (TiB/GiB) or decimal (TB/GB) units
- **Multi-Server Support**: Scale calculations across multiple servers/nodes
- **Built-in guide**: In-app explanations of what each figure means, per platform, plus a tooltip
  on every non-obvious control
- **Four languages**: EN, FR, DE, IT, with Swiss number formatting
- **Exports**: PDF report and PowerPoint one-pager, both theme- and locale-aware

## Quick Start

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build
```

## Technology Stack

- React 19 + Vite 8
- TypeScript (strict mode)
- Zustand (URL hash state persistence)
- Tailwind CSS v4 (dark mode)
- D3-sankey (capacity waterfall) + hand-rolled SVG gauges and charts
- Web Workers (Monte Carlo simulations)

See [`docs/`](./docs/) for the [user guide](./docs/USER-GUIDE.md),
[architecture](./docs/ARCHITECTURE.md), the [engine reference](./docs/ENGINES.md),
[development](./docs/DEVELOPMENT.md), [testing](./docs/TESTING.md),
[configuration & CI](./docs/CONFIGURATION.md), [security](./docs/SECURITY.md),
[getting started](./docs/GETTING-STARTED.md), [decisions](./docs/adr/) and the
[vendor specifications](./docs/vendor-specs/) the engines were built from.

## Development

```bash
# Type checking
npm run typecheck

# Lint (Biome)
npm run lint
npm run lint:fix

# Format
npm run format

# Run tests
npm test
```

## Drive Database

Comprehensive drive database including:

- **NVMe SSDs**: Samsung PM1733/PM1735, Intel P5316/P5510/P5520, Micron 9400, Kioxia CM6/CD8, SK Hynix PE8110, Solidigm D5-P5336
- **SAS SSDs**: Samsung PM1643a, Seagate Nytro
- **SATA SSDs**: Samsung 870 EVO, Crucial MX500
- **Enterprise HDDs**: WD Ultrastar DC HC550/HC580, Seagate Exos X16/X18/X20/X24
- **NAS HDDs**: WD Red Plus/Pro (2-16TB), Seagate IronWolf/Pro (2-16TB), Toshiba N300 (4-16TB)
- **High-capacity & EDSFF**: HAMR/SMR/CMR nearline HDDs up to 30TB, EDSFF E1.L/E3.L QLC NVMe rulers up to 122.88TB, 24G-SAS and boot-class SATA SSDs

## Project Structure

```
src/
├── components/
│   ├── common/      # Shared UI components
│   ├── inputs/      # Configuration panels
│   ├── outputs/     # Visualization components (headline band + narrative acts/)
│   └── layout/      # App layout (Cockpit, Sidebar)
├── data/            # Static drive database (drives.json)
├── engines/         # Calculation modules
│   ├── volumetry/   # Capacity calculations
│   ├── performance/ # Bottleneck analysis
│   ├── resilience/  # Monte Carlo simulation
│   └── sustainability/ # Energy & TCO
├── hooks/           # Custom React hooks
├── store/           # Zustand state management
├── types/           # TypeScript definitions
└── utils/           # Formatters, unit conversion, serialization
```

## License

MIT
