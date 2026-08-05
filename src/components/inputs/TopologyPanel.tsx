/**
 * Topology configuration panel - RAID/ZFS/S2D/vSAN/Dell selection.
 */

import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Label, Select, Slider } from '@/components/common/FormControls'
import { BeeGfsOptionsPanel } from '@/components/inputs/topology-options/BeeGfsOptionsPanel'
import { CephOptionsPanel } from '@/components/inputs/topology-options/CephOptionsPanel'
import { LonghornOptionsPanel } from '@/components/inputs/topology-options/LonghornOptionsPanel'
import { NetAppOptionsPanel } from '@/components/inputs/topology-options/NetAppOptionsPanel'
import { NutanixOptionsPanel } from '@/components/inputs/topology-options/NutanixOptionsPanel'
import { ObjectScaleOptionsPanel } from '@/components/inputs/topology-options/ObjectScaleOptionsPanel'
import { PowerFlexOptionsPanel } from '@/components/inputs/topology-options/PowerFlexOptionsPanel'
import { PowerScaleOptionsPanel } from '@/components/inputs/topology-options/PowerScaleOptionsPanel'
import { PowerStoreOptionsPanel } from '@/components/inputs/topology-options/PowerStoreOptionsPanel'
import { PowerVaultOptionsPanel } from '@/components/inputs/topology-options/PowerVaultOptionsPanel'
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
import { usesDistributedSpares } from '@/types'

export function TopologyPanel() {
  const { t } = useTranslation('topology')
  const { t: th } = useTranslation('help')
  const { topology, hotSpares, setTopology, setHotSpares } = useConfigStore()

  const handleTypeChange = (type: string) => {
    const levels = TOPOLOGY_LEVELS[type as TopologyType]
    const defaultLevel = levels?.[0]?.value ?? 'RAID0'
    setTopology({ type, level: defaultLevel } as Topology)
  }

  const handleLevelChange = (level: string) => {
    setTopology({ type: topology.type, level } as Topology)
  }

  const typeOptions = useMemo(
    () => TOPOLOGY_TYPES.map((type) => ({ value: type.value, label: t(type.labelKey) })),
    [t],
  )

  // TOPOLOGY_LEVELS carries i18n key paths, not English text. It held hardcoded English
  // until 2026-08-05, which meant French, German and Italian users read "Stripe, no
  // redundancy" while a translated `level.raid0.description` sat unused in every locale
  // file. The orphan-key test (tests/i18n/orphanKeys.spec.ts) is what surfaced it.
  const levelOptions = useMemo(
    () =>
      (TOPOLOGY_LEVELS[topology.type] || []).map((level) => ({
        value: level.value,
        label: t(level.labelKey),
        description: t(level.descriptionKey),
      })),
    [topology.type, t],
  )

  return (
    <div className="space-y-5">
      {/* Topology Type */}
      <div className="space-y-2">
        <Label htmlFor="storage-type" tooltip={th('topology.type')}>
          {t('type.label')}
        </Label>
        <Select
          id="storage-type"
          value={topology.type}
          options={typeOptions}
          onChange={handleTypeChange}
        />
      </div>

      {/* Topology Level */}
      <div className="space-y-2">
        <Label htmlFor="topology-level" tooltip={th('topology.level')}>
          {t('configuration.label')}
        </Label>
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

      {/* Hot Spares — hidden for topologies that rebuild from distributed slack space (vSAN) */}
      {usesDistributedSpares(topology.type) ? (
        <p className="text-xs text-slate-500">{t('hotSpares.distributedNote')}</p>
      ) : (
        <div className="space-y-2">
          <Label htmlFor="hot-spares" tooltip={th('topology.hotSpares')}>
            {t('hotSpares.label')}
          </Label>
          <Slider id="hot-spares" value={hotSpares} min={0} max={4} onChange={setHotSpares} />
        </div>
      )}

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

      {/* Dell platforms — one panel each, like every other vendor (#126). Narrowing on
          `topology.type` here is what lets the two level-dependent panels take an exact
          topology type instead of the `as` cast the combined panel needed. */}
      {topology.type === 'powervault' && <PowerVaultOptionsPanel topology={topology} />}
      {topology.type === 'objectscale' && <ObjectScaleOptionsPanel />}
      {topology.type === 'powerstore' && <PowerStoreOptionsPanel />}
      {topology.type === 'powerscale' && <PowerScaleOptionsPanel />}
      {topology.type === 'powerflex' && <PowerFlexOptionsPanel topology={topology} />}

      {/* Ceph Options */}
      {topology.type === 'ceph' && <CephOptionsPanel />}

      {/* Longhorn Options */}
      {topology.type === 'longhorn' && <LonghornOptionsPanel />}

      {/* BeeGFS Options */}
      {topology.type === 'beegfs' && <BeeGfsOptionsPanel />}

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
