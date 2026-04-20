/**
 * Compat shim for @/app/api/archive/actions (server actions → fetch calls)
 */
import type { Archive } from 'app-types/archive'

export async function createArchiveAction(data: { name: string; description?: string }) {
  const res = await fetch('/api/archive', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json() as Promise<Archive>
}

export async function updateArchiveAction(id: string, data: { name: string; description?: string }) {
  const res = await fetch(`/api/archive/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json() as Promise<Archive>
}

export async function deleteArchiveAction(id: string) {
  const res = await fetch(`/api/archive/${id}`, { method: 'DELETE' })
  if (!res.ok) throw new Error(await res.text())
  return res.json() as Promise<{ success: boolean }>
}

export async function addItemToArchiveAction(archiveId: string, itemId: string) {
  const res = await fetch(`/api/archive/${archiveId}/items`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ itemId }),
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function removeItemFromArchiveAction(archiveId: string, itemId: string) {
  const res = await fetch(`/api/archive/${archiveId}/items/${itemId}`, { method: 'DELETE' })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function getItemArchivesAction(itemId: string) {
  const res = await fetch(`/api/archive?itemId=${encodeURIComponent(itemId)}`)
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}
