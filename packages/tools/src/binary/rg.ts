import { BinaryToolExecutor, type BinaryTool } from './binary-executor'

export class RgExecutor extends BinaryToolExecutor {
  protected readonly name = 'ripgrep'
  protected readonly repository = 'BurntSushi/ripgrep'

  getAsset(version: string, platform: string, architecture: string): string | null {
    
  }
}

export const createRgExecutor = (): BinaryTool => {
  return new RgExecutor()
}