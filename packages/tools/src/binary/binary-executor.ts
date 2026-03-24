import os from 'node:os'
import { 
  createWriteStream, 
  chmodSync, 
  readdirSync, 
  statSync, 
  renameSync, 
  rmSync 
} from 'node:fs'
import { join, resolve } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { spawnSync, spawn } from 'node:child_process'
import extractZip from 'extract-zip'
import { 
  mkdirp,
  getThirdPartyToolPath,
  getThirdPartyToolBinaryPath,
  exists,
} from '@vitamin/shared'
import { OFFLINE_MODE_ENABLED, TOOLS_BINARY_DOWNLOAD_TIMEOUT, VITAMIN_USER_AGENT } from '@vitamin/env'


export interface BinaryToolExecutionOptions {
  cwd?: string
  env?: NodeJS.ProcessEnv
  timeout?: number
  stdio?: 'inherit' | 'pipe' | 'ignore'
}

export interface BinaryToolExecutionResult {
  stdout: string
  stderr: string
  exitCode: number | null
}

export interface BinaryTool {
  name: string
  execute(
    args: string[], 
    options?: BinaryToolExecutionOptions
  ): Promise<BinaryToolExecutionResult>
}

async function getLatestVersionFromGitHub(
  repository: string,
  timeout: number = TOOLS_BINARY_DOWNLOAD_TIMEOUT
): Promise<string> {
  const response = await fetch(`https://api.github.com/repos/${repository}/releases/latest`, {
    headers: { 
      'User-Agent': VITAMIN_USER_AGENT
    },
    signal: AbortSignal.timeout(timeout),
  })
  
  if (!response.ok) {
    throw new Error(`GitHub API error: ${response.status}`)
  }

  const data = (await response.json()) as { tag_name: string }
  return data.tag_name.replace(/^v/, '')
}

function getDownloadUrl(repository: string, version: string, asset: string): string {
  return `https://github.com/${repository}/releases/download/v${version}/${asset}`
}

async function tryExecute(toolPath: string): Promise<boolean> {
  try {
    const ps = spawn(toolPath, ['--version'], { stdio: 'pipe' }) 
    return new Promise(resolve => {
      ps.on('error', () => resolve(false))
      ps.on('close', code => resolve(code === 0))
    })
  } catch {
    return false
  }
}

async function resolveExecutablePath(toolName: string): Promise<string | null> {
  const binaryExt = os.platform() === 'win32' ? '.exe' : ''
  const toolPath = getThirdPartyToolBinaryPath(toolName) + binaryExt

  try {
    if (await exists(toolPath)) {
      return toolPath
    }
  } catch {
    // file not found
  }

  if (await tryExecute(toolName)) {
    return toolName
  }

  return null
}

async function downloadToFile(url: string, dest: string): Promise<void> {
  const response = await fetch(url, {
    headers: { 'User-Agent': VITAMIN_USER_AGENT },
    signal: AbortSignal.timeout(TOOLS_BINARY_DOWNLOAD_TIMEOUT),
  })

  if (!response.ok || !response.body) {
    throw new Error(`Failed to download: ${response.status}`)
  }

  const fileStream = createWriteStream(dest)
  await pipeline(Readable.fromWeb(response.body as any), fileStream)
}

async function findBinaryRecursively(
  rootDir: string, 
  binaryFileName: string
): Promise<string | undefined> {
  const stack: string[] = [rootDir]

  while (stack.length > 0) {
    const currentDir = stack.pop() as string

    let entries: string[]
    try {
      entries = readdirSync(currentDir, { encoding: 'utf-8' }) as string[]
    } catch {
      continue
    }

    for (const name of entries) {
      const fullPath = join(currentDir, name)

      try {
        const stat = statSync(fullPath)
        if (stat.isDirectory()) {
          stack.push(fullPath)
        } else if (stat.isFile() && name === binaryFileName) {
          return fullPath
        }
      } catch {
        continue
      }
    }
  }
}

export abstract class BinaryToolExecutor implements BinaryTool {
  public abstract name: string
  public abstract repository: string

  protected projectRoot: string
  private downloadTask: Promise<void> | null = null

  constructor(projectRoot: string) {
    this.projectRoot = projectRoot
  }

  protected abstract resolveAsset(
    version: string, 
    platform: string, 
    arch: string
  ): string | undefined

  async ensure(): Promise<string> {
    const existing = await resolveExecutablePath(this.name)
    if (existing) return existing

    if (OFFLINE_MODE_ENABLED) {
      throw new Error(`${this.name} not found and offline mode is enabled`)
    }

    if (!this.downloadTask) {
      this.downloadTask = this.download().finally(() => {
        this.downloadTask = null
      })
    }

    await this.downloadTask

    const resolved = await resolveExecutablePath(this.name)
    if (!resolved) {
      throw new Error(`${this.name}: download completed but binary not found`)
    }

    return resolved
  }

  protected async download(): Promise<void> {
    const platform = os.platform()
    const architecture = os.arch()

    const version = await getLatestVersionFromGitHub(this.repository)
    const asset = this.resolveAsset(version, platform, architecture)
    if (!asset) {
      throw new Error(`Unsupported platform/architecture: ${platform}/${architecture}`)
    }

    const toolsDir = getThirdPartyToolPath()
    await mkdirp(toolsDir)

    const url = getDownloadUrl(this.repository, version, asset)
    const archivePath = resolve(toolsDir, asset)
    const binaryExt = platform === 'win32' ? '.exe' : ''
    const binaryPath = resolve(toolsDir, this.name + binaryExt)

    await downloadToFile(url, archivePath)

    const extractDir = resolve(
      toolsDir,
      `extract_${this.name}_${process.pid}_${Date.now()}`
    )

    await mkdirp(extractDir)

    try {
      if (asset.endsWith('.tar.gz')) {
        const result = spawnSync('tar', ['xzf', archivePath, '-C', extractDir], { stdio: 'pipe' })
        if (result.error || result.status !== 0) {
          const errMsg = result.error?.message ?? result.stderr?.toString().trim() ?? 'unknown error'
          throw new Error(`Failed to extract ${asset}: ${errMsg}`)
        }
      } else if (asset.endsWith('.zip')) {
        await extractZip(archivePath, { dir: extractDir })
      } else {
        throw new Error(`Unsupported archive format: ${asset}`)
      }

      const binaryFileName = this.name + binaryExt
      const found = await findBinaryRecursively(extractDir, binaryFileName)
      if (!found) {
        throw new Error(`Binary ${binaryFileName} not found in archive`)
      }

      renameSync(found, binaryPath)

      if (platform !== 'win32') {
        chmodSync(binaryPath, 0o755)
      }
    } finally {
      rmSync(archivePath, { force: true })
      rmSync(extractDir, { recursive: true, force: true })
    }
  }

  async execute(
    args: string[], 
    options?: BinaryToolExecutionOptions
  ): Promise<BinaryToolExecutionResult> {
    const executablePath = await this.ensure()

    return new Promise((resolve, reject) => {
      const ps = spawn(executablePath, args, {
        cwd: options?.cwd,
        env: options?.env,
        timeout: options?.timeout
      })
      
      const stdout: Buffer[] = []
      const stderr: Buffer[] = []
      
      ps.stdout.on('data', data => stdout.push(data))
      ps.stderr.on('data', data => stderr.push(data))

      ps.on('error', err => reject(err))
      ps.on('close', code => {
        if (code !== 0) {
          return reject(new Error(`Process exited with code ${code}: ${Buffer.concat(stderr).toString()}`))
        }

        resolve({ 
          stdout: Buffer.concat(stdout).toString(), 
          stderr: Buffer.concat(stderr).toString(),
          exitCode: code,
        })
      })
    })
  }
}

type ConfiguredBinaryExecute = (
  args: string[],
  options?: BinaryToolExecutionOptions
) => Promise<BinaryToolExecutionResult>

export class ConfiguredBinaryExecutor implements BinaryTool {
  public name: string

  protected executeHandler: ConfiguredBinaryExecute

  constructor(
    name: string, 
    execute: ConfiguredBinaryExecute
  ) {
    this.name = name
    this.executeHandler = execute
  }

  async execute(
    args: string[], 
    options?: BinaryToolExecutionOptions
  ): Promise<BinaryToolExecutionResult> {
    return this.executeHandler(args, options)
  }
}