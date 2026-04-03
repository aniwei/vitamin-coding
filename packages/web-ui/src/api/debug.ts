import type { Breakpoint } from '../types/debug'

const BASE = '/api/debug'

export async function fetchDebugStatus(): Promise<{ enabled: boolean; connected: boolean }> {
  const res = await fetch(`${BASE}/status`)
  return res.json()
}

export async function fetchBreakpoints(): Promise<Breakpoint[]> {
  const res = await fetch(`${BASE}/breakpoints`)
  const data = await res.json()
  return data.breakpoints
}

export async function setBreakpoint(point: string, enabled: boolean): Promise<Breakpoint> {
  const res = await fetch(`${BASE}/breakpoints/${encodeURIComponent(point)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled }),
  })
  const data = await res.json()
  return data.breakpoint
}

export async function enableAllBreakpoints(): Promise<void> {
  await fetch(`${BASE}/breakpoints/enable-all`, { method: 'POST' })
}

export async function disableAllBreakpoints(): Promise<void> {
  await fetch(`${BASE}/breakpoints/disable-all`, { method: 'POST' })
}
