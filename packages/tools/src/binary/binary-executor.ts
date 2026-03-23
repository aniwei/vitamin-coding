import os from 'node:os'
import invariant from '@vitamin/invariant'
import { createWriteStream } from 'node:fs'
import { resolve } from 'node:path'
import { Readable } from 'stream'
import { finished } from 'stream/promises'
import { spawn } from 'node:child_process'
import { 
  mkdirp,
  getThirdPartyToolPath,
  getThirdPartyToolBinaryPath,
  exists,
} from '@vitamin/shared'
import { TOOLS_BINARY_DOWNLOAD_TIMEOUT } from '@vitamin/env'


export interface BinaryToolExecutionOptions {
  cwd?: string
  env?: NodeJS.ProcessEnv
  timeout?: number
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

export abstract class BinaryToolExecutor implements BinaryTool {
  public abstract name: string
  public abstract repository: string

  protected projectRoot: string
  private downloadTask: Promise<void> | null = null

  constructor(projectRoot: string) {
    this.projectRoot = projectRoot
  }

  protected abstract getAsset(
    version: string, 
    platform: string, 
    arch: string
  ): string | null

  protected async getLatestVersion(): Promise<string> {
    const response = await fetch(`https://api.github.com/repos/${this.repository}/releases/latest`, {
      headers: { 
        'User-Agent': `vitamin-agent` 
      },
      signal: AbortSignal.timeout(TOOLS_BINARY_DOWNLOAD_TIMEOUT),
    })
    
    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status}`)
    }
  
    const data = (await response.json()) as { tag_name: string }
    return data.tag_name.replace(/^v/, "")
  }

  protected getDownloadUrl(
    version: string, 
    platform: string, 
    arch: string
  ): string | null {
    return `https://github.com/${this.repository}/releases/download/${version}/${this.getAsset(version, platform, arch)}`
  }

  protected async tryExecute(toolPath: string): Promise<boolean> {
    try {
      const ps = spawn(toolPath, ['--version'], { stdio: 'pipe' }) 
      return new Promise((resolve) => {
        ps.on('error', () => resolve(false))
        ps.on('close', code => resolve(code === 0))
      })
    } catch {
      return false
    }
  }

  protected async resolvePath(): Promise<string | null> {
    let toolPath = getThirdPartyToolBinaryPath(this.name)

    if (os.platform() === 'win32') {
      toolPath += '.exe'
    }

    if (await exists(toolPath)) {
      return toolPath
    }

    if (await this.tryExecute(this.name)) {
      return this.name
    }

    return null
  } 

  protected async extract(_dir: string, _options: { dir: string }): Promise<void> {

  }

  protected async download(): Promise<void> {
    const platform = os.platform()
    const arch = os.arch()

    const version = await this.getLatestVersion()
    const asset = this.getAsset(version, platform, arch)
    if (!asset) {
      throw new Error(`Unsupported platform/architecture: ${platform}/${arch}`)
    }

    const dest = resolve(getThirdPartyToolPath())
    await mkdirp(dest)

    const url = this.getDownloadUrl(version, platform, arch)
    if (!url) {
      throw new Error(`No download URL for platform/architecture: ${platform}/${arch}`)
    }

    const extractDir = resolve(getThirdPartyToolPath())
    const response = await fetch(url, {
      headers: { 
        'User-Agent': `vitamin-agent` 
      },
      signal: AbortSignal.timeout(TOOLS_BINARY_DOWNLOAD_TIMEOUT),
    })

    if (!response.ok || !response.body) {
      throw new Error(`Failed to download binary: ${response.status}`)
    }

    const fileStream = createWriteStream(dest)
    await finished(Readable.fromWeb(response.body as any).pipe(fileStream))

    await this.extract(dest, { dir: extractDir })
  }

  async execute(
    args: string[], 
    options?: BinaryToolExecutionOptions
  ): Promise<BinaryToolExecutionResult> {
    return new Promise(async (resolve, reject) => {
      const executablePath = await this.resolvePath()
      if (!executablePath) {
        if (!this.downloadTask) {
          this.downloadTask = this.download()
        }

        await this.downloadTask
      }

      invariant(executablePath, 'Executable path should be available after download')
      const ps = spawn(executablePath, args, {
        cwd: options?.cwd,
        env: options?.env,
        timeout: options?.timeout,
      })
  
      
      let stdout: Buffer[] = []
      let stderr: Buffer[] = []
      
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