# Raidy

Browser-based storage infrastructure simulator for NVMe, ZFS, S2D, and cloud hybrid configurations.

## Features

- **Volumetry Engine**: Calculate usable capacity for RAID, ZFS, S2D topologies
- **Performance Engine**: Identify bottlenecks across media, controller, bus, and network layers
- **Resilience Engine**: Monte Carlo simulations for data loss probability
- **Sustainability Engine**: Energy consumption, CO2 emissions, and flash endurance analysis

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

- React 19 + Vite 7
- TypeScript (strict mode)
- Zustand (URL hash state persistence)
- Tailwind CSS v4 (dark mode)
- Recharts + D3-sankey (visualizations)
- Web Workers (Monte Carlo simulations)

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

## Project Structure

```
src/
├── components/
│   ├── common/      # Shared UI components
│   ├── inputs/      # Configuration panels
│   ├── outputs/     # Visualization components
│   └── layout/      # App layout (Cockpit, Sidebar)
├── data/            # Static drive database
├── engines/         # Calculation modules
│   ├── volumetry/   # Capacity calculations
│   ├── performance/ # Bottleneck analysis
│   ├── resilience/  # Monte Carlo simulation
│   └── sustainability/ # Energy & TCO
├── hooks/           # Custom React hooks
├── store/           # Zustand state management
├── types/           # TypeScript definitions
└── utils/           # Formatters, serialization
```

## License

MIT
