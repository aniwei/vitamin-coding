import { spawnSync } from 'node:child_process'
import { cp, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'

type WorkspaceSource = 'explicit' | 'git-head' | 'working-copy'

export interface PreparedWorkspace {
  workspaceDir: string
  source: WorkspaceSource
  cleanup: () => Promise<void>
}

function shellQuote(value: string): string {
  return `'${value.replaceAll(`'`, `'"'"'`)}'`
}

function resolveRepoRoot(cwd: string): string | undefined {
  const result = spawnSync('git', ['rev-parse', '--show-toplevel'], {
    cwd,
    encoding: 'utf-8',
  })

  if (result.status !== 0) {
    return undefined
  }

  const repoRoot = result.stdout.trim()
  return repoRoot.length > 0 ? repoRoot : undefined
}

export async function prepareSandboxWorkspace(sourceDir: string): Promise<PreparedWorkspace> {
  const explicitWorkspaceDir = process.env.CODING_EXAMPLE_WORKSPACE_DIR?.trim()
  if (explicitWorkspaceDir) {
    return {
      workspaceDir: explicitWorkspaceDir,
      source: 'explicit',
      cleanup: async () => {},
    }
  }

  const sandboxRoot = await mkdtemp(join(tmpdir(), 'x-mars-coding-example-'))
  const cleanup = async () => {
    await rm(sandboxRoot, { recursive: true, force: true })
  }

  const repoRoot = resolveRepoRoot(sourceDir)
  if (repoRoot) {
    const relativeWorkspaceDir = relative(repoRoot, sourceDir)

    if (relativeWorkspaceDir.length > 0 && !relativeWorkspaceDir.startsWith('..')) {
      const command = `git archive --format=tar HEAD ${shellQuote(relativeWorkspaceDir)} | tar -x -C ${shellQuote(sandboxRoot)}`
      const result = spawnSync('sh', ['-lc', command], {
        cwd: repoRoot,
        encoding: 'utf-8',
      })

      if (result.status === 0) {
        return {
          workspaceDir: join(sandboxRoot, relativeWorkspaceDir),
          source: 'git-head',
          cleanup,
        }
      }
    }
  }

  const fallbackWorkspaceDir = join(sandboxRoot, 'workspace')
  await cp(sourceDir, fallbackWorkspaceDir, { recursive: true })

  return {
    workspaceDir: fallbackWorkspaceDir,
    source: 'working-copy',
    cleanup,
  }
}
