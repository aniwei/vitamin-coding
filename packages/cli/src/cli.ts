import { createRequire } from 'node:module'
import { resolve } from 'node:path'

import type { CLIOptions, RunMode } from './types'

const require = createRequire(import.meta.url)

// 子命令集合
export type SubCommand = 'run' | 'doctor' | 'config' | 'auth' | null

// CLI 解析结果（含子命令）
export interface ParsedCLI {
  options: CLIOptions
  subCommand: SubCommand
  subCommandArgs: string
}

// 完整解析（含子命令识别）
export function parseCLI(argv: string[]): ParsedCLI {
  const args = argv.slice(2) // 跳过 node 和脚本路径

  let prompt: string | undefined
  let model: string | undefined
  let mode: RunMode = 'print'
  let configPath: string | undefined
  let projectDir = process.cwd()
  let verbose = false
  let maxTokens: number | undefined
  let continueSession: string | undefined
  let inspect: number | true | undefined
  let subCommand: SubCommand = null
  let subCommandArgs = ''

  // 检查第一个非 flag 参数是否为子命令
  const firstArg = args[0]
  if (
    firstArg === 'run' ||
    firstArg === 'doctor' ||
    firstArg === 'config' ||
    firstArg === 'auth'
  ) {
    subCommand = firstArg
    subCommandArgs = args.slice(1).join(' ')

    // doctor / config / auth 不需要 prompt
    if (subCommand === 'run') {
      prompt = args.slice(1).filter(a => !a.startsWith('-')).join(' ')
      mode = 'print'
    }
  }

  let i = subCommand ? 1 : 0
  while (i < args.length) {
    const arg = args[i]

    switch (arg) {
      case '--interactive':
      case '-i':
        mode = 'interactive'
        break
      case '--json':
        mode = 'json'
        break
      case '--rpc':
        mode = 'rpc'
        break
      case '--model':
      case '-m':
        i++
        model = args[i]
        break
      case '--config':
      case '-c':
        i++
        configPath = args[i]
        break
      case '--project':
      case '-d':
        i++
        projectDir = resolve(args[i] ?? process.cwd())
        break
      case '--verbose':
      case '-v':
        verbose = true
        break
      case '--max-tokens':
        i++
        maxTokens = Number(args[i])
        break
      case '--continue':
        i++
        continueSession = args[i]
        break
      case '--inspect': {
        break
      }
      case '--help':
      case '-h':
        printHelp()
        process.exit(0)
        break
      case '--version':
        printVersion()
        process.exit(0)
        break
      default:
        if (arg && !arg.startsWith('-') && !subCommand) {
          if (prompt === undefined && mode === 'interactive') {
            mode = 'print'
          }

          prompt = prompt !== undefined ? prompt + ' ' + arg : arg
        }
        break
    }
    
    i++
  }

  return {
    options: {
      prompt,
      model,
      mode,
      configPath,
      projectDir,
      verbose,
      maxTokens,
      continueSession,
      inspect,
    },
    subCommand,
    subCommandArgs,
  }
}

function printHelp(): void {
  process.stdout.write(`
vitamin - AI 助理命令行工具

用法:
  vitamin [提示词]              使用提示词启动（print 模式）
  vitamin                       进入交互式 TUI 模式
  vitamin --json "query"        JSON 输出模式

选项:
  -i, --interactive         Interactive 模式（默认）
  -p, --print               Print 模式（非交互）
  --json                    JSON 输出模式
  --rpc                     RPC 服务模式（供 SDK 使用）
  -m, --model <id>          指定模型
  -c, --config <path>       配置文件路径
  -d, --project <dir>       项目目录
  -v, --verbose             输出详细日志
  --max-tokens <n>          最大输出 token 数
  --continue <id>           继续已有会话
  --inspect[=port]          启用 Node.js inspector（默认: 9229）
  -h, --help                显示帮助
  --version                 显示版本

命令:
  vitamin run <prompt>      执行一次性任务
  vitamin doctor            检查环境健康状态
  vitamin auth [copilot]    认证管理（GitHub Copilot OAuth）
  vitamin install           交互式初始化
  vitamin config            管理配置
`)
}

function printVersion(): void {
  const pkg = require('../package.json') as { version?: string }
  const version = pkg.version ?? '0.0.0'
  process.stdout.write(`vitamin ${version}\n`)
}
