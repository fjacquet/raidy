/**
 * Sankey diagram for capacity waterfall visualization.
 * Shows how raw capacity flows through overhead factors to usable capacity.
 */

import { sankey, sankeyLinkHorizontal } from 'd3-sankey'
import { useMemo } from 'react'
import { formatBytes } from '@/hooks'
import type { VolumetryResult } from '@/types/results'

interface SankeyDiagramProps {
  volumetry: VolumetryResult
  width?: number
  height?: number
}

interface SankeyNode {
  name: string
  value: number
  color: string
}

interface SankeyLink {
  source: number
  target: number
  value: number
  color: string
}

// Colors for the diagram
const COLORS = {
  raw: '#64748b', // slate-500
  parity: '#f97316', // orange-500
  hotSpare: '#eab308', // yellow-500
  slop: '#a855f7', // purple-500
  filesystem: '#ec4899', // pink-500
  usable: '#3b82f6', // blue-500
  effective: '#22c55e', // green-500
}

export function SankeyDiagram({ volumetry, width = 600, height = 300 }: SankeyDiagramProps) {
  const { nodes, links, sankeyData } = useMemo(() => {
    const {
      rawCapacity,
      parityOverhead,
      hotSpareOverhead,
      slopOverhead,
      filesystemOverhead,
      usableCapacity,
      effectiveCapacity,
    } = volumetry

    // Build nodes
    const nodeList: SankeyNode[] = [{ name: 'Raw Capacity', value: rawCapacity, color: COLORS.raw }]

    // Track current index for links
    let idx = 1

    // Add overhead nodes if they have values
    const overheadNodes: { name: string; value: number; color: string }[] = []

    if (parityOverhead > 0) {
      overheadNodes.push({ name: 'Parity', value: parityOverhead, color: COLORS.parity })
    }
    if (hotSpareOverhead > 0) {
      overheadNodes.push({ name: 'Hot Spares', value: hotSpareOverhead, color: COLORS.hotSpare })
    }
    if (slopOverhead > 0) {
      overheadNodes.push({ name: 'ZFS Slop', value: slopOverhead, color: COLORS.slop })
    }
    if (filesystemOverhead > 0) {
      overheadNodes.push({
        name: 'FS Overhead',
        value: filesystemOverhead,
        color: COLORS.filesystem,
      })
    }

    nodeList.push(...overheadNodes)
    idx += overheadNodes.length

    // Add usable and effective capacity nodes
    const usableIdx = idx
    nodeList.push({ name: 'Usable', value: usableCapacity, color: COLORS.usable })
    idx++

    const effectiveIdx = idx
    nodeList.push({ name: 'Effective', value: effectiveCapacity, color: COLORS.effective })

    // Build links
    const linkList: SankeyLink[] = []

    // Links from raw to overhead nodes
    let overheadIdx = 1
    if (parityOverhead > 0) {
      linkList.push({
        source: 0,
        target: overheadIdx++,
        value: parityOverhead,
        color: COLORS.parity,
      })
    }
    if (hotSpareOverhead > 0) {
      linkList.push({
        source: 0,
        target: overheadIdx++,
        value: hotSpareOverhead,
        color: COLORS.hotSpare,
      })
    }
    if (slopOverhead > 0) {
      linkList.push({ source: 0, target: overheadIdx++, value: slopOverhead, color: COLORS.slop })
    }
    if (filesystemOverhead > 0) {
      linkList.push({
        source: 0,
        target: overheadIdx++,
        value: filesystemOverhead,
        color: COLORS.filesystem,
      })
    }

    // Link from raw to usable
    linkList.push({ source: 0, target: usableIdx, value: usableCapacity, color: COLORS.usable })

    // Link from usable to effective (compression/dedup gain)
    if (effectiveCapacity > usableCapacity) {
      linkList.push({
        source: usableIdx,
        target: effectiveIdx,
        value: effectiveCapacity,
        color: COLORS.effective,
      })
    } else {
      linkList.push({
        source: usableIdx,
        target: effectiveIdx,
        value: usableCapacity,
        color: COLORS.effective,
      })
    }

    // Create sankey layout
    const sankeyGenerator = sankey<SankeyNode, SankeyLink>()
      .nodeWidth(20)
      .nodePadding(15)
      .extent([
        [10, 10],
        [width - 10, height - 10],
      ])

    const data = sankeyGenerator({
      nodes: nodeList.map((n) => ({ ...n })),
      links: linkList.map((l) => ({ ...l })),
    })

    return { nodes: nodeList, links: linkList, sankeyData: data }
  }, [volumetry, width, height])

  if (!sankeyData.nodes.length) {
    return <div className="text-slate-500">No data to display</div>
  }

  return (
    <svg
      width={width}
      height={height}
      className="overflow-visible"
      aria-label="Capacity waterfall diagram"
    >
      <title>Capacity Waterfall Diagram</title>
      {/* Links */}
      <g fill="none">
        {sankeyData.links.map((link, i) => {
          const linkData = link as {
            width?: number
            source: { x1?: number }
            target: { x0?: number }
            y0?: number
            y1?: number
          }
          const path = sankeyLinkHorizontal()(
            link as Parameters<ReturnType<typeof sankeyLinkHorizontal>>[0],
          )
          const linkId = `link-${links[i]?.source ?? 0}-${links[i]?.target ?? 0}-${i}`
          return (
            <path
              key={linkId}
              d={path || ''}
              stroke={links[i]?.color || '#475569'}
              strokeWidth={Math.max(1, linkData.width || 1)}
              strokeOpacity={0.5}
              className="transition-all duration-300 hover:stroke-opacity-80"
            />
          )
        })}
      </g>

      {/* Nodes */}
      <g>
        {sankeyData.nodes.map((node, i) => {
          const n = node as { x0: number; x1: number; y0: number; y1: number; name?: string }
          const nodeHeight = n.y1 - n.y0
          const nodeWidth = n.x1 - n.x0
          const nodeId = `node-${nodes[i]?.name?.replace(/\s+/g, '-').toLowerCase() ?? i}`

          return (
            <g key={nodeId} transform={`translate(${n.x0}, ${n.y0})`}>
              <rect
                width={nodeWidth}
                height={nodeHeight}
                fill={nodes[i]?.color || '#475569'}
                rx={3}
                className="transition-all duration-300"
              />
              {/* Label */}
              <text
                x={i === 0 ? nodeWidth + 8 : -8}
                y={nodeHeight / 2}
                dy="0.35em"
                textAnchor={i === 0 ? 'start' : 'end'}
                className="text-xs fill-slate-300"
              >
                {nodes[i]?.name}
              </text>
              {/* Value */}
              <text
                x={i === 0 ? nodeWidth + 8 : -8}
                y={nodeHeight / 2 + 14}
                dy="0.35em"
                textAnchor={i === 0 ? 'start' : 'end'}
                className="text-xs fill-slate-500 font-mono"
              >
                {formatBytes(nodes[i]?.value || 0)}
              </text>
            </g>
          )
        })}
      </g>
    </svg>
  )
}
