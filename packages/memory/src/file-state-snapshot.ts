// File State Snapshot — 工作空间文件状态快照
// LLM 可通过 capture_file_state 工具主动调用

export interface FileStateSnapshot {
  timestamp: number
  directoryTree: string
  modifiedFiles: Array<{
    path: string
    action: 'created' | 'modified' | 'deleted'
    summary: string
  }>
  planStatus?: string
  findings: string[]
}

export interface FileStateCapture {
  workspaceDir: string
  recentFiles?: string[]
  planStatus?: string
}

export class FileStateManager {
  private lastSnapshot: FileStateSnapshot | null = null

  async capture(input: FileStateCapture): Promise<FileStateSnapshot> {
    const snapshot: FileStateSnapshot = {
      timestamp: Date.now(),
      directoryTree: '',
      modifiedFiles: [],
      planStatus: input.planStatus,
      findings: [],
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
        .map(f => `  ${f.action}: ${f.path} — ${f.summary}`)
        .join('\n')
      parts.push(`Modified Files:\n${fileLines}`)
    }

    if (snapshot.planStatus) {
      parts.push(`Plan Status: ${snapshot.planStatus}`)
    }

    if (snapshot.findings.length > 0) {
      parts.push(`Findings:\n${snapshot.findings.map(f => `  - ${f}`).join('\n')}`)
    }

    return parts.join('\n\n')
  }
}
