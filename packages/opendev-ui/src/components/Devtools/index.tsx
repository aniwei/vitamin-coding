import { useEffect, useRef, useCallback, useState } from 'react'
import { Terminal, PanelRightClose } from 'lucide-react'
import { useDevtoolsStore } from '../../stores/devtools'
import { Debug } from './Debug'
import { Console } from './Console'
import { BreakpointFlow } from './Flow/index'
import { setupDevtoolsHandle } from '../../api/devtools-dispatcher'

export { DebugStatusBadge } from './DebugStatusBadge'

const PANEL_MIN_W = 320
const PANEL_MAX_W_RATIO = 0.7

const PANEL_DEFAULT_W = 720
const PANEL_STORAGE_W = 'x-mars.webui.devtools.panel.width'

const TOP_MIN_H = 200
const TOP_MAX_H_RATIO = 0.85

const TOP_DEFAULT_H = 420
const TOP_STORAGE_H = 'x-mars.webui.devtools.top.height'

const FLOW_MIN_W = 160
const FLOW_DEFAULT_W = 380
const FLOW_STORAGE_W = 'x-mars.webui.devtools.flow.width'

function readStoredNumber(key: string, fallback: number): number {
  if (typeof window === 'undefined') {return fallback}

  const raw = window.localStorage.getItem(key)
  if (!raw) {return fallback}

  const parsed = Number(raw)
  if (!Number.isFinite(parsed) || parsed <= 0) {return fallback}

  return parsed
}

function clampPanelWidth(width: number): number {
  const maxW = typeof window === 'undefined' ? width : window.innerWidth * PANEL_MAX_W_RATIO
  return Math.min(maxW, Math.max(PANEL_MIN_W, width))
}

export function Devtools() {
  const panelOpen = useDevtoolsStore((s) => s.panelOpen)
  const closePanel = useDevtoolsStore((s) => s.closePanel)
  const paused = useDevtoolsStore((s) => s.paused)
  const fetchStatus = useDevtoolsStore((s) => s.fetchStatus)
  const fetchBreakpoints = useDevtoolsStore((s) => s.fetchBreakpoints)

  const [panelWidth, setPanelWidth] = useState(() =>
    clampPanelWidth(readStoredNumber(PANEL_STORAGE_W, PANEL_DEFAULT_W)),
  )
  const [topHeight, setTopHeight] = useState(() => readStoredNumber(TOP_STORAGE_H, TOP_DEFAULT_H))
  const [flowWidth, setFlowWidth] = useState(() => readStoredNumber(FLOW_STORAGE_W, FLOW_DEFAULT_W))
  const asideRef = useRef<HTMLElement>(null)

  useEffect(() => {
    setupDevtoolsHandle()
    fetchStatus()
    fetchBreakpoints()
  }, [fetchStatus, fetchBreakpoints])

  useEffect(() => {
    window.localStorage.setItem(PANEL_STORAGE_W, String(panelWidth))
  }, [panelWidth])

  useEffect(() => {
    window.localStorage.setItem(TOP_STORAGE_H, String(topHeight))
  }, [topHeight])

  useEffect(() => {
    window.localStorage.setItem(FLOW_STORAGE_W, String(flowWidth))
  }, [flowWidth])

  // ── Panel left-edge horizontal resize ──
  const onPanelDragStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      const startX = e.clientX
      const startW = panelWidth
      const onMove = (ev: MouseEvent) => {
        const maxW = window.innerWidth * PANEL_MAX_W_RATIO
        setPanelWidth(Math.min(maxW, Math.max(PANEL_MIN_W, startW - (ev.clientX - startX))))
      }
      const onUp = () => {
        document.removeEventListener('mousemove', onMove)
        document.removeEventListener('mouseup', onUp)
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
      }
      document.body.style.cursor = 'col-resize'
      document.body.style.userSelect = 'none'
      document.addEventListener('mousemove', onMove)
      document.addEventListener('mouseup', onUp)
    },
    [panelWidth],
  )

  // ── Top/bottom vertical resize ──
  const onTopDragStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      const startY = e.clientY
      const startH = topHeight
      const panelH = asideRef.current?.clientHeight ?? 700
      const onMove = (ev: MouseEvent) => {
        const maxH = panelH * TOP_MAX_H_RATIO
        setTopHeight(Math.min(maxH, Math.max(TOP_MIN_H, startH + (ev.clientY - startY))))
      }
      const onUp = () => {
        document.removeEventListener('mousemove', onMove)
        document.removeEventListener('mouseup', onUp)
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
      }
      document.body.style.cursor = 'row-resize'
      document.body.style.userSelect = 'none'
      document.addEventListener('mousemove', onMove)
      document.addEventListener('mouseup', onUp)
    },
    [topHeight],
  )

  // ── Flow/Breakpoint left-right resize ──
  const onFlowDragStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      const startX = e.clientX
      const startW = flowWidth
      const onMove = (ev: MouseEvent) => {
        const maxW = panelWidth - FLOW_MIN_W
        setFlowWidth(Math.min(maxW, Math.max(FLOW_MIN_W, startW + (ev.clientX - startX))))
      }
      const onUp = () => {
        document.removeEventListener('mousemove', onMove)
        document.removeEventListener('mouseup', onUp)
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
      }
      document.body.style.cursor = 'col-resize'
      document.body.style.userSelect = 'none'
      document.addEventListener('mousemove', onMove)
      document.addEventListener('mouseup', onUp)
    },
    [flowWidth, panelWidth],
  )

  if (!panelOpen) {return null}

  return (
    <aside
      ref={asideRef}
      className="border-l border-gray-200 bg-white flex flex-col shrink-0 h-full overflow-hidden relative"
      style={{ width: panelWidth }}
    >
      {/* Left-edge panel resize */}
      <div
        onMouseDown={onPanelDragStart}
        className="absolute left-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-blue-400/40 active:bg-blue-500/50 z-20"
      />

      {/* ── Full-width top bar ── */}
      <div className="flex items-center px-3 py-1 border-b border-gray-200 bg-gray-50/60 shrink-0">
        {paused && <span className="ml-1.5 w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />}
        <div className="flex-1" />
        <button
          onClick={closePanel}
          className="p-0.5 rounded hover:bg-gray-100 text-gray-400"
          title="Hide panel"
        >
          <PanelRightClose className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* ── Top: Flow (left) + DebugTab (right) ── */}
      <div className="flex flex-row shrink-0 overflow-hidden" style={{ height: topHeight }}>
        {/* Flow panel */}
        <div className="flex flex-col overflow-hidden" style={{ width: flowWidth }}>
          <div className="flex items-center px-3 py-1 border-b border-gray-200 bg-gray-50/60 shrink-0">
            <span className="text-[11px] font-semibold text-gray-400">Flow</span>
          </div>
          <div className="flex-1 overflow-hidden min-h-0">
            <BreakpointFlow />
          </div>
        </div>

        {/* Flow/Breakpoint vertical drag handle */}
        <div
          onMouseDown={onFlowDragStart}
          className="w-1 shrink-0 cursor-col-resize hover:bg-blue-400/40 active:bg-blue-500/50 border-l border-gray-200"
        />

        <div className="flex-1 flex flex-col overflow-hidden min-w-0">
          <div className="flex-1 overflow-hidden min-h-0">
            <Debug />
          </div>
        </div>
      </div>

      <div
        onMouseDown={onTopDragStart}
        className="h-1 shrink-0 cursor-row-resize hover:bg-blue-400/40 active:bg-blue-500/50 border-t border-gray-300"
      />

      <div className="flex-1 flex flex-col overflow-hidden min-h-0">
        <div className="flex items-center px-3 py-1 border-b border-gray-200 bg-gray-50/60 shrink-0">
          <Terminal className="w-3 h-3 text-gray-400 mr-1" />
          <span className="text-[11px] font-semibold text-gray-500">Console</span>
        </div>
        <div className="flex-1 overflow-hidden min-h-0">
          <Console />
        </div>
      </div>
    </aside>
  )
}

