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

import { ws } from './websocket'
import { useDevtoolsStore } from '../stores/debug'
import { useLogStore } from '../stores/logs'
import type { DebugSnapshot } from '../types/debug'
import type { LogEntry } from '../types/logs'

let initialized = false

export function setupDebugWsHandlers(): void {
  if (initialized) return
  initialized = true

  // ─── Debugger domain ───

  ws.on('Debugger.paused', (msg) => {
    const data = msg.data as { reason: string; snapshot: DebugSnapshot }
    useDevtoolsStore.getState().handlePaused(data)
    // Auto-open debug panel on pause
    useDevtoolsStore.getState().openPanel()
  })

  ws.on('Debugger.resumed', () => {
    useDevtoolsStore.getState().handleResumed()
  })

  ws.on('Debugger.breakpointsChanged', (msg) => {
    const data = msg.data as { breakpoints: Array<{ point: string; enabled: boolean }> }
    useDevtoolsStore.getState().handleBreakpointsChanged(data.breakpoints)
  })

  // ─── Log domain ───
  ws.on('Log.entryAdded', (msg) => {
    const data = msg.data as { entry: LogEntry }
    useLogStore.getState().appendEntry(data.entry)
  })
}
