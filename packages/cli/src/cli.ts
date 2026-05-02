import { cp, mkdir, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { join, relative, resolve } from 'node:path'
import { createInterface } from 'node:readline'

import { createXMars, InteractiveMode, runJsonMode, runPrintMode } from '@x-mars/coding'

import type { CLIOptions, RunMode } from './types'
import {
  createFilePluginStateStore,
  importClaudeCodePlugin,
  type PluginLifecycleStep,
  type PluginManagerDiagnostics,
  type PluginStateStore,
} from '@x-mars/tools'

const require = createRequire(import.meta.url)

// 子命令集合
export type SubCommand = 'run' | 'doctor' | 'config' | 'auth' | 'plugin' | null

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
  let mode: RunMode = 'interactive'
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
    firstArg === 'auth' ||
    firstArg === 'plugin'
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
      case '--print':
      case '-p':
        mode = 'print'
        break
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
x-mars - AI 助理命令行工具

用法:
  x-mars [提示词]              使用提示词启动（print 模式）
  x-mars                       进入交互式 TUI 模式
  x-mars --json "query"        JSON 输出模式

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
  x-mars run <prompt>      执行一次性任务
  x-mars doctor            检查环境健康状态
  x-mars auth [copilot]    认证管理（GitHub Copilot OAuth）
  x-mars install           交互式初始化
  x-mars config            管理配置
`)
}

function printVersion(): void {
  const pkg = require('../package.json') as { version?: string }
  const version = pkg.version ?? '0.0.0'
  process.stdout.write(`x-mars ${version}\n`)
}

export async function runCli(): Promise<number> {
  const { options, subCommand, subCommandArgs } = parseCLI(process.argv)

  if (subCommand === 'doctor') {
    // TODO: implement doctor
    return 0
  }

  if (subCommand === 'auth') {
    // TODO: implement auth
    return 0
  }

  if (subCommand === 'config') {
    // TODO: implement config
    return 0
  }

  if (!options.prompt && options.mode !== 'interactive' && options.mode !== 'rpc') {
    printHelp()
    return 1
  }

  const pluginStateStore = createFilePluginStateStore({ workspaceDir: options.projectDir })

  // 创建并启动 XMarsApp
  const app = createXMars({
    port: typeof options.inspect === 'number' ? options.inspect : 9229,
    inspect: options.inspect !== undefined,
    logger: {
      name: 'x-mars-cli',
      level: options.verbose ? 'debug' : 'info',
      destination: 'stderr',
    },
    workspaceDir: options.projectDir,
    projectConfigPath: options.configPath,
    modelId: options.model,
    pluginRoots: [resolve(options.projectDir, '.x-mars/plugins')],
    pluginStateStore,
  })

  await app.start()

  try {
    if (subCommand === 'plugin') {
      return await runPluginCommand(app, subCommandArgs, pluginStateStore)
    }

    switch (options.mode) {
      case 'print': {
        if (options.prompt) {
          const session = await app.createSession()
          await runPrintMode(session, options.prompt)
        }
        break
      }
      case 'json': {
        if (options.prompt) {
          const session = await app.createSession()
          const result = await runJsonMode(session, options.prompt)
          process.stdout.write(JSON.stringify(result, null, 2) + '\n')
        }
        break
      }
      case 'interactive': {
        const session = await app.createSession()
        const interactive = new InteractiveMode(session, {
          pluginAgentRegistry: app.pluginAgentRegistry,
          pluginCommandRegistry: app.pluginCommandRegistry,
          permissionRegistry: app.permissionRegistry,
          auditLog: app.auditLog,
          requirePluginConfirmation: true,
        })
        const rl = createInterface({ input: process.stdin, output: process.stdout })
        const prompt = () => rl.question('x-mars> ', async (input) => {
          const result = await interactive.handleInput(input)
          if (result.type === 'exit') {
            rl.close()
            return
          }
          if (result.type === 'response' || result.type === 'system') {
            process.stdout.write(result.text + '\n')
          }
          prompt()
        })
        await new Promise<void>((resolve) => {
          rl.on('close', resolve)
          prompt()
        })
        break
      }
      case 'rpc': {
        await app.createSession()
        // TODO: implement RPC mode (stdin/stdout JSON-RPC)
        break
      }
    }

    return 0
  } finally {
    await app.stop()
  }
}

export async function runPluginCommand(
  app: ReturnType<typeof createXMars>,
  argsText: string,
  stateStore?: PluginStateStore,
): Promise<number> {
  const args = argsText.trim().split(/\s+/).filter(Boolean)
  const [command = 'list', pluginId] = args
  const manager = app.pluginManager
  if (!manager) {
    process.stdout.write('Plugin manager is not configured.\n')
    return 1
  }

  if (command === 'list') {
    const diagnostics = manager.getDiagnostics()
    process.stdout.write(formatPluginDiagnostics(diagnostics))
    return 0
  }

  if (command === 'enable' && pluginId) {
    await stateStore?.enable(pluginId)
    manager.enable(pluginId)
    await manager.reloadAll()
    process.stdout.write(`Plugin enabled: ${pluginId}\n`)
    return 0
  }

  if (command === 'disable' && pluginId) {
    await stateStore?.disable(pluginId)
    await manager.disable(pluginId)
    process.stdout.write(`Plugin disabled: ${pluginId}\n`)
    return 0
  }

  if (command === 'trust' && pluginId) {
    await stateStore?.trust(pluginId)
    manager.trust(pluginId)
    await manager.reloadAll()
    process.stdout.write(`Plugin trusted: ${pluginId}\n`)
    return 0
  }

  if (command === 'untrust' && pluginId) {
    await stateStore?.untrust(pluginId)
    await manager.untrust(pluginId)
    process.stdout.write(`Plugin untrusted: ${pluginId}\n`)
    return 0
  }

  if (command === 'reload') {
    await manager.reloadAll()
    process.stdout.write('Plugins reloaded.\n')
    return 0
  }

  if ((command === 'import-claude-code' || command === 'import-claude') && pluginId) {
    return await importClaudeCodePluginCommand(app, pluginId, args.includes('--force'))
  }

  process.stdout.write(
    'Usage: x-mars plugin [list|enable <id>|disable <id>|trust <id>|untrust <id>|reload|import-claude-code <dir> [--force]]\n',
  )
  return 1
}

async function importClaudeCodePluginCommand(
  app: ReturnType<typeof createXMars>,
  sourceDir: string,
  force: boolean,
): Promise<number> {
  const manager = app.pluginManager
  if (!manager) {
    process.stdout.write('Plugin manager is not configured.\n')
    return 1
  }

  const imported = await importClaudeCodePlugin(resolve(sourceDir))
  const roots = manager.getDiagnostics().roots
  const pluginRoot = roots[0] ?? join(app.workspaceDir, '.x-mars/plugins')
  const targetDir = join(pluginRoot, toPluginDirectoryName(imported.manifest.id))

  if (isPathInside(resolve(sourceDir), targetDir)) {
    process.stdout.write('Cannot import a plugin into a directory inside its source tree.\n')
    return 1
  }

  await mkdir(pluginRoot, { recursive: true })
  if (force) {
    await rm(targetDir, { recursive: true, force: true })
  }

  try {
    await cp(resolve(sourceDir), targetDir, {
      recursive: true,
      errorOnExist: true,
      force: false,
    })
  } catch (error) {
    if (isNodeError(error) && (error.code === 'ERR_FS_CP_EEXIST' || error.code === 'EEXIST')) {
      process.stdout.write(`Plugin target already exists: ${targetDir}\n`)
      process.stdout.write('Use --force to overwrite it.\n')
      return 1
    }
    throw error
  }

  await writeFile(join(targetDir, 'plugin.json'), JSON.stringify(imported.manifest, null, 2) + '\n')
  await manager.reloadAll()

  process.stdout.write(`Claude Code plugin imported: ${imported.manifest.id}\n`)
  process.stdout.write(`Target: ${targetDir}\n`)
  process.stdout.write(formatClaudeCodeImportReport(imported.report))
  return 0
}

function formatClaudeCodeImportReport(
  report: Awaited<ReturnType<typeof importClaudeCodePlugin>>['report'],
): string {
  const lines = [
    `skills\t${report.imported.skills.length}`,
    `commands\t${report.imported.commands.length}`,
    `agents\t${report.imported.agents.length}`,
    `mcpServers\t${report.imported.mcpServers.length}`,
  ]
  for (const warning of report.warnings) {
    lines.push(`warning\t${warning}`)
  }
  for (const item of report.unsupported) {
    lines.push(`unsupported\t${item.component}\t${item.reason}`)
  }
  return `${lines.join('\n')}\n`
}

export function formatPluginDiagnostics(diagnostics: PluginManagerDiagnostics): string {
  if (diagnostics.discovered.length === 0) {
    return 'No plugins discovered.\n'
  }

  const loaded = new Set(diagnostics.loaded.map((plugin) => plugin.pluginId))
  const results = new Map(diagnostics.results.map((result) => [result.pluginId, result]))
  const trusted = new Set(diagnostics.state.trustedPluginIds)
  const disabled = new Set(diagnostics.state.disabledPluginIds)
  const lines: string[] = []

  for (const item of diagnostics.discovered) {
    const manifest = item.manifest
    if (!manifest) {
      lines.push(`invalid\t${item.validation.errors.join('; ')}\t${item.path}`)
      continue
    }

    const result = results.get(manifest.id)
    const state = disabled.has(manifest.id)
      ? 'disabled'
      : loaded.has(manifest.id)
        ? 'loaded'
        : (manifest.status ?? 'enabled')
    const trust = trusted.has(manifest.id) ? 'trusted' : 'untrusted'
    lines.push(`${manifest.id}\t${state}\t${trust}\t${item.path}`)

    if (result) {
      for (const step of result.steps) {
        lines.push(`  ${formatPluginLifecycleStep(step)}`)
      }
      for (const error of result.errors) {
        lines.push(`  error\t${error}`)
      }
      for (const warning of result.warnings) {
        lines.push(`  warning\t${warning}`)
      }
    }
  }

  return `${lines.join('\n')}\n`
}

function formatPluginLifecycleStep(step: PluginLifecycleStep): string {
  const detail = step.error ?? step.warning
  return detail
    ? `${step.type}:${step.name}\t${step.status}\t${detail}`
    : `${step.type}:${step.name}\t${step.status}`
}

function toPluginDirectoryName(pluginId: string): string {
  return pluginId.replace(/[^a-zA-Z0-9._-]/g, '-')
}

function isPathInside(parent: string, child: string): boolean {
  const rel = relative(parent, child)
  return rel === '' || (!rel.startsWith('..') && !rel.startsWith('/'))
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error
}
