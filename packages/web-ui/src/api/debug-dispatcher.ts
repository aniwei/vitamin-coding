/**
 * CDP-inspired WebSocket event dispatcher.
 *
 * Follows Chrome DevTools Protocol naming conventions:
 *   - Debugger.paused / Debugger.resumed / Debugger.breakpointsChanged
 *   - Log.entryAdded
 *
 * Call `setupDebugWsHandlers()` once at app startup to wire WS events
 * into the Zustand stores.
 */

import { wsClient } from './websocket'
import { useDebugStore } from '../stores/debug'
import { useLogStore } from '../stores/logs'
import type { DebugSnapshot } from '../types/debug'
import type { LogEntry } from '../types/logs'

let initialized = false

export function setupDebugWsHandlers(): void {
  if (initialized) return
  initialized = true

  // ─── Debugger domain ───

  wsClient.on('Debugger.paused', (msg) => {
    const data = msg.data as { reason: string; snapshot: DebugSnapshot }
    useDebugStore.getState().handlePaused(data)
    // Auto-open debug panel on pause
    useDebugStore.getState().openPanel()
  })

  wsClient.on('Debugger.resumed', () => {
    useDebugStore.getState().handleResumed()
  })

  wsClient.on('Debugger.breakpointsChanged', (msg) => {
    const data = msg.data as { breakpoints: Array<{ point: string; enabled: boolean }> }
    useDebugStore.getState().handleBreakpointsChanged(data.breakpoints)
  })

  // ─── Log domain ───
  wsClient.on('Log.entryAdded', (msg) => {
    const data = msg.data as { entry: LogEntry }
    useLogStore.getState().appendEntry(data.entry)
  })
}
