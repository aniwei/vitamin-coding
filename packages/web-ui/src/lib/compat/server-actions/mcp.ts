/**
 * Compat shim for @/app/api/mcp/actions (server actions → fetch calls)
 */
import type { McpServerTable } from 'lib/db/pg/schema.pg'

export async function selectMcpClientsAction() {
  const res = await fetch('/api/mcp/list')
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function selectMcpClientAction(id: string) {
  const res = await fetch(`/api/mcp/${id}`)
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function saveMcpClientAction(server: typeof McpServerTable.$inferInsert) {
  const res = await fetch('/api/mcp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(server),
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function existMcpClientByServerNameAction(serverName: string): Promise<boolean> {
  const res = await fetch(`/api/mcp/exists/${encodeURIComponent(serverName)}`)
  if (!res.ok) return false
  const data = await res.json()
  return data.exists === true
}

export async function removeMcpClientAction(id: string) {
  const res = await fetch(`/api/mcp/${id}`, { method: 'DELETE' })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function refreshMcpClientAction(id: string) {
  const res = await fetch(`/api/mcp/${id}/refresh`, { method: 'POST' })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function authorizeMcpClientAction(id: string): Promise<string | undefined> {
  const res = await fetch(`/api/mcp/${id}/authorize`, { method: 'POST' })
  if (!res.ok) throw new Error(await res.text())
  const data = await res.json()
  return data.authorizationUrl
}

export async function checkTokenMcpClientAction(id: string): Promise<boolean> {
  const res = await fetch(`/api/mcp/${id}/check-token`)
  if (!res.ok) return false
  const data = await res.json()
  return data.hasToken === true
}

export async function callMcpToolAction(id: string, toolName: string, input: unknown) {
  const res = await fetch(`/api/mcp/${id}/call-tool`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ toolName, input }),
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function callMcpToolByServerNameAction(
  serverName: string,
  toolName: string,
  input: unknown,
) {
  // Look up the server by name and call the tool
  const listRes = await fetch('/api/mcp/list')
  const list = await listRes.json()
  const server = list.find((s: any) => s.name === serverName)
  if (!server) throw new Error(`MCP server not found: ${serverName}`)
  return callMcpToolAction(server.id, toolName, input)
}

export async function shareMcpServerAction(id: string, visibility: 'public' | 'private') {
  const res = await fetch(`/api/mcp/${id}/share`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ visibility }),
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}
