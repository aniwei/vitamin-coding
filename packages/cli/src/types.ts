// 运行模式
export type RunMode = 'print' | 'json' | 'rpc' | 'interactive'

// CLI 解析结果
export interface CLIOptions {
  prompt?: string
  model?: string
  mode: RunMode
  configPath?: string
  projectDir: string
  verbose: boolean
  maxTokens?: number
  continueSession?: string
  inspect?: number | true
}
