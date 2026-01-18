/**
 * Topology type and level constants.
 *
 * Centralized definitions for all supported storage topologies.
 */

import type { TopologyType } from '@/types'

export const TOPOLOGY_TYPES = [
  { value: 'standard', label: 'RAID' },
  { value: 'ceph', label: 'Ceph' },
  { value: 'nutanix', label: 'Nutanix' },
  { value: 's2d', label: 'S2D' },
  { value: 'vsan_esa', label: 'vSAN ESA' },
  { value: 'vsan_osa', label: 'vSAN OSA' },
  { value: 'zfs', label: 'ZFS' },
  { value: 'objectscale', label: 'ObjectScale' },
  { value: 'powerflex', label: 'PowerFlex' },
  { value: 'powerscale', label: 'PowerScale' },
  { value: 'powerstore', label: 'PowerStore' },
  { value: 'powervault', label: 'PowerVault ME5' },
  { value: 'proprietary', label: 'Other' },
]

export const TOPOLOGY_LEVELS: Record<
  TopologyType,
  { value: string; label: string; description: string }[]
> = {
  standard: [
    { value: 'RAID0', label: 'RAID 0', description: 'Stripe, no redundancy' },
    { value: 'RAID1', label: 'RAID 1', description: 'Mirror (2-way), 50% capacity' },
    { value: 'RAID1E', label: 'RAID 1E', description: 'Mirrored stripe, 50% capacity, 3+ drives' },
    { value: 'RAID1_3WAY', label: '3-Way Mirror', description: 'Triple mirror, 33% capacity' },
    {
      value: 'RAID3',
      label: 'RAID 3',
      description: 'Byte-stripe + dedicated parity, sequential I/O',
    },
    { value: 'RAID4', label: 'RAID 4', description: 'Block-stripe + dedicated parity' },
    { value: 'RAID5', label: 'RAID 5', description: 'Single distributed parity, n-1 capacity' },
    {
      value: 'RAID5E',
      label: 'RAID 5E',
      description: 'RAID 5 + integrated hot spare, n-2 capacity',
    },
    { value: 'RAID5EE', label: 'RAID 5EE', description: 'RAID 5E Enhanced, active spare' },
    { value: 'RAID6', label: 'RAID 6', description: 'Double distributed parity, n-2 capacity' },
    { value: 'RAID10', label: 'RAID 10', description: 'Mirrored stripes, 50% capacity' },
    { value: 'RAID50', label: 'RAID 50', description: 'Striped RAID 5 groups' },
    { value: 'RAID60', label: 'RAID 60', description: 'Striped RAID 6 groups' },
  ],
  zfs: [
    { value: 'stripe', label: 'Stripe', description: 'No redundancy, max capacity' },
    { value: 'mirror', label: 'Mirror', description: '2-way mirror, 50% capacity' },
    { value: 'raidz1', label: 'RAID-Z1', description: 'Single parity, n-1 capacity' },
    { value: 'raidz2', label: 'RAID-Z2', description: 'Double parity, n-2 capacity' },
    { value: 'raidz3', label: 'RAID-Z3', description: 'Triple parity, n-3 capacity' },
    { value: 'draid1', label: 'dRAID1', description: 'Distributed RAID-Z1' },
    { value: 'draid2', label: 'dRAID2', description: 'Distributed RAID-Z2' },
    { value: 'draid3', label: 'dRAID3', description: 'Distributed RAID-Z3' },
  ],
  s2d: [
    { value: 'simple', label: 'Simple', description: 'No redundancy' },
    { value: 'mirror', label: 'Mirror', description: '2-way or 3-way mirror' },
    { value: 'parity', label: 'Parity', description: 'Single parity' },
    { value: 'dual_parity', label: 'Dual Parity', description: 'Erasure coding' },
    { value: 'map', label: 'MAP', description: 'Mirror-Accelerated Parity' },
  ],
  vsan_osa: [
    {
      value: 'vsan_osa_raid1',
      label: 'RAID-1 (Mirror)',
      description: 'FTT=1, min 3 hosts, 50% efficiency',
    },
    {
      value: 'vsan_osa_raid1_ftt2',
      label: 'RAID-1 FTT=2',
      description: 'FTT=2, min 5 hosts, 33% efficiency',
    },
    {
      value: 'vsan_osa_raid5',
      label: 'RAID-5 Erasure Coding',
      description: 'FTT=1, min 4 hosts, 75% efficiency, write penalty',
    },
    {
      value: 'vsan_osa_raid6',
      label: 'RAID-6 Erasure Coding',
      description: 'FTT=2, min 6 hosts, 67% efficiency, write penalty',
    },
  ],
  vsan_esa: [
    {
      value: 'vsan_esa_raid5',
      label: 'RAID-5 Adaptive (Recommended)',
      description: 'Optimizes stripe width for cluster size, min 3 hosts, 67-80% efficiency',
    },
    {
      value: 'vsan_esa_raid6',
      label: 'RAID-6 Erasure Coding',
      description: 'FTT=2, min 6 hosts, 67% efficiency',
    },
    {
      value: 'vsan_esa_raid1',
      label: 'RAID-1 (Mirror)',
      description: 'Only recommended for 2-node clusters, 50% efficiency',
    },
  ],
  objectscale: [
    {
      value: 'objectscale_ec_12_4',
      label: 'EC 12+4 (Default)',
      description: '75% efficiency, min 5 nodes, tolerates 4 failures',
    },
    {
      value: 'objectscale_ec_10_2',
      label: 'EC 10+2 (Cold/Archive)',
      description: '83% efficiency, min 7 nodes, tolerates 2 failures',
    },
    {
      value: 'objectscale_ec_24_4',
      label: 'EC 24+4 (Preview)',
      description: '86% efficiency, min 8 nodes, tech preview',
    },
    {
      value: 'objectscale_mirror_3',
      label: 'Triple Mirror',
      description: '33% efficiency, for metadata/small configs',
    },
  ],
  powerstore: [
    {
      value: 'powerstore_raid5',
      label: 'RAID-5',
      description: 'Single parity, ~80% efficiency',
    },
    {
      value: 'powerstore_raid6',
      label: 'RAID-6',
      description: 'Dual parity, ~75% efficiency',
    },
    {
      value: 'powerstore_raid10',
      label: 'RAID-10',
      description: 'Mirrored stripes, 50% efficiency',
    },
  ],
  powerscale: [
    {
      value: 'powerscale_n1',
      label: 'N+1',
      description: 'Single parity protection',
    },
    {
      value: 'powerscale_n2',
      label: 'N+2',
      description: 'Double parity protection',
    },
    {
      value: 'powerscale_n2_1',
      label: 'N+2:1',
      description: 'N+2 with stripe failure tolerance',
    },
    {
      value: 'powerscale_n3',
      label: 'N+3',
      description: 'Triple parity protection',
    },
    {
      value: 'powerscale_n4',
      label: 'N+4',
      description: 'Quad parity protection',
    },
    {
      value: 'powerscale_mirror_2x',
      label: 'Mirror 2x',
      description: '2-way mirrored, 50% efficiency',
    },
    {
      value: 'powerscale_mirror_3x',
      label: 'Mirror 3x',
      description: '3-way mirrored, 33% efficiency',
    },
  ],
  powerflex: [
    {
      value: 'powerflex_medium_2way',
      label: 'Medium 2-way',
      description: 'Medium granularity, 2-way mirror, 50% efficiency',
    },
    {
      value: 'powerflex_medium_3way',
      label: 'Medium 3-way',
      description: 'Medium granularity, 3-way mirror, 33% efficiency',
    },
    {
      value: 'powerflex_fine_2way',
      label: 'Fine 2-way',
      description: 'Fine granularity (8KB), 2-way mirror only, ~42.5% efficiency',
    },
    {
      value: 'powerflex_ec_4_1',
      label: 'EC 4+1',
      description: 'Erasure coding 4+1, 80% efficiency, -30% IOPS',
    },
    {
      value: 'powerflex_ec_4_2',
      label: 'EC 4+2',
      description: 'Erasure coding 4+2, 67% efficiency, -30% IOPS',
    },
    {
      value: 'powerflex_ec_8_2',
      label: 'EC 8+2',
      description: 'Erasure coding 8+2, 80% efficiency, -30% IOPS',
    },
    {
      value: 'powerflex_ec_12_4',
      label: 'EC 12+4',
      description: 'Erasure coding 12+4, 75% efficiency, -30% IOPS',
    },
  ],
  ceph: [
    {
      value: 'ceph_replicated_2',
      label: 'Replicated 2x',
      description: '2-way replication, 50% efficiency',
    },
    {
      value: 'ceph_replicated_3',
      label: 'Replicated 3x',
      description: '3-way replication, 33% efficiency',
    },
    {
      value: 'ceph_ec_2_1',
      label: 'EC 2+1',
      description: 'Erasure coded k=2, m=1, 67% efficiency',
    },
    {
      value: 'ceph_ec_4_2',
      label: 'EC 4+2',
      description: 'Erasure coded k=4, m=2, 67% efficiency',
    },
    {
      value: 'ceph_ec_8_3',
      label: 'EC 8+3',
      description: 'Erasure coded k=8, m=3, 73% efficiency',
    },
    {
      value: 'ceph_ec_8_4',
      label: 'EC 8+4',
      description: 'Erasure coded k=8, m=4, 67% efficiency',
    },
  ],
  nutanix: [
    {
      value: 'nutanix_rf2',
      label: 'RF2',
      description: 'Replication Factor 2 (2 copies), 50% efficiency',
    },
    {
      value: 'nutanix_rf3',
      label: 'RF3',
      description: 'Replication Factor 3 (3 copies), 33% efficiency',
    },
    {
      value: 'nutanix_ec_rf2',
      label: 'EC-X (RF2)',
      description: 'Erasure Coding 4:1 with RF2 base, ~75% efficiency',
    },
    {
      value: 'nutanix_ec_rf3',
      label: 'EC-X (RF3)',
      description: 'Erasure Coding 6:2 with RF3 base, ~75% efficiency',
    },
  ],
  powervault: [
    { value: 'powervault_raid1', label: 'RAID 1', description: '2-way mirror, 50% efficiency' },
    {
      value: 'powervault_raid5',
      label: 'RAID 5',
      description: 'Single parity, 4x write penalty',
    },
    {
      value: 'powervault_raid6',
      label: 'RAID 6',
      description: 'Dual parity, 2-drive fault tolerance',
    },
    {
      value: 'powervault_raid10',
      label: 'RAID 10',
      description: 'Mirrored stripes, best random IOPS',
    },
    {
      value: 'powervault_adapt',
      label: 'ADAPT (Recommended)',
      description: 'Distributed RAID, ~87% efficiency, 12-128 drives',
    },
  ],
  proprietary: [
    { value: 'synology_shr', label: 'Synology SHR', description: 'Hybrid RAID, 1-drive fault' },
    { value: 'synology_shr2', label: 'Synology SHR-2', description: 'Hybrid RAID, 2-drive fault' },
    {
      value: 'synology_raid_f1',
      label: 'Synology RAID F1',
      description: 'All-Flash optimized, uneven parity rotation',
    },
    { value: 'netapp_raid_dp', label: 'NetApp RAID-DP', description: 'Double parity' },
    { value: 'netapp_raid_tec', label: 'NetApp RAID-TEC', description: 'Triple parity' },
  ],
}

// NetApp platform options
export const NETAPP_PLATFORM_OPTIONS = [
  { value: 'aff_a', label: 'AFF A-Series' },
  { value: 'aff_c', label: 'AFF C-Series' },
  { value: 'fas', label: 'FAS' },
  { value: 'asa', label: 'ASA (SAN)' },
  { value: 'e_series', label: 'E-Series' },
]

export const NETAPP_ADP_OPTIONS = [
  { value: 'none', label: 'None' },
  { value: 'adpv1', label: 'ADP v1' },
  { value: 'adpv2', label: 'ADP v2 (Root-Data)' },
]

// Synology model series options
export const SYNOLOGY_MODEL_OPTIONS = [
  { value: 'j', label: 'J Series (Entry)' },
  { value: 'value', label: 'Value Series' },
  { value: 'plus', label: 'Plus Series' },
  { value: 'xs', label: 'XS/XS+ (Enterprise)' },
]
