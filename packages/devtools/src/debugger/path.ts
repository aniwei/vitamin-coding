import { fileURLToPath } from 'node:url'

export function resolveDebugClientPath(): string {
  return fileURLToPath(new URL('./client.js', import.meta.url))
}
