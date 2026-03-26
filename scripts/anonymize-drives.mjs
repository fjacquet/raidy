/**
 * Drive database anonymization script.
 * Reads branded drives.json, groups similar drives, and outputs
 * an anonymized version with generic descriptive names.
 *
 * Usage: node scripts/anonymize-drives.mjs
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const INPUT = join(__dirname, '..', 'src', 'data', 'drives.json')
const OUTPUT = join(__dirname, '..', 'src', 'data', 'drives.json')
const MAPPING_OUTPUT = join(__dirname, 'drive-id-mapping.json')

const drives = JSON.parse(readFileSync(INPUT, 'utf-8'))
const allDrives = Object.values(drives)

// --- Classification helpers ---

function classifyTier(d) {
  const model = d.model.toLowerCase()
  // Consumer
  if (model.includes('870 evo') || model.includes('barracuda')) return 'consumer'
  // NAS
  if (
    model.includes('ironwolf') ||
    model.includes('red pro') ||
    model.includes('red plus') ||
    model.includes('n300')
  )
    return 'nas'
  // Datacenter (specialty: Optane, XL-FLASH, E1.S/E3.S form factors, PCIe5, QLC high-cap)
  if (model.includes('optane') || model.includes('xl-flash') || model.includes('fl6'))
    return 'datacenter'
  if (d.formFactor && ['E1.S', 'E1.L', 'E3.S', 'E3.L'].includes(d.formFactor)) return 'datacenter'
  if (d.interface === 'PCIe5') return 'datacenter'
  if (d.nandType === 'QLC') return 'datacenter'
  if (d.nandType === 'SLC' || d.nandType === '3DXPoint') return 'datacenter'
  // Enterprise (everything else: Exos, Gold, Ultrastar, MG, PM893, PM9A3, etc.)
  return 'enterprise'
}

function classifyWorkload(d) {
  if (d.type === 'HDD') return null
  const dwpd = d.reliability.dwpd
  if (dwpd <= 1.5) return 'ri' // Read-Intensive
  if (dwpd <= 5) return 'mu' // Mixed-Use
  return 'wi' // Write-Intensive
}

function getGroupKey(d) {
  const tier = classifyTier(d)
  const workload = classifyWorkload(d)

  if (d.type === 'HDD') {
    const rpm = d.rpm
    const iface = d.interface || 'SATA'
    const ff = d.formFactor || '3.5"'
    const recording = d.recording || 'CMR'
    const dual = d.dualActuator ? '-dual' : ''
    return `${tier}|HDD|${rpm}|${iface}|${ff}|${recording}${dual}`
  }

  // SSD types
  const nand = d.nandType || 'TLC'
  const iface =
    d.interface || (d.type === 'SSD_SATA' ? 'SATA' : d.type === 'SSD_SAS' ? 'SAS' : 'PCIe4')
  const ff = d.formFactor || '2.5"'
  return `${tier}|${d.type}|${nand}|${iface}|${ff}|${workload}`
}

// --- Capacity bucketing ---

// Standard capacity points for each group type
const HDD_CAPS_SAS_15K = [300000000000, 900000000000]
const HDD_CAPS_SAS_10K = [1200000000000, 2400000000000]
const HDD_CAPS_SATA_ENT = [4000000000000, 12000000000000, 18000000000000, 24000000000000]
const HDD_CAPS_NAS_72K = [4000000000000, 10000000000000, 16000000000000]
const HDD_CAPS_NAS_54K = [4000000000000, 8000000000000]

function nearestCapacity(raw, buckets) {
  let best = buckets[0]
  let bestDist = Math.abs(raw - best)
  for (const b of buckets) {
    const dist = Math.abs(raw - b)
    if (dist < bestDist) {
      best = b
      bestDist = dist
    }
  }
  return best
}

// --- Grouping ---

const groups = new Map()

for (const d of allDrives) {
  const key = getGroupKey(d)
  if (!groups.has(key)) groups.set(key, [])
  groups.get(key).push(d)
}

// --- Averaging helper ---

function avg(arr) {
  return arr.reduce((a, b) => a + b, 0) / arr.length
}

function round(n, decimals = 0) {
  const f = 10 ** decimals
  return Math.round(n * f) / f
}

// --- Build representative entries ---

function buildId(tier, type, rpm, iface, capacity, extras) {
  const tierMap = { enterprise: 'ent', datacenter: 'dc', nas: 'nas', consumer: 'con' }
  const t = tierMap[tier]

  let typeStr
  if (type === 'HDD') typeStr = 'hdd'
  else if (type === 'SSD_SATA' || type === 'SSD_SAS') typeStr = 'ssd'
  else typeStr = 'nvme'

  let rpmStr = ''
  if (rpm === 15000) rpmStr = '15k'
  else if (rpm === 10000) rpmStr = '10k'
  else if (rpm === 7200) rpmStr = '7k2'
  else if (rpm && rpm < 7200) rpmStr = '5k4'

  const ifaceStr = iface.toLowerCase()

  // Format capacity
  let capStr
  const gb = capacity / 1000000000
  const tb = gb / 1000
  if (gb < 1000) capStr = `${Math.round(gb)}gb`
  else if (tb === Math.round(tb)) capStr = `${Math.round(tb)}tb`
  else capStr = `${Math.round(gb)}gb`

  const parts = [t, typeStr]
  if (rpmStr) parts.push(rpmStr)
  parts.push(ifaceStr, capStr)
  if (extras) parts.push(...extras.split('-').filter(Boolean))

  return parts.join('-')
}

function buildModel(tier, type, rpm, iface, formFactor, capacity, extras) {
  const tierName = tier === 'nas' ? 'NAS' : tier.charAt(0).toUpperCase() + tier.slice(1)
  const parts = [tierName]

  // Type + speed
  if (type === 'HDD') {
    parts.push('HDD')
    if (rpm === 15000) parts.push('15K')
    else if (rpm === 10000) parts.push('10K')
    else if (rpm === 7200) parts.push('7.2K')
    else if (rpm && rpm < 7200) parts.push('5.4K')
    // Interface for HDD
    parts.push(iface || 'SATA')
  } else if (type === 'SSD_NVMe') {
    parts.push('NVMe')
    parts.push(iface || 'PCIe4')
  } else if (type === 'SSD_SAS') {
    parts.push('SSD SAS')
  } else {
    parts.push('SSD SATA')
  }

  // Form factor
  if (formFactor) parts.push(formFactor)

  // Capacity
  const gb = capacity / 1000000000
  const tb = gb / 1000
  if (gb < 1000) parts.push(`${Math.round(gb)}GB`)
  else if (tb >= 1 && tb === Math.round(tb)) parts.push(`${Math.round(tb)}TB`)
  else parts.push(`${round(tb, 2)}TB`)

  // Extras (NAND type, workload, recording)
  if (extras) parts.push(extras)

  return parts.join(' ')
}

// --- Process each group ---

const result = {}
const mapping = {} // old ID -> new ID

for (const [key, members] of groups) {
  const parts = key.split('|')
  const tier = parts[0]
  const type = parts[1]
  const sample = members[0]

  // Determine capacity buckets for this group
  let capacityBuckets

  if (type === 'HDD') {
    const rpm = parseInt(parts[2], 10)
    const iface = parts[3]
    const ff = parts[4]
    const recording = parts[5]

    if (rpm === 15000) capacityBuckets = HDD_CAPS_SAS_15K
    else if (rpm === 10000) capacityBuckets = HDD_CAPS_SAS_10K
    else if (tier === 'nas' && rpm >= 7200) capacityBuckets = HDD_CAPS_NAS_72K
    else if (tier === 'nas') capacityBuckets = HDD_CAPS_NAS_54K
    else if (recording === 'SMR') capacityBuckets = [24000000000000]
    else if (recording === 'HAMR') capacityBuckets = [32000000000000]
    else if (recording.includes('dual')) capacityBuckets = [18000000000000]
    else if (iface === 'SAS' && ff === '2.5"' && rpm === 7200) capacityBuckets = [2000000000000]
    else capacityBuckets = HDD_CAPS_SATA_ENT
  } else {
    // For SSDs, pick representative capacity points
    const caps = members.map((d) => d.capacity_raw).sort((a, b) => a - b)
    const uniqueCaps = [...new Set(caps)]

    if (uniqueCaps.length <= 2) {
      capacityBuckets = uniqueCaps
    } else {
      // Pick min, median, max (at most 3 entries)
      const mid = uniqueCaps[Math.floor(uniqueCaps.length / 2)]
      const set = new Set([uniqueCaps[0], mid, uniqueCaps[uniqueCaps.length - 1]])
      capacityBuckets = [...set].sort((a, b) => a - b)
      // Limit to 2 for most groups
      if (capacityBuckets.length > 2) {
        capacityBuckets = [capacityBuckets[0], capacityBuckets[capacityBuckets.length - 1]]
      }
    }
  }

  // For each capacity bucket, find nearest drives and average
  for (const targetCap of capacityBuckets) {
    // Find drives closest to this capacity
    const sorted = members
      .map((d) => ({
        drive: d,
        dist: Math.abs(d.capacity_raw - targetCap),
      }))
      .sort((a, b) => a.dist - b.dist)

    // Take drives within 50% of target capacity, or at least the closest one
    const threshold = targetCap * 0.5
    let selected = sorted.filter((s) => s.dist <= threshold).map((s) => s.drive)
    if (selected.length === 0) selected = [sorted[0].drive]

    // Build averaged representative
    const rpm = sample.rpm
    const iface =
      sample.interface ||
      (sample.type === 'SSD_SATA' ? 'SATA' : sample.type === 'SSD_SAS' ? 'SAS' : 'PCIe4')
    const ff = sample.formFactor
    const recording = sample.recording || (sample.type === 'HDD' ? 'CMR' : undefined)
    const nand = sample.nandType
    const dualAct = sample.dualActuator
    const workload = classifyWorkload(sample)

    // Build extras string for naming
    let extras = ''
    if (type === 'HDD') {
      if (recording === 'SMR') extras = 'SMR'
      else if (recording === 'HAMR') extras = 'HAMR'
      else if (recording === 'CMR') extras = 'CMR'
      if (dualAct) extras = 'Dual-Actuator'
    } else {
      if (nand) extras = nand
      if (workload === 'ri') extras += `${extras ? ' ' : ''}Read-Intensive`
      else if (workload === 'mu') extras += `${extras ? ' ' : ''}Mixed-Use`
      else if (workload === 'wi') extras += `${extras ? ' ' : ''}Write-Intensive`
    }

    // Build ID extras
    let idExtras = ''
    if (type === 'HDD') {
      if (recording === 'SMR') idExtras = 'smr'
      else if (recording === 'HAMR') idExtras = 'hamr'
      else if (recording === 'CMR') idExtras = 'cmr'
      if (dualAct) idExtras = 'dual-act'
    } else {
      if (nand) idExtras = nand.toLowerCase()
      if (ff && !['2.5"', '3.5"'].includes(ff)) {
        idExtras += (idExtras ? '-' : '') + ff.toLowerCase().replaceAll('.', '').replaceAll('"', '')
      }
      if (workload === 'ri') idExtras += '-ri'
      else if (workload === 'mu') idExtras += '-mu'
      else if (workload === 'wi') idExtras += '-wi'
    }

    const id = buildId(tier, type, rpm, iface, targetCap, idExtras)
    const model = buildModel(tier, type, rpm, iface, ff, targetCap, extras)

    const entry = {
      id,
      model,
      type: sample.type,
      tier,
    }

    if (ff) entry.formFactor = ff
    if (iface) entry.interface = iface
    if (rpm) entry.rpm = rpm
    if (recording) entry.recording = recording
    if (dualAct) entry.dualActuator = true
    if (nand) entry.nandType = nand
    if (sample.latency_us) {
      entry.latency_us = {
        read: round(avg(selected.filter((d) => d.latency_us).map((d) => d.latency_us.read))),
        write: round(avg(selected.filter((d) => d.latency_us).map((d) => d.latency_us.write))),
      }
    }

    entry.capacity_raw = targetCap
    entry.sector_size = sample.sector_size

    entry.performance = {
      iops_read: round(avg(selected.map((d) => d.performance.iops_read))),
      iops_write: round(avg(selected.map((d) => d.performance.iops_write))),
      bandwidth_read_mb: round(avg(selected.map((d) => d.performance.bandwidth_read_mb))),
      bandwidth_write_mb: round(avg(selected.map((d) => d.performance.bandwidth_write_mb))),
    }

    entry.reliability = {
      ure_rate: Math.min(...selected.map((d) => d.reliability.ure_rate)),
      afr: round(Math.max(...selected.map((d) => d.reliability.afr)), 2),
      dwpd: round(avg(selected.map((d) => d.reliability.dwpd)), 1),
    }

    const mtbfs = selected
      .filter((d) => d.reliability.mtbf_hours)
      .map((d) => d.reliability.mtbf_hours)
    if (mtbfs.length > 0) entry.reliability.mtbf_hours = round(avg(mtbfs))

    entry.power = {
      idle_watts: round(avg(selected.map((d) => d.power.idle_watts)), 1),
      load_watts: round(avg(selected.map((d) => d.power.load_watts)), 1),
    }

    // Cost: average cost per TB from selected, then multiply by target capacity
    const costPerTB = avg(selected.map((d) => d.cost_usd / (d.capacity_raw / 1000000000000)))
    entry.cost_usd = round(costPerTB * (targetCap / 1000000000000))

    result[id] = entry

    // Record mapping
    for (const d of selected) {
      mapping[d.id] = id
    }
  }

  // Map any unmapped drives to the nearest new entry
  for (const d of members) {
    if (!mapping[d.id]) {
      // Find nearest capacity bucket
      const nearest = nearestCapacity(d.capacity_raw, capacityBuckets)
      const tier2 = classifyTier(d)
      // Find the result entry for this group+capacity
      for (const [newId, entry] of Object.entries(result)) {
        if (entry.capacity_raw === nearest && entry.tier === tier2 && entry.type === d.type) {
          mapping[d.id] = newId
          break
        }
      }
      if (!mapping[d.id]) {
        // Fallback: map to first entry in group
        const firstNew = Object.keys(result).find(
          (k) => result[k].tier === tier2 && result[k].type === d.type,
        )
        if (firstNew) mapping[d.id] = firstNew
      }
    }
  }
}

// Sort result by type hierarchy: HDD -> SSD_SATA -> SSD_SAS -> SSD_NVMe, then by capacity
const typeOrder = { HDD: 0, SSD_SATA: 1, SSD_SAS: 2, SSD_NVMe: 3 }
const tierOrder = { enterprise: 0, datacenter: 1, nas: 2, consumer: 3 }

const sortedEntries = Object.entries(result).sort(([, a], [, b]) => {
  const td = typeOrder[a.type] - typeOrder[b.type]
  if (td !== 0) return td
  const trd = tierOrder[a.tier] - tierOrder[b.tier]
  if (trd !== 0) return trd
  return a.capacity_raw - b.capacity_raw
})

const sorted = Object.fromEntries(sortedEntries)

writeFileSync(OUTPUT, `${JSON.stringify(sorted, null, 2)}\n`, 'utf-8')
writeFileSync(MAPPING_OUTPUT, `${JSON.stringify(mapping, null, 2)}\n`, 'utf-8')

console.log(
  `Generated ${Object.keys(sorted).length} generic entries from ${allDrives.length} branded drives`,
)
console.log(`Written to: ${OUTPUT}`)
console.log(`Mapping written to: ${MAPPING_OUTPUT}`)
console.log('\nEntries by tier:')
const tierCounts = {}
for (const e of Object.values(sorted)) {
  tierCounts[e.tier] = (tierCounts[e.tier] || 0) + 1
}
for (const [t, c] of Object.entries(tierCounts)) {
  console.log(`  ${t}: ${c}`)
}
console.log('\nEntries by type:')
const typeCounts = {}
for (const e of Object.values(sorted)) {
  typeCounts[e.type] = (typeCounts[e.type] || 0) + 1
}
for (const [t, c] of Object.entries(typeCounts)) {
  console.log(`  ${t}: ${c}`)
}
