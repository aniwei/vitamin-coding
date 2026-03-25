import os from 'node:os'
import invariant from '@vitamin/invariant'
import { 
  createWriteStream, 
  existsSync, 
  mkdirSync,
  readdirSync,
  statSync,
  copyFileSync,
  rmSync,
  chmodSync
} from 'node:fs'
import { join, resolve } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { 
  spawnSync, 
  spawn, 
  type SpawnOptionsWithoutStdio 
} from 'node:child_process'
import { 
  getThirdPartyToolPath,
  getThirdPartyToolBinaryPath,
  createLogger
} from '@vitamin/shared'
import { 
  OFFLINE_MODE_ENABLED, 
  TOOLS_BINARY_DOWNLOAD_TIMEOUT, 
  VITAMIN_USER_AGENT 
} from '@vitamin/env'


const logger = createLogger('@vitamin/tools:binary')

export interface BinaryToolExecutionOptions extends SpawnOptionsWithoutStdio {
  
}

export interface BinaryToolExecutionResult {
  stdout: string
  stderr: string
  exitCode: number | null
}

export interface BinaryTool {
  name: string
  version: string
  execute(
    args: string[], 
    options?: SpawnOptionsWithoutStdio
  ): Promise<BinaryToolExecutionResult>
}

function tryExecuteSync(
  toolPath: string,
  args: string[] = ['--version']
): boolean {
  const result = spawnSync(toolPath, args, { stdio: 'pipe' }) 
  return result.status === 0
}

async function tryResolveExecutablePath(
  toolName: string, 
  target: string = toolName
): Promise<string | null> {
  const ext = os.platform() === 'win32' ? '.exe' : ''
  const toolPath = getThirdPartyToolBinaryPath(target, toolName) + ext

  try {
    if (existsSync((toolPath))) return toolPath
  } catch { 
    logger.debug(`Error checking existence of ${toolPath}, will try PATH lookup: %s`, toolPath)
  }

  if (tryExecuteSync(toolName)) {
    return toolName
  }

  return null
}

async function tryDownloadAndExtract(
  name: string,
  cacheDir: string,
  url: string
) {
  const platform = os.platform()
  const toolsDir = getThirdPartyToolPath()
  const archivePath = resolve(toolsDir, `${cacheDir}.download`)

  const filename = name + (platform === 'win32' ? '.exe' : '')
  const binaryDir = resolve(toolsDir, cacheDir)
  const binaryPath = resolve(binaryDir, filename)

  const extractDir = resolve(toolsDir, `${cacheDir}-extract-${process.pid}_${Date.now()}`)
  
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': VITAMIN_USER_AGENT },
      signal: AbortSignal.timeout(TOOLS_BINARY_DOWNLOAD_TIMEOUT),
    })

    if (!response.ok || !response.body) {
      throw new Error(`Failed to download: ${response.status}`)
    }

    const fileStream = createWriteStream(archivePath)
    await pipeline(Readable.fromWeb(response.body), fileStream)

    mkdirSync(binaryDir, { recursive: true })
    mkdirSync(extractDir, { recursive: true })

    if (url.endsWith('.tar.gz')) {
      const result = spawnSync('tar', ['xzf', archivePath, '-C', extractDir], { stdio: 'pipe' })

      if (result.error || result.status !== 0) {
        const errMsg = result.error?.message ?? result.stderr?.toString().trim() ?? 'unknown error'
        throw new Error(`Failed to extract ${url}: ${errMsg}`)
      }
    } else {
      throw new Error(`Unsupported archive format: ${url}`)
    }

    const found = findBinaryRecursively(extractDir, filename)
    if (!found) {
      throw new Error(`Binary ${filename} not found in archive`)
    }

    copyFileSync(found, binaryPath)

    if (platform !== 'win32') {
      chmodSync(binaryPath, 0o755)
    }
  } catch (error) {
    logger.warn(error)
  } finally {
    rmSync(archivePath, { force: true }),
    rmSync(extractDir, { recursive: true, force: true })
  }
}

function findBinaryRecursively(
  rootDir: string, 
  binaryFileName: string
) {
  const stack: string[] = [rootDir]

  while (stack.length > 0) {
    const currentDir = stack.pop() as string

    let entries: string[]
    try {
      entries = readdirSync(currentDir, { encoding: 'utf-8' })
    } catch {
      continue
    }

    for (const name of entries) {
      const fullPath = join(currentDir, name)

      try {
        const st = statSync(fullPath)
        if (st.isDirectory()) {
          stack.push(fullPath)
        } else if (st.isFile() && name === binaryFileName) {
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
  public abstract version: string

  // toolName + version
  protected get cacheDir(): string {
    return `${this.name}-${this.version}`
  }

  protected projectRoot: string
  private downloadTask: Promise<void> | null = null

  constructor(projectRoot: string) {
    this.projectRoot = projectRoot
  }

  protected abstract resolveUrl(): string | undefined

  async ensure(): Promise<string> {
    const existing = await tryResolveExecutablePath(this.name, this.cacheDir)
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

    const resolved = await tryResolveExecutablePath(this.name, this.cacheDir)
    if (!resolved) {
      throw new Error(`${this.name}: download completed but binary not found`)
    }

    return resolved
  }

  protected async download(): Promise<void> {
    const url = this.resolveUrl()
    invariant(url, `No download URL for ${this.name}`)
    await tryDownloadAndExtract(this.name, this.cacheDir, url)
  }

  async execute(
    args: string[], 
    options?: SpawnOptionsWithoutStdio
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
  public version: string

  protected executeHandler: ConfiguredBinaryExecute

  constructor(
    name: string, 
    version: string,
    execute: ConfiguredBinaryExecute
  ) {
    this.name = name
    this.version = version
    this.executeHandler = execute
  }

  async execute(
    args: string[], 
    options?: BinaryToolExecutionOptions
  ): Promise<BinaryToolExecutionResult> {
    return this.executeHandler(args, options)
  }
}