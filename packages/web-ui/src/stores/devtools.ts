import { create } from 'zustand'
import type {
  Breakpoint,
  DebugSnapshot,
  PauseResumePayload,
  DebuggerCommandMethod,
  CommandRejectCode,
} from '../types/debug'
import * as debugApi from '../api/devtools'
import { ws } from '../api/websocket'

interface DevtoolsState {
  // Connection
  enabled: boolean
  connected: boolean

  // Panel
  panelOpen: boolean
  activeTab: 'debugger' | 'console'
  flowPanelOpen: boolean

  // Breakpoints
  breakpoints: Breakpoint[]
  loadingBreakpoints: boolean

  // Pause state
  paused: boolean
  pauseId: string | null
  pauseReason: string | null
  currentSnapshot: DebugSnapshot | null
  snapshotHistory: DebugSnapshot[]

  // Command tracking
  pendingCommand: DebuggerCommandMethod | null
  lastRejectedReason: CommandRejectCode | null

  // Context writeback draft
  editDraft: PauseResumePayload

  // Actions
  togglePanel: () => void
  toggleFlowPanel: () => void
  openPanel: () => void
  closePanel: () => void
  setActiveTab: (tab: 'debugger' | 'console') => void

  fetchStatus: () => Promise<void>
  fetchBreakpoints: () => Promise<void>
  toggleBreakpoint: (point: string) => Promise<void>
  enableAll: () => Promise<void>
  disableAll: () => Promise<void>

  // WS event handlers (CDP-style: Debugger.paused, Debugger.resumed)
  handlePaused: (data: { reason: string; pauseId: string; snapshot: DebugSnapshot }) => void
  handleResumed: (data?: { pauseId?: string }) => void
  handleCommandRejected: (data: { code: CommandRejectCode; pauseId?: string }) => void
  handleBreakpointsChanged: (breakpoints: Breakpoint[]) => void

  // Draft editing
  updateDraftSystemPrompt: (value: string) => void
  addDraftInjectMessage: (role: 'user' | 'system', content: string) => void
  removeDraftInjectMessage: (index: number) => void
  toggleDraftRemoveMessage: (messageIndex: number) => void
  updateDraftLlmParam: (key: string, value: unknown) => void
  resetDraft: () => void

  // Debugger commands (sent over WS as CDP domain methods)
  resume: (payload?: PauseResumePayload) => void
  stepOver: (payload?: PauseResumePayload) => void
  stepInto: (payload?: PauseResumePayload) => void
  disable: () => void
}

const EMPTY_DRAFT: PauseResumePayload = {}

export const useDevtoolsStore = create<DevtoolsState>((set, get) => ({
  enabled: false,
  connected: true,
  panelOpen: true,
  flowPanelOpen: true,
  activeTab: 'debugger',
  breakpoints: [],
  loadingBreakpoints: false,
  paused: false,
  pauseId: null,
  pauseReason: null,
  currentSnapshot: null,
  snapshotHistory: [],
  pendingCommand: null,
  lastRejectedReason: null,
  editDraft: { ...EMPTY_DRAFT },

  togglePanel: () => set((s) => ({ panelOpen: !s.panelOpen })),
  toggleFlowPanel: () => set((s) => ({ flowPanelOpen: !s.flowPanelOpen })),
  openPanel: () => set({ panelOpen: true }),
  closePanel: () => set({ panelOpen: false }),
  setActiveTab: (tab) => set({ activeTab: tab }),

  fetchStatus: async () => {
    try {
      const status = await debugApi.fetchDevtoolsStatus()
      set({ enabled: status.enabled, connected: status.connected })
    } catch {
      set({ enabled: false, connected: false })
    }
  },

  fetchBreakpoints: async () => {
    set({ loadingBreakpoints: true })
    try {
      const breakpoints = await debugApi.fetchBreakpoints()
      set({ breakpoints, loadingBreakpoints: false })
    } catch {
      set({ loadingBreakpoints: false })
    }
  },

  toggleBreakpoint: async (point) => {
    const bp = get().breakpoints.find((b) => b.point === point)
    if (!bp) return
    const updated = await debugApi.setBreakpoint(point, !bp.enabled)
    set((s) => ({
      breakpoints: s.breakpoints.map((b) => (b.point === point ? updated : b)),
    }))
  },

  enableAll: async () => {
    await debugApi.enableAllBreakpoints()
    set((s) => ({
      breakpoints: s.breakpoints.map((b) => ({ ...b, enabled: true })),
    }))
  },

  disableAll: async () => {
    await debugApi.disableAllBreakpoints()
    set((s) => ({
      breakpoints: s.breakpoints.map((b) => ({ ...b, enabled: false })),
    }))
  },

  // ─── CDP event: Debugger.paused ───
  handlePaused: ({ reason, pauseId, snapshot }) => {
    set((s) => ({
      paused: true,
      pauseId,
      pauseReason: reason,
      currentSnapshot: snapshot,
      snapshotHistory: [...s.snapshotHistory.slice(-49), snapshot],
      pendingCommand: null,
      lastRejectedReason: null,
      editDraft: {
        systemPrompt: snapshot.systemPrompt,
        llmParams: snapshot.llmParams ? { ...snapshot.llmParams } : undefined,
      },
    }))
  },

  // ─── CDP event: Debugger.resumed ───
  handleResumed: (data) => {
    const state = get()
    // Only clear if pauseId matches or no pauseId provided
    if (data?.pauseId && state.pauseId && data.pauseId !== state.pauseId) return
    set({ paused: false, pauseId: null, pauseReason: null, currentSnapshot: null, pendingCommand: null, editDraft: { ...EMPTY_DRAFT } })
  },

  // ─── CDP event: Debugger.commandRejected ───
  handleCommandRejected: ({ code }) => {
    set({ pendingCommand: null, lastRejectedReason: code })
  },

  // ─── CDP event: Debugger.breakpointsChanged ───
  handleBreakpointsChanged: (breakpoints) => {
    set({ breakpoints })
  },

  // ─── Draft editing ───
  updateDraftSystemPrompt: (value) => {
    set((s) => ({ editDraft: { ...s.editDraft, systemPrompt: value } }))
  },

  addDraftInjectMessage: (role, content) => {
    set((s) => ({
      editDraft: {
        ...s.editDraft,
        injectMessages: [...(s.editDraft.injectMessages ?? []), { role, content }],
      },
    }))
  },

  removeDraftInjectMessage: (index) => {
    set((s) => ({
      editDraft: {
        ...s.editDraft,
        injectMessages: (s.editDraft.injectMessages ?? []).filter((_, i) => i !== index),
      },
    }))
  },

  toggleDraftRemoveMessage: (messageIndex) => {
    set((s) => {
      const current = s.editDraft.removeMessageIndices ?? []
      const next = current.includes(messageIndex)
        ? current.filter((i) => i !== messageIndex)
        : [...current, messageIndex]
      return { editDraft: { ...s.editDraft, removeMessageIndices: next } }
    })
  },

  updateDraftLlmParam: (key, value) => {
    set((s) => ({
      editDraft: {
        ...s.editDraft,
        llmParams: { ...s.editDraft.llmParams, [key]: value },
      },
    }))
  },

  resetDraft: () => {
    const snapshot = get().currentSnapshot
    set({
      editDraft: {
        systemPrompt: snapshot?.systemPrompt,
        llmParams: snapshot?.llmParams ? { ...snapshot.llmParams } : undefined,
      },
    })
  },

  // ─── CDP commands: Debugger.resume / stepOver / stepInto / disable ───
  resume: (payload) => {
    const draft = payload ?? buildPayload(get())
    set({ pendingCommand: 'Debugger.resume', lastRejectedReason: null })
    sendDebuggerCommand('Debugger.resume', get().pauseId, draft)
  },

  stepOver: (payload) => {
    const draft = payload ?? buildPayload(get())
    set({ pendingCommand: 'Debugger.stepOver', lastRejectedReason: null })
    sendDebuggerCommand('Debugger.stepOver', get().pauseId, draft)
  },

  stepInto: (payload) => {
    const draft = payload ?? buildPayload(get())
    set({ pendingCommand: 'Debugger.stepInto', lastRejectedReason: null })
    sendDebuggerCommand('Debugger.stepInto', get().pauseId, draft)
  },

  disable: () => {
    set({ pendingCommand: 'Debugger.disable', lastRejectedReason: null })
    sendDebuggerCommand('Debugger.disable', get().pauseId)
  },
}))

function sendDebuggerCommand(method: DebuggerCommandMethod, pauseId: string | null, payload?: PauseResumePayload): void {
  const params: Record<string, unknown> = {}
  if (pauseId) params.pauseId = pauseId
  if (payload) params.payload = payload

  if (Object.keys(params).length > 0) {
    ws.sendCommand(method, params)
    return
  }

  ws.sendCommand(method)
}

// Private helper — build payload from draft only if changes exist
function buildPayload(state: DevtoolsState): PauseResumePayload | undefined {
  const { editDraft, currentSnapshot } = state
  const hasChanges =
    editDraft.systemPrompt !== currentSnapshot?.systemPrompt ||
    (editDraft.injectMessages?.length ?? 0) > 0 ||
    (editDraft.removeMessageIndices?.length ?? 0) > 0 ||
    JSON.stringify(editDraft.llmParams) !== JSON.stringify(currentSnapshot?.llmParams)

  return hasChanges ? editDraft : undefined
}
