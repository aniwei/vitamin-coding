import { create } from 'zustand'
import type {
  Breakpoint,
  DebugSnapshot,
  PauseResumePayload,
} from '../types/debug'
import * as debugApi from '../api/debug'
import { wsClient } from '../api/websocket'

interface DebugState {
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
  pauseReason: string | null
  currentSnapshot: DebugSnapshot | null
  snapshotHistory: DebugSnapshot[]

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
  handlePaused: (data: { reason: string; snapshot: DebugSnapshot }) => void
  handleResumed: () => void
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

export const useDebugStore = create<DebugState>((set, get) => ({
  enabled: false,
  connected: true,
  panelOpen: true,
  flowPanelOpen: true,
  activeTab: 'debugger',
  breakpoints: [],
  loadingBreakpoints: false,
  paused: false,
  pauseReason: null,
  currentSnapshot: null,
  snapshotHistory: [],
  editDraft: { ...EMPTY_DRAFT },

  togglePanel: () => set((s) => ({ panelOpen: !s.panelOpen })),
  toggleFlowPanel: () => set((s) => ({ flowPanelOpen: !s.flowPanelOpen })),
  openPanel: () => set({ panelOpen: true }),
  closePanel: () => set({ panelOpen: false }),
  setActiveTab: (tab) => set({ activeTab: tab }),

  fetchStatus: async () => {
    try {
      const status = await debugApi.fetchDebugStatus()
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
  handlePaused: ({ reason, snapshot }) => {
    set((s) => ({
      paused: true,
      pauseReason: reason,
      currentSnapshot: snapshot,
      snapshotHistory: [...s.snapshotHistory.slice(-49), snapshot],
      editDraft: {
        systemPrompt: snapshot.systemPrompt,
        llmParams: snapshot.llmParams ? { ...snapshot.llmParams } : undefined,
      },
    }))
  },

  // ─── CDP event: Debugger.resumed ───
  handleResumed: () => {
    set({ paused: false, pauseReason: null, currentSnapshot: null, editDraft: { ...EMPTY_DRAFT } })
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
    wsClient.send({
      type: 'Debugger.resume',
      data: { payload: draft },
    })
  },

  stepOver: (payload) => {
    const draft = payload ?? buildPayload(get())
    wsClient.send({
      type: 'Debugger.stepOver',
      data: { payload: draft },
    })
  },

  stepInto: (payload) => {
    const draft = payload ?? buildPayload(get())
    wsClient.send({
      type: 'Debugger.stepInto',
      data: { payload: draft },
    })
  },

  disable: () => {
    wsClient.send({ type: 'Debugger.disable', data: {} })
  },
}))

// Private helper — build payload from draft only if changes exist
function buildPayload(state: DebugState): PauseResumePayload | undefined {
  const { editDraft, currentSnapshot } = state
  const hasChanges =
    editDraft.systemPrompt !== currentSnapshot?.systemPrompt ||
    (editDraft.injectMessages?.length ?? 0) > 0 ||
    (editDraft.removeMessageIndices?.length ?? 0) > 0 ||
    JSON.stringify(editDraft.llmParams) !== JSON.stringify(currentSnapshot?.llmParams)

  return hasChanges ? editDraft : undefined
}
