/**
 * Client-side API wrapper for archive operations.
 * Replaces Next.js server actions with fetch calls to the Hono API.
 */

import { fetcher } from '@/lib/utils'

export async function createArchiveAction(data: {
  name: string
  description?: string
}): Promise<{ id: string }> {
  return fetcher('/api/archive', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
}

export async function updateArchiveAction(
  id: string,
  data: { name?: string; description?: string }
): Promise<void> {
  await fetcher(`/api/archive/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
}

export async function deleteArchiveAction(id: string): Promise<void> {
  await fetcher(`/api/archive/${id}`, { method: 'DELETE' })
}

export async function addItemToArchiveAction(
  archiveId: string,
  itemId: string
): Promise<void> {
  await fetcher(`/api/archive/${archiveId}/items`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ itemId }),
  })
}

export async function removeItemFromArchiveAction(
  archiveId: string,
  itemId: string
): Promise<void> {
  await fetcher(`/api/archive/${archiveId}/items/${itemId}`, {
    method: 'DELETE',
  })
}

export async function getItemArchivesAction(
  itemId: string
): Promise<{ id: string; name: string }[]> {
  return fetcher(`/api/archive/item/${itemId}`)
}
