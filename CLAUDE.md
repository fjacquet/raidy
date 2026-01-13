# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Raidy** is a browser-based simulator for modern storage infrastructure including RAID, ZFS, VMware vSAN (ESA/OSA), Microsoft S2D, Nutanix, Dell PowerFlex/PowerStore/PowerScale, NetApp ONTAP, and Ceph. It's a Single Page Application (SPA) / Progressive Web App (PWA) with no backend - all intelligence lives in typed JSON definitions and client-side calculation engines.

## Technology Stack

- **Framework**: React (Functional Components + Hooks) or Svelte 5
- **Language**: TypeScript (Strict Mode) - critical for complex math type-safety
- **State Management**: URL-based state via Zustand or Recoil (enables "Copy URL to Share")
- **Math Engine**: Pure TypeScript; Web Workers for Monte Carlo simulations
- **Visualization**: Recharts (simple graphs) + D3.js (custom Capacity Waterfall/Sankey)
- **Styling**: Tailwind CSS (mobile responsive, dark mode native)
- **Deployment**: Static hosting (Vercel/Netlify/GitHub Pages)

## Build & Development Commands

```bash
# Install dependencies
npm install

# Development server
npm run dev

# Production build
npm run build

# Type checking
npm run typecheck

# Linting
npm run lint

# Run tests
npm test

# Run single test file
npm test -- path/to/test.spec.ts
```

## Architecture

### Data Flow
1. **Initialization**: App loads `drive_db.json` (static asset with drive definitions)
2. **Input**: User modifies configuration (RAID level, drive count, file system)
3. **Process**: React `useEffect` hooks trigger recalculation across 4 Logic Modules
4. **Output**: Dashboard updates real-time; URL hash updates silently

### Core Logic Modules

#### Module A: Volumetry & Efficiency Engine
Answers "How much space do I actually get?"
- Supported topologies:
  - Standard RAID: 0/1/1E/3/4/5/5E/5EE/6/10/50/60
  - ZFS: Stripe/Mirror/RAID-Z1/Z2/Z3/dRAID1/2/3
  - Microsoft S2D: Simple/Mirror/Parity/Dual Parity/MAP
  - VMware vSAN OSA: RAID-1/RAID-5/RAID-6 (disk groups, dynamic stripe width)
  - VMware vSAN ESA: Adaptive RAID-5/RAID-6 (NVMe only, scales with cluster size)
  - Nutanix: RF2/RF3, Erasure Coding
  - Dell PowerFlex: 2-way/3-way mirror, dynamic rebuild
  - Dell PowerStore/PowerScale/ObjectScale
  - NetApp ONTAP: RAID-DP/RAID-TEC, ADP
  - Ceph: Replicated/Erasure Coded pools
  - Synology SHR/SHR-2
- ZFS overhead: Apply 1/32 "slop" factor, compression ratio, ashift padding penalty
- S2D reserve: Subtract 1 drive equivalent per node for automatic rebuild reserve
- vSAN ESA: Adaptive efficiency (67-80%) based on cluster size and drive count
- Veeam/Reflink logic: Toggle for XFS/ReFS reflink support affects backup size calculations

#### Module B: Performance & Bottleneck Engine
Answers "Where is my choke point?"
- Chain calculation: Compare Media Limit → Controller/CPU Limit → Bus Limit → Network Limit
- RAID 5/6 write penalty: Divide by 4 (R5) or 6 (R6) for random I/O
- Output includes XFS stripe alignment (`sunit`/`swidth`) based on RAID chunk size

#### Module C: Resilience Engine (Monte Carlo)
Answers "Will I lose data?"
- Runs 10,000 simulations in Web Worker
- Simulates: drive failure → rebuild time → URE probability → 2nd failure probability
- Output: Survival probability (e.g., "99.999%")

#### Module D: Sustainability & TCO Engine
Answers "What is the Carbon/Financial Cost?"
- Energy calculation: drives + server + PUE cooling overhead
- CO2 emissions: kWh × grid carbon intensity (region-selectable)
- Flash endurance: SSD survival based on DWPD vs 5-year workload

### Data Structures

Drive definitions in `drives.json`:
```typescript
interface Drive {
  id: string;                    // e.g., "wd-gold-24tb"
  model: string;
  type: "HDD" | "SSD_SATA" | "SSD_SAS" | "SSD_NVMe";
  capacity_raw: number;          // Bytes
  sector_size: 512 | 4096;
  performance: { iops_read, iops_write, bandwidth_read_mb, bandwidth_write_mb };
  reliability: { ure_rate: 14|15|16|17, afr: number, dwpd: number };
  power: { idle_watts, load_watts };
  cost_avg: number;              // USD
}
```

## UI Layout

"Cockpit" split-screen design:
- **Left (Fixed)**: Accordion-style inputs (Hardware, Topology, Workload, Advanced)
- **Right (Reactive)**: Visual outputs (Sankey diagram, Performance gauge, Command matrix)

## Key Features

- **Share Link**: Serializes state → Base64 → URL hash
- **PDF Export**: Uses jspdf-autotable for white-labeled reports
- **Config Export**: JSON/YAML blocks for Ansible/Terraform

## Validation Requirements

- Unit test RAID 5/6 math against industry formulas
- Verify ZFS overhead matches OpenZFS documentation
- Ensure Web Worker doesn't crash mobile browsers
- Validate results within 1% of WintelGuy and NetApp Storage Efficiency Calculator
