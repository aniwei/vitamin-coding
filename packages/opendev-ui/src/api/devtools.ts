import type { Breakpoint } from '../types/devtools'
import { getJson, postJson, putJson } from './core'

export async function fetchDevtoolsStatus(): Promise<{ enabled: boolean; connected: boolean }> {
  return getJson('/devtools/status')
}

export async function fetchBreakpoints(): Promise<Breakpoint[]> {
  const data = await getJson<{ breakpoints: Breakpoint[] }>('/devtools/breakpoints')
  return data.breakpoints
}

export async function setBreakpoint(point: string, enabled: boolean): Promise<Breakpoint> {
  const data = await putJson<{ breakpoint: Breakpoint }>(
    `/devtools/breakpoints/${encodeURIComponent(point)}`,
    { enabled },
  )
  return data.breakpoint
}

export async function enableAllBreakpoints(): Promise<void> {
  await postJson('/devtools/breakpoints/enable-all')
}

export async function disableAllBreakpoints(): Promise<void> {
  await postJson('/devtools/breakpoints/disable-all')
}
