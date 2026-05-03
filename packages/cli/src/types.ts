// 运行模式
export type RunMode = 'print' | 'json' | 'json-stream' | 'rpc' | 'interactive'

export interface RepositoryWorkflowOptions {
  commit?: boolean
  pr?: boolean
  base?: string
  draft?: boolean
}

// CLI 解析结果
export interface CLIOptions {
  prompt?: string
  model?: string
  mode: RunMode
  configPath?: string
  projectDir: string
  verbose: boolean
  ci?: boolean
  workflow?: RepositoryWorkflowOptions
  maxTokens?: number
  continueSession?: string
  inspect?: number | true
}
