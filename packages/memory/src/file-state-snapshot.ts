import { mkdir, readFile, readdir, stat, unlink, writeFile } from 'node:fs/promises'
import { dirname, join, relative, resolve } from 'node:path'

export interface FileStateSnapshot {
  timestamp: number
  directoryTree: string
  modifiedFiles: Array<{
    path: string
    action: 'created' | 'modified' | 'deleted'
    summary: string
  }>
  fileContents?: FileContentSnapshot[]
  planStatus?: string
  findings: string[]
}

export interface FileContentSnapshot {
  path: string
  existed: boolean
  content?: string
  sizeBytes?: number
  truncated?: boolean
}

export interface FileStateCapture {
  workspaceDir: string
  recentFiles?: string[]
  planStatus?: string
  captureFileContents?: boolean
  maxFileContentBytes?: number
}

const IGNORED_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  '.next',
  '.turbo',
  'coverage',
  '.cache',
  '__pycache__',
  '.vscode',
])

const MAX_TREE_DEPTH = 4
const MAX_ENTRIES_PER_DIR = 50
const DEFAULT_MAX_FILE_CONTENT_BYTES = 128 * 1024

export class FileStateManager {
  private lastSnapshot: FileStateSnapshot | null = null

  async capture(input: FileStateCapture): Promise<FileStateSnapshot> {
    const [directoryTree, modifiedFiles, fileContents] = await Promise.all([
      this.buildDirectoryTree(input.workspaceDir, 0),
      this.checkRecentFiles(input.workspaceDir, input.recentFiles ?? []),
      input.captureFileContents
        ? this.captureFileContents(
            input.workspaceDir,
            input.recentFiles ?? [],
            input.maxFileContentBytes ?? DEFAULT_MAX_FILE_CONTENT_BYTES,
          )
        : Promise.resolve(undefined),
    ])

    const findings: string[] = []
    if (modifiedFiles.length > 0) {
      findings.push(`${modifiedFiles.length} recently modified file(s) detected`)
    }

    const snapshot: FileStateSnapshot = {
      timestamp: Date.now(),
      directoryTree,
      modifiedFiles,
      fileContents,
      planStatus: input.planStatus,
      findings,
    }

    this.lastSnapshot = snapshot
    return snapshot
  }

  getLastSnapshot(): FileStateSnapshot | null {
    return this.lastSnapshot
  }

  formatSnapshot(snapshot: FileStateSnapshot): string {
    const parts: string[] = [
      `[File State Snapshot @ ${new Date(snapshot.timestamp).toISOString()}]`,
    ]

    if (snapshot.directoryTree) {
      parts.push(`Directory:\n${snapshot.directoryTree}`)
    }

    if (snapshot.modifiedFiles.length > 0) {
      const fileLines = snapshot.modifiedFiles
        .map((f) => `  ${f.action}: ${f.path} — ${f.summary}`)
        .join('\n')
      parts.push(`Modified Files:\n${fileLines}`)
    }

    if (snapshot.fileContents && snapshot.fileContents.length > 0) {
      const fileLines = snapshot.fileContents
        .map((f) => {
          if (!f.existed) {
            return `  missing: ${f.path}`
          }
          const suffix = f.truncated ? ', truncated' : ''
          return `  captured: ${f.path} (${f.sizeBytes ?? 0} bytes${suffix})`
        })
        .join('\n')
      parts.push(`File Contents:\n${fileLines}`)
    }

    if (snapshot.planStatus) {
      parts.push(`Plan Status: ${snapshot.planStatus}`)
    }

    if (snapshot.findings.length > 0) {
      parts.push(`Findings:\n${snapshot.findings.map((f) => `  - ${f}`).join('\n')}`)
    }

    return parts.join('\n\n')
  }

  async restoreFileContents(workspaceDir: string, snapshot: FileStateSnapshot): Promise<string[]> {
    const restored: string[] = []
    for (const file of snapshot.fileContents ?? []) {
      const fullPath = resolveWorkspacePath(workspaceDir, file.path)
      if (!fullPath) {
        continue
      }

      if (!file.existed) {
        try {
          await unlink(fullPath)
        } catch {
          // Missing files already match the captured state.
        }
        restored.push(file.path)
        continue
      }

      await mkdir(dirname(fullPath), { recursive: true })
      await writeFile(fullPath, file.content ?? '', 'utf-8')
      restored.push(file.path)
    }
    return restored
  }

  private async buildDirectoryTree(dir: string, depth: number, prefix = ''): Promise<string> {
    if (depth >= MAX_TREE_DEPTH) {
      return prefix ? `${prefix}...\n` : ''
    }

    let entries: string[]
    try {
      const dirEntries = await readdir(dir, { withFileTypes: true })
      entries = dirEntries
        .filter((e) => !IGNORED_DIRS.has(e.name) && !e.name.startsWith('.'))
        .sort((a, b) => {
          // 目录优先排序
          if (a.isDirectory() !== b.isDirectory()) {
            return a.isDirectory() ? -1 : 1
          }
          return a.name.localeCompare(b.name)
        })
        .slice(0, MAX_ENTRIES_PER_DIR)
        .map((e) => e.name + (e.isDirectory() ? '/' : ''))
    } catch {
      return ''
    }

    const lines: string[] = []
    for (const entry of entries) {
      const isDir = entry.endsWith('/')
      lines.push(`${prefix}${entry}`)
      if (isDir) {
        const subTree = await this.buildDirectoryTree(
          join(dir, entry.slice(0, -1)),
          depth + 1,
          `${prefix}  `,
        )
        if (subTree) {
          lines.push(subTree.trimEnd())
        }
      }
    }

    return lines.join('\n')
  }

  private async checkRecentFiles(
    workspaceDir: string,
    recentFiles: string[],
  ): Promise<FileStateSnapshot['modifiedFiles']> {
    const results: FileStateSnapshot['modifiedFiles'] = []
    const now = Date.now()
    const ONE_HOUR = 60 * 60 * 1000

    for (const filePath of recentFiles) {
      const fullPath = filePath.startsWith('/') ? filePath : join(workspaceDir, filePath)
      const relPath = relative(workspaceDir, fullPath)
      try {
        const fileStat = await stat(fullPath)
        const age = now - fileStat.mtimeMs
        const action = age < ONE_HOUR ? 'modified' : 'modified'
        const summary = `${(fileStat.size / 1024).toFixed(1)}KB, modified ${formatAge(age)} ago`
        results.push({ path: relPath, action, summary })
      } catch {
        results.push({ path: relPath, action: 'deleted', summary: 'file not found' })
      }
    }

    return results
  }

  private async captureFileContents(
    workspaceDir: string,
    recentFiles: string[],
    maxBytes: number,
  ): Promise<FileContentSnapshot[]> {
    const snapshots: FileContentSnapshot[] = []

    for (const filePath of recentFiles) {
      const fullPath = resolveWorkspacePath(workspaceDir, filePath)
      if (!fullPath) {
        continue
      }

      const relPath = relative(resolve(workspaceDir), fullPath)
      try {
        const buffer = await readFile(fullPath)
        const truncated = buffer.byteLength > maxBytes
        const content = buffer.subarray(0, maxBytes).toString('utf-8')
        snapshots.push({
          path: relPath,
          existed: true,
          content,
          sizeBytes: buffer.byteLength,
          truncated,
        })
      } catch {
        snapshots.push({
          path: relPath,
          existed: false,
        })
      }
    }

    return snapshots
  }
}

function resolveWorkspacePath(workspaceDir: string, filePath: string): string | undefined {
  const workspace = resolve(workspaceDir)
  const fullPath = resolve(workspace, filePath)
  const relativePath = relative(workspace, fullPath)
  if (relativePath.startsWith('..') || relativePath === '') {
    return undefined
  }
  return fullPath
}

function formatAge(ms: number): string {
  const seconds = Math.floor(ms / 1000)
  if (seconds < 60) {
    return `${seconds}s`
  }
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) {
    return `${minutes}m`
  }
  const hours = Math.floor(minutes / 60)
  return `${hours}h`
}
