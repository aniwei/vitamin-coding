/**
 * 收集运行时环境信息，注入到 system prompt 尾部。
 * 类似 opendev 的 EnvironmentContext 和 open-agent-sdk 的 getSystemContext。
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
    // 不在 git 仓库中，忽略
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
    // 忽略
  }

  return snapshot
}

export function formatEnvironmentBlock(env: EnvironmentSnapshot): string {
  const lines = [
    '### 运行环境',
    `- 工作目录：${env.workingDirectory}`,
    `- 日期：${env.date}`,
    `- 平台：${env.platform}`,
  ]

  if (env.gitBranch) {
    lines.push(`- Git 分支：${env.gitBranch}`)
  }

  if (env.gitStatus) {
    lines.push(`- Git 状态：\n\`\`\`\n${env.gitStatus}\n\`\`\``)
  }

  return lines.join('\n')
}
