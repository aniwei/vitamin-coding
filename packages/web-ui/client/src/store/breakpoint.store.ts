import { create } from 'zustand'

export type BreakpointCategory =
  | 'agent_work_loop'
  | 'work_loop_injection'
  | 'tool_executor'
  | 'session_prompt_lifecycle'

export const BREAKPOINT_CATEGORY_LABELS: Record<BreakpointCategory, string> = {
  agent_work_loop: 'Agent 循环',
  work_loop_injection: '循环注入',
  tool_executor: 'Tool 执行',
  session_prompt_lifecycle: 'Session / Prompt',
}

export const CATEGORY_ORDER: BreakpointCategory[] = [
  'agent_work_loop',
  'work_loop_injection',
  'tool_executor',
  'session_prompt_lifecycle',
]

interface BreakpointDefinition {
  point: string
  name: string
  category: BreakpointCategory
}

export const BREAKPOINT_POINTS: readonly BreakpointDefinition[] = [
  // ─── Agent work-loop ───
  { point: 'loop_start', name: 'Loop Start', category: 'agent_work_loop' },
  { point: 'model_before', name: 'Model Before', category: 'agent_work_loop' },
  { point: 'model_after', name: 'Model After', category: 'agent_work_loop' },
  { point: 'tool_before', name: 'Tool Before', category: 'agent_work_loop' },
  { point: 'tool_after', name: 'Tool After', category: 'agent_work_loop' },
  { point: 'loop_end', name: 'Loop End', category: 'agent_work_loop' },
  { point: 'loop_cleanup', name: 'Loop Cleanup', category: 'agent_work_loop' },
  { point: 'agent_aborted', name: 'Agent Aborted', category: 'agent_work_loop' },
  { point: 'agent_error', name: 'Agent Error', category: 'agent_work_loop' },
  { point: 'agent_done', name: 'Agent Done', category: 'agent_work_loop' },
  // ─── Work-loop 注入点 ───
  { point: 'steering_check', name: 'Steering Check', category: 'work_loop_injection' },
  { point: 'follow_up_check', name: 'Follow Up Check', category: 'work_loop_injection' },
  { point: 'context_transform', name: 'Context Transform', category: 'work_loop_injection' },
  // ─── Tool executor 内部 ───
  { point: 'tool_resolve', name: 'Tool Resolve', category: 'tool_executor' },
  { point: 'tool_validate', name: 'Tool Validate', category: 'tool_executor' },
  { point: 'tool_hook_before', name: 'Tool Hook Before', category: 'tool_executor' },
  { point: 'tool_hook_after', name: 'Tool Hook After', category: 'tool_executor' },
  // ─── Prompt / Session 生命周期 ───
  { point: 'prompt_before', name: 'Prompt Before', category: 'session_prompt_lifecycle' },
  { point: 'prompt_after', name: 'Prompt After', category: 'session_prompt_lifecycle' },
  { point: 'context_build', name: 'Context Build', category: 'session_prompt_lifecycle' },
  { point: 'messages_persist', name: 'Messages Persist', category: 'session_prompt_lifecycle' },
  { point: 'session_create', name: 'Session Create', category: 'session_prompt_lifecycle' },
  { point: 'session_fork', name: 'Session Fork', category: 'session_prompt_lifecycle' },
  { point: 'session_restore', name: 'Session Restore', category: 'session_prompt_lifecycle' },
] as const

export interface Breakpoint {
  point: string
  name: string
  category: BreakpointCategory
  enabled: boolean
}

interface BreakpointState {
  breakpoints: Breakpoint[]
}

interface BreakpointDispatch {
  toggle: (point: string) => void
  enableAll: () => void
  disableAll: () => void
  enableCategory: (category: BreakpointCategory) => void
  disableCategory: (category: BreakpointCategory) => void
}

const initialBreakpoints: Breakpoint[] = BREAKPOINT_POINTS.map((bp) => ({
  ...bp,
  enabled: false,
}))

export const useBreakpointStore = create<BreakpointState & BreakpointDispatch>((set) => ({
  breakpoints: initialBreakpoints,

  toggle: (point) =>
    set((s) => ({
      breakpoints: s.breakpoints.map((b) =>
        b.point === point ? { ...b, enabled: !b.enabled } : b,
      ),
    })),

  enableAll: () =>
    set((s) => ({
      breakpoints: s.breakpoints.map((b) => ({ ...b, enabled: true })),
    })),

  disableAll: () =>
    set((s) => ({
      breakpoints: s.breakpoints.map((b) => ({ ...b, enabled: false })),
    })),

  enableCategory: (category) =>
    set((s) => ({
      breakpoints: s.breakpoints.map((b) =>
        b.category === category ? { ...b, enabled: true } : b,
      ),
    })),

  disableCategory: (category) =>
    set((s) => ({
      breakpoints: s.breakpoints.map((b) =>
        b.category === category ? { ...b, enabled: false } : b,
      ),
    })),
}))
