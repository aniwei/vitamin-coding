import { mkdir, rm, stat } from 'node:fs/promises'
import { lookup } from 'mime-types'

export async function mime(path: string): Promise<string> {
  return lookup(path) || 'application/octet-stream'
}

export async function mkdirp(path: string): Promise<void> {
  await mkdir(path, { recursive: true })
}

export async function rimraf(path: string): Promise<void> {
  await rm(path, { recursive: true, force: true })
}

export async function exists(path: string): Promise<boolean> {
  await stat(path)
  return true
}

export async function isDirectory(path: string): Promise<boolean> {
  const info = await stat(path)
  return info.isDirectory()
}

export async function isFile(path: string): Promise<boolean> {
  const info = await stat(path)
  return info.isFile()
}
