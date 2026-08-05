/**
 * Topology type and level constants.
 *
 * Centralized definitions for all supported storage topologies.
 */

import type { TopologyType } from '@/types'

export const TOPOLOGY_TYPES: { value: string; labelKey: string }[] = [
  { value: 'standard', labelKey: 'type.standard' },
  { value: 'beegfs', labelKey: 'type.beegfs' },
  { value: 'ceph', labelKey: 'type.ceph' },
  { value: 'longhorn', labelKey: 'type.longhorn' },
  { value: 'nutanix', labelKey: 'type.nutanix' },
  { value: 's2d', labelKey: 'type.s2d' },
  { value: 'vsan_esa', labelKey: 'type.vsan_esa' },
  { value: 'vsan_osa', labelKey: 'type.vsan_osa' },
  { value: 'zfs', labelKey: 'type.zfs' },
  { value: 'objectscale', labelKey: 'type.objectscale' },
  { value: 'powerflex', labelKey: 'type.powerflex' },
  { value: 'powerscale', labelKey: 'type.powerscale' },
  { value: 'powerstore', labelKey: 'type.powerstore' },
  { value: 'powervault', labelKey: 'type.powervault' },
  { value: 'proprietary', labelKey: 'type.proprietary' },
]

export const TOPOLOGY_LEVELS: Record<
  TopologyType,
  { value: string; labelKey: string; descriptionKey: string }[]
> = {
  standard: [
    {
      value: 'RAID0',
      labelKey: 'level.raid0.label',
      descriptionKey: 'level.raid0.description',
    },
    {
      value: 'RAID1',
      labelKey: 'level.raid1.label',
      descriptionKey: 'level.raid1.description',
    },
    {
      value: 'RAID1E',
      labelKey: 'level.raid1e.label',
      descriptionKey: 'level.raid1e.description',
    },
    {
      value: 'RAID1_3WAY',
      labelKey: 'level.raid1_3way.label',
      descriptionKey: 'level.raid1_3way.description',
    },
    {
      value: 'RAID3',
      labelKey: 'level.raid3.label',
      descriptionKey: 'level.raid3.description',
    },
    {
      value: 'RAID4',
      labelKey: 'level.raid4.label',
      descriptionKey: 'level.raid4.description',
    },
    {
      value: 'RAID5',
      labelKey: 'level.raid5.label',
      descriptionKey: 'level.raid5.description',
    },
    {
      value: 'RAID5E',
      labelKey: 'level.raid5e.label',
      descriptionKey: 'level.raid5e.description',
    },
    {
      value: 'RAID5EE',
      labelKey: 'level.raid5ee.label',
      descriptionKey: 'level.raid5ee.description',
    },
    {
      value: 'RAID6',
      labelKey: 'level.raid6.label',
      descriptionKey: 'level.raid6.description',
    },
    {
      value: 'RAID10',
      labelKey: 'level.raid10.label',
      descriptionKey: 'level.raid10.description',
    },
    {
      value: 'RAID50',
      labelKey: 'level.raid50.label',
      descriptionKey: 'level.raid50.description',
    },
    {
      value: 'RAID60',
      labelKey: 'level.raid60.label',
      descriptionKey: 'level.raid60.description',
    },
  ],
  zfs: [
    {
      value: 'stripe',
      labelKey: 'zfs.stripe.label',
      descriptionKey: 'zfs.stripe.description',
    },
    {
      value: 'mirror',
      labelKey: 'zfs.mirror.label',
      descriptionKey: 'zfs.mirror.description',
    },
    {
      value: 'raidz1',
      labelKey: 'zfs.raidz1.label',
      descriptionKey: 'zfs.raidz1.description',
    },
    {
      value: 'raidz2',
      labelKey: 'zfs.raidz2.label',
      descriptionKey: 'zfs.raidz2.description',
    },
    {
      value: 'raidz3',
      labelKey: 'zfs.raidz3.label',
      descriptionKey: 'zfs.raidz3.description',
    },
    {
      value: 'draid1',
      labelKey: 'zfs.draid1.label',
      descriptionKey: 'zfs.draid1.description',
    },
    {
      value: 'draid2',
      labelKey: 'zfs.draid2.label',
      descriptionKey: 'zfs.draid2.description',
    },
    {
      value: 'draid3',
      labelKey: 'zfs.draid3.label',
      descriptionKey: 'zfs.draid3.description',
    },
  ],
  s2d: [
    {
      value: 'simple',
      labelKey: 's2d.simple.label',
      descriptionKey: 's2d.simple.description',
    },
    {
      value: 'mirror',
      labelKey: 's2d.mirror.label',
      descriptionKey: 's2d.mirror.description',
    },
    {
      value: 'parity',
      labelKey: 's2d.parity.label',
      descriptionKey: 's2d.parity.description',
    },
    {
      value: 'dual_parity',
      labelKey: 's2d.dual_parity.label',
      descriptionKey: 's2d.dual_parity.description',
    },
    {
      value: 'map',
      labelKey: 's2d.map.label',
      descriptionKey: 's2d.map.description',
    },
  ],
  vsan_osa: [
    {
      value: 'vsan_osa_raid1',
      labelKey: 'vsanOsa.raid1.label',
      descriptionKey: 'vsanOsa.raid1.description',
    },
    {
      value: 'vsan_osa_raid1_ftt2',
      labelKey: 'vsanOsa.raid1_ftt2.label',
      descriptionKey: 'vsanOsa.raid1_ftt2.description',
    },
    {
      value: 'vsan_osa_raid5',
      labelKey: 'vsanOsa.raid5.label',
      descriptionKey: 'vsanOsa.raid5.description',
    },
    {
      value: 'vsan_osa_raid6',
      labelKey: 'vsanOsa.raid6.label',
      descriptionKey: 'vsanOsa.raid6.description',
    },
  ],
  vsan_esa: [
    {
      value: 'vsan_esa_raid5',
      labelKey: 'vsanEsa.raid5.label',
      descriptionKey: 'vsanEsa.raid5.description',
    },
    {
      value: 'vsan_esa_raid6',
      labelKey: 'vsanEsa.raid6.label',
      descriptionKey: 'vsanEsa.raid6.description',
    },
    {
      value: 'vsan_esa_raid1',
      labelKey: 'vsanEsa.raid1.label',
      descriptionKey: 'vsanEsa.raid1.description',
    },
  ],
  objectscale: [
    {
      value: 'objectscale_ec_12_4',
      labelKey: 'objectscale.ec_12_4.label',
      descriptionKey: 'objectscale.ec_12_4.description',
    },
    {
      value: 'objectscale_ec_10_2',
      labelKey: 'objectscale.ec_10_2.label',
      descriptionKey: 'objectscale.ec_10_2.description',
    },
    {
      value: 'objectscale_ec_24_4',
      labelKey: 'objectscale.ec_24_4.label',
      descriptionKey: 'objectscale.ec_24_4.description',
    },
    {
      value: 'objectscale_mirror_3',
      labelKey: 'objectscale.mirror_3.label',
      descriptionKey: 'objectscale.mirror_3.description',
    },
  ],
  powerstore: [
    {
      value: 'powerstore_raid5',
      labelKey: 'powerstore.raid5.label',
      descriptionKey: 'powerstore.raid5.description',
    },
    {
      value: 'powerstore_raid6',
      labelKey: 'powerstore.raid6.label',
      descriptionKey: 'powerstore.raid6.description',
    },
    {
      value: 'powerstore_raid10',
      labelKey: 'powerstore.raid10.label',
      descriptionKey: 'powerstore.raid10.description',
    },
  ],
  powerscale: [
    {
      value: 'powerscale_n1',
      labelKey: 'powerscale.n1.label',
      descriptionKey: 'powerscale.n1.description',
    },
    {
      value: 'powerscale_n2',
      labelKey: 'powerscale.n2.label',
      descriptionKey: 'powerscale.n2.description',
    },
    {
      value: 'powerscale_n2_1',
      labelKey: 'powerscale.n2_1.label',
      descriptionKey: 'powerscale.n2_1.description',
    },
    {
      value: 'powerscale_n3',
      labelKey: 'powerscale.n3.label',
      descriptionKey: 'powerscale.n3.description',
    },
    {
      value: 'powerscale_n4',
      labelKey: 'powerscale.n4.label',
      descriptionKey: 'powerscale.n4.description',
    },
    {
      value: 'powerscale_mirror_2x',
      labelKey: 'powerscale.mirror_2x.label',
      descriptionKey: 'powerscale.mirror_2x.description',
    },
    {
      value: 'powerscale_mirror_3x',
      labelKey: 'powerscale.mirror_3x.label',
      descriptionKey: 'powerscale.mirror_3x.description',
    },
  ],
  powerflex: [
    {
      value: 'powerflex_medium_2way',
      labelKey: 'powerflex.medium_2way.label',
      descriptionKey: 'powerflex.medium_2way.description',
    },
    {
      value: 'powerflex_medium_3way',
      labelKey: 'powerflex.medium_3way.label',
      descriptionKey: 'powerflex.medium_3way.description',
    },
    {
      value: 'powerflex_fine_2way',
      labelKey: 'powerflex.fine_2way.label',
      descriptionKey: 'powerflex.fine_2way.description',
    },
    {
      value: 'powerflex_ec_4_1',
      labelKey: 'powerflex.ec_4_1.label',
      descriptionKey: 'powerflex.ec_4_1.description',
    },
    {
      value: 'powerflex_ec_4_2',
      labelKey: 'powerflex.ec_4_2.label',
      descriptionKey: 'powerflex.ec_4_2.description',
    },
    {
      value: 'powerflex_ec_8_2',
      labelKey: 'powerflex.ec_8_2.label',
      descriptionKey: 'powerflex.ec_8_2.description',
    },
    {
      value: 'powerflex_ec_12_4',
      labelKey: 'powerflex.ec_12_4.label',
      descriptionKey: 'powerflex.ec_12_4.description',
    },
  ],
  ceph: [
    {
      value: 'ceph_replicated_2',
      labelKey: 'ceph.replicated_2.label',
      descriptionKey: 'ceph.replicated_2.description',
    },
    {
      value: 'ceph_replicated_3',
      labelKey: 'ceph.replicated_3.label',
      descriptionKey: 'ceph.replicated_3.description',
    },
    {
      value: 'ceph_ec_2_1',
      labelKey: 'ceph.ec_2_1.label',
      descriptionKey: 'ceph.ec_2_1.description',
    },
    {
      value: 'ceph_ec_4_2',
      labelKey: 'ceph.ec_4_2.label',
      descriptionKey: 'ceph.ec_4_2.description',
    },
    {
      value: 'ceph_ec_8_3',
      labelKey: 'ceph.ec_8_3.label',
      descriptionKey: 'ceph.ec_8_3.description',
    },
    {
      value: 'ceph_ec_8_4',
      labelKey: 'ceph.ec_8_4.label',
      descriptionKey: 'ceph.ec_8_4.description',
    },
  ],
  nutanix: [
    {
      value: 'nutanix_rf2',
      labelKey: 'nutanix.rf2.label',
      descriptionKey: 'nutanix.rf2.description',
    },
    {
      value: 'nutanix_rf3',
      labelKey: 'nutanix.rf3.label',
      descriptionKey: 'nutanix.rf3.description',
    },
    {
      value: 'nutanix_ec_rf2',
      labelKey: 'nutanix.ec_rf2.label',
      descriptionKey: 'nutanix.ec_rf2.description',
    },
    {
      value: 'nutanix_ec_rf3',
      labelKey: 'nutanix.ec_rf3.label',
      descriptionKey: 'nutanix.ec_rf3.description',
    },
  ],
  longhorn: [
    {
      value: 'longhorn_r2',
      labelKey: 'longhorn.r2.label',
      descriptionKey: 'longhorn.r2.description',
    },
    {
      value: 'longhorn_r3',
      labelKey: 'longhorn.r3.label',
      descriptionKey: 'longhorn.r3.description',
    },
  ],
  beegfs: [
    {
      value: 'beegfs_raid6',
      labelKey: 'beegfs.raid6.label',
      descriptionKey: 'beegfs.raid6.description',
    },
    {
      value: 'beegfs_raid10',
      labelKey: 'beegfs.raid10.label',
      descriptionKey: 'beegfs.raid10.description',
    },
    {
      value: 'beegfs_raidz2',
      labelKey: 'beegfs.raidz2.label',
      descriptionKey: 'beegfs.raidz2.description',
    },
    {
      value: 'beegfs_single',
      labelKey: 'beegfs.single.label',
      descriptionKey: 'beegfs.single.description',
    },
  ],
  powervault: [
    {
      value: 'powervault_raid1',
      labelKey: 'powervault.raid1.label',
      descriptionKey: 'powervault.raid1.description',
    },
    {
      value: 'powervault_raid5',
      labelKey: 'powervault.raid5.label',
      descriptionKey: 'powervault.raid5.description',
    },
    {
      value: 'powervault_raid6',
      labelKey: 'powervault.raid6.label',
      descriptionKey: 'powervault.raid6.description',
    },
    {
      value: 'powervault_raid10',
      labelKey: 'powervault.raid10.label',
      descriptionKey: 'powervault.raid10.description',
    },
    {
      value: 'powervault_adapt',
      labelKey: 'powervault.adapt.label',
      descriptionKey: 'powervault.adapt.description',
    },
  ],
  proprietary: [
    {
      value: 'synology_shr',
      labelKey: 'synology.shr.label',
      descriptionKey: 'synology.shr.description',
    },
    {
      value: 'synology_shr2',
      labelKey: 'synology.shr2.label',
      descriptionKey: 'synology.shr2.description',
    },
    {
      value: 'synology_raid_f1',
      labelKey: 'synology.raid_f1.label',
      descriptionKey: 'synology.raid_f1.description',
    },
    {
      value: 'netapp_raid_dp',
      labelKey: 'netapp.raid_dp.label',
      descriptionKey: 'netapp.raid_dp.description',
    },
    {
      value: 'netapp_raid_tec',
      labelKey: 'netapp.raid_tec.label',
      descriptionKey: 'netapp.raid_tec.description',
    },
  ],
}
