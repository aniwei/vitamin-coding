/**
 * Collect runtime environment info and inject it at the end of the system prompt.
 * Similar to opendev's EnvironmentContext and open-agent-sdk's getSystemContext.
 */
export interface EnvironmentSnapshot {
  workingDirectory: string
  date: string
  platform: string
  gitBranch?: string
  gitStatus?: string
}

export async function collectEnvironment(
  workspaceDir: string,
  exec?: (cmd: string, cwd: string) => Promise<string>,
): Promise<EnvironmentSnapshot> {
  const snapshot: EnvironmentSnapshot = {
    workingDirectory: workspaceDir,
    date: new Date().toISOString().split('T')[0] ?? new Date().toLocaleDateString(),
    platform: `${process.platform}/${process.arch}`,
  }

  if (!exec) return snapshot

  try {
    const branch = (await exec('git rev-parse --abbrev-ref HEAD', workspaceDir)).trim()
    if (branch) snapshot.gitBranch = branch
  } catch {
    // Not in a git repository, ignore
  }

  try {
    const status = (await exec('git status --porcelain --short', workspaceDir)).trim()
    if (status) {
      const lines = status.split('\n')
      snapshot.gitStatus = lines.length > 10
        ? `${lines.slice(0, 10).join('\n')}\n... and ${lines.length - 10} more files`
        : status
    }
  } catch {
    // Ignore
  }

  return snapshot
}

export function formatEnvironmentBlock(env: EnvironmentSnapshot): string {
  const lines = [
    '### Runtime Environment',
    `- Working directory: ${env.workingDirectory}`,
    `- Date: ${env.date}`,
    `- Platform: ${env.platform}`,
  ]

  if (env.gitBranch) {
    lines.push(`- Git branch: ${env.gitBranch}`)
  }

  if (env.gitStatus) {
    lines.push(`- Git status:\n\`\`\`\n${env.gitStatus}\n\`\`\``)
  }

  return lines.join('\n')
}
