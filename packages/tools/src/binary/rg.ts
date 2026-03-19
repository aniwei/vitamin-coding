import { BinaryToolExecutor, type BinaryTool } from './binary-executor'

export class RipgrepExecutor extends BinaryToolExecutor {
  public readonly name = 'ripgrep'
  public readonly repository = 'BurntSushi/ripgrep'

  constructor(projectRoot: string) {
    super(projectRoot)
  }

  getAsset(
    version: string, 
    platform: string, 
    arch: string
  ): string | null {
    if (platform === 'darwin') {
      const str = arch === 'arm64' ? 'aarch64' : 'x86_64'
      return `ripgrep-v${version}-${str}-apple-darwin.tar.gz`
    } else if (platform === 'linux') {
      const str = arch === 'arm64' ? 'aarch64' : 'x86_64'
      return `ripgrep-v${version}-${str}-unknown-linux-gnu.tar.gz`
    } else if (platform === 'win32') {
      const str = arch === 'arm64' ? 'aarch64' : 'x86_64'
      return `ripgrep-v${version}-${str}-pc-windows-msvc.zip`
    }
    return null
  }
}

export const createRipgrepExecutor = (projectRoot: string): BinaryTool => {
  return new RipgrepExecutor(projectRoot)
}