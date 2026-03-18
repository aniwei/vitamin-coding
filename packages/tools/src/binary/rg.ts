import { Binary } from './binary-instance'
import { type ToolBinary } from '../types'

export class Rg extends Binary {
  name = 'ripgrep'
  repository = 'BurntSushi/ripgrep'

  getAssetName(version: string, platform: string, architecture: string): string | null {
    
  }
}

export const createRgBinary = (): ToolBinary => {
  return new Rg()
}