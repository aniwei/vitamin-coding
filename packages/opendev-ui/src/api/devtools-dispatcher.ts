import { ws } from './websocket'
import { useDevtoolsStore } from '../stores/devtools'
import { useLogStore } from '../stores/logs'
import type { Breakpoint, CommandRejectCode, DebugSnapshot } from '../types/devtools'
import type { LogEntry } from '../types/logs'

let initialized = false

export function setupDevtoolsHandle(): void {
  if (initialized) {return}
  initialized = true

  ws.on('Debugger.paused', (msg) => {
    const data = msg.data as { reason: string; pauseId: string; snapshot: DebugSnapshot }
    useDevtoolsStore.getState().handlePaused(data)
    // 暂停时自动打开调试面板
    useDevtoolsStore.getState().openPanel()
  })

  ws.on('Debugger.resumed', (msg) => {
    const data = msg.data as { pauseId?: string } | undefined
    useDevtoolsStore.getState().handleResumed(data)
  })

  ws.on('Debugger.commandRejected', (msg) => {
    const data = msg.data as { code: CommandRejectCode; pauseId?: string }
    useDevtoolsStore.getState().handleCommandRejected(data)
  })

  ws.on('Debugger.breakpointsChanged', (msg) => {
    const data = msg.data as { breakpoints: Breakpoint[] }
    useDevtoolsStore.getState().handleBreakpointsChanged(data.breakpoints)
  })

  ws.on('Log.entryAdded', (msg) => {
    const data = msg.data as { entry: LogEntry }
    useLogStore.getState().appendEntry(data.entry)
  })
}
