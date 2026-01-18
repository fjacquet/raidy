/**
 * Topology configuration panel - RAID/ZFS/S2D/vSAN/Dell selection.
 */

import { useTranslation } from 'react-i18next'
import { Label, Select, Slider } from '@/components/common/FormControls'
import { CephOptionsPanel } from '@/components/inputs/topology-options/CephOptionsPanel'
import { DellOptionsPanel } from '@/components/inputs/topology-options/DellOptionsPanel'
import { NetAppOptionsPanel } from '@/components/inputs/topology-options/NetAppOptionsPanel'
import { NutanixOptionsPanel } from '@/components/inputs/topology-options/NutanixOptionsPanel'
import { S2dOptionsPanel } from '@/components/inputs/topology-options/S2dOptionsPanel'
import { SynologyOptionsPanel } from '@/components/inputs/topology-options/SynologyOptionsPanel'
import {
  TOPOLOGY_LEVELS,
  TOPOLOGY_TYPES,
} from '@/components/inputs/topology-options/topologyConstants'
import { VsanOptionsPanel } from '@/components/inputs/topology-options/VsanOptionsPanel'
import { ZfsOptionsPanel } from '@/components/inputs/topology-options/ZfsOptionsPanel'
import { useConfigStore } from '@/store'
import type { Topology, TopologyType } from '@/types'

export function TopologyPanel() {
  const { t } = useTranslation('topology')
  const { topology, hotSpares, setTopology, setHotSpares } = useConfigStore()

  const handleTypeChange = (type: string) => {
    const levels = TOPOLOGY_LEVELS[type as TopologyType]
    const defaultLevel = levels?.[0]?.value ?? 'RAID0'
    setTopology({ type, level: defaultLevel } as Topology)
  }

  const handleLevelChange = (level: string) => {
    setTopology({ type: topology.type, level } as Topology)
  }

  const levelOptions = TOPOLOGY_LEVELS[topology.type] || []

  return (
    <div className="space-y-5">
      {/* Topology Type */}
      <div className="space-y-2">
        <Label htmlFor="storage-type">{t('type.label')}</Label>
        <Select
          id="storage-type"
          value={topology.type}
          options={TOPOLOGY_TYPES}
          onChange={handleTypeChange}
        />
      </div>

      {/* Topology Level */}
      <div className="space-y-2">
        <Label htmlFor="topology-level">{t('configuration.label')}</Label>
        <Select
          id="topology-level"
          value={topology.level}
          options={levelOptions}
          onChange={handleLevelChange}
        />
        <p className="text-xs text-slate-500">
          {levelOptions.find((o) => o.value === topology.level)?.description}
        </p>
      </div>

      {/* Hot Spares */}
      <div className="space-y-2">
        <Label htmlFor="hot-spares">{t('hotSpares.label')}</Label>
        <Slider id="hot-spares" value={hotSpares} min={0} max={4} onChange={setHotSpares} />
      </div>

      {/* ZFS Options */}
      {topology.type === 'zfs' && <ZfsOptionsPanel />}

      {/* S2D Options */}
      {topology.type === 's2d' && <S2dOptionsPanel topology={topology} />}

      {/* vSAN OSA Options */}
      {topology.type === 'vsan_osa' && <VsanOptionsPanel topology={topology} />}

      {/* vSAN ESA Options */}
      {topology.type === 'vsan_esa' && <VsanOptionsPanel topology={topology} />}

      {/* Nutanix Options */}
      {topology.type === 'nutanix' && <NutanixOptionsPanel topology={topology} />}

      {/* Dell Vendor Options - PowerVault, ObjectScale, PowerStore, PowerScale, PowerFlex */}
      {['powervault', 'objectscale', 'powerstore', 'powerscale', 'powerflex'].includes(
        topology.type,
      ) && (
        <DellOptionsPanel
          topology={
            topology as Topology & {
              type: 'powervault' | 'objectscale' | 'powerstore' | 'powerscale' | 'powerflex'
            }
          }
        />
      )}

      {/* Ceph Options */}
      {topology.type === 'ceph' && <CephOptionsPanel />}

      {/* NetApp Options (proprietary type with netapp_ prefix) */}
      {topology.type === 'proprietary' && topology.level.startsWith('netapp_') && (
        <NetAppOptionsPanel />
      )}

      {/* Synology Options (proprietary type with synology_ prefix) */}
      {topology.type === 'proprietary' && topology.level.startsWith('synology_') && (
        <SynologyOptionsPanel />
      )}
    </div>
  )
}
