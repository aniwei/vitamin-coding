import os from 'node:os'
import invariant from '@vitamin/invariant'
import { spawn } from 'node:child_process'
import { createLogger, mkdirp } from '@vitamin/shared'
import { TOOLS_BINARY_DOWNLOAD_TIMEOUT } from '@vitamin/env'
import { 
  type ToolBinary, 
  type ToolBinaryExecutionOptions, 
  type ToolBinaryExecutionResult 
} from '../types'

const logger = createLogger('@vitamin/tools:binary-instance')

export abstract class ToolBinaryInstance implements ToolBinary {
  abstract name: string
  abstract repository: string

  private downloadTask: Promise<void> | null = null

  protected abstract getAssetName(version: string, platform: string, architecture: string): string | null

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

  protected getDownloadUrl(version: string, platform: string, architecture: string): string | null {
    return `https://github.com/${this.repository}/releases/download/${version}/${this.getAssetName(version, platform, architecture)}`
  }

  protected getExecutablePath(
  ): string | null {
    
  } 

  protected async download(): Promise<void> {
    const platform = os.platform()
    const arch = os.arch()

    const version = await this.getLatestVersion()
    const asset = this.getAssetName(version, platform, arch)
    if (!asset) {
      throw new Error(`Unsupported platform/architecture: ${platform}/${arch}`)
    }

    const dest = `/${asset}`
    await mkdirp(dest)

    const url = this.getDownloadUrl(version, platform, arch)
    if (!url) {
      throw new Error(`No download URL for platform/architecture: ${platform}/${arch}`)
    }

    

  }

  async execute(
    args: string[], 
    options?: ToolBinaryExecutionOptions
  ): Promise<ToolBinaryExecutionResult> {
    return new Promise(async (resolve, reject) => {
      const executablePath = this.getExecutablePath()
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
  
      ps.on('error', (err) => {
        logger.error(`Failed to execute ${this.name}:`, err)
        reject(err)
      })
  
      let stdout: Buffer[] = []
      let stderr: Buffer[] = []
  
      ps.stdout.on('data', (data) => stdout.push(data))
      ps.stderr.on('data', (data) => stderr.push(data))
      ps.on('close', (code) => {
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

export class ConfiguredBinaryInstance implements ToolBinary {
  public name: string
  public repository: string

  constructor(name: string, repository: string) {
    this.name = name
    this.repository = repository
  }

  
}