/**
 * Shared context for topology option panels.
 *
 * Provides topology state and onChange handler to child panels via React Context,
 * avoiding prop drilling through deeply nested form controls.
 */
import { createContext, useContext } from 'react'
import type { ReactNode } from 'react'
import type { Topology } from '@/types'

interface TopologyContextValue {
  topology: Topology
  onChange: (topology: Topology) => void
}

const TopologyContext = createContext<TopologyContextValue | null>(null)

/**
 * Custom hook to access topology context.
 * Must be used within TopologyProvider.
 */
export function useTopologyContext() {
  const context = useContext(TopologyContext)
  if (!context) {
    throw new Error('useTopologyContext must be used within TopologyProvider')
  }
  return context
}

/**
 * Context provider for topology option panels.
 *
 * Wraps per-topology option panels to provide shared state access.
 */
export function TopologyProvider({
  topology,
  onChange,
  children,
}: {
  topology: Topology
  onChange: (topology: Topology) => void
  children: ReactNode
}) {
  return (
    <TopologyContext.Provider value={{ topology, onChange }}>
      {children}
    </TopologyContext.Provider>
  )
}
