# @vitamin/cli

Vitamin 命令行入口，基于 `@vitamin/coding` 的 `VitaminApp` 运行。

当前源码里，CLI 已经回到纯 session runtime：`vitamin [prompt]`、`vitamin --json [prompt]`、`vitamin --interactive` 都会先创建一个 `AgentSession`，然后调用 session 级运行模式辅助函数。`--rpc` 仍然只是创建会话后的占位入口。

## Installation

```bash
pnpm add @vitamin/cli
```

## Usage

```bash
vitamin
vitamin "explain this repo"
vitamin --json "review the current changes"
vitamin --interactive
vitamin run "plan the refactor"
vitamin --model github-copilot/gpt-4.1 "plan the refactor"
vitamin --config .vitamin/config.jsonc --project . "summarize the architecture"
```

## Source-Verified Commands

- `vitamin`：无 prompt 时进入交互模式
- `vitamin [prompt]`：默认 print 模式，内部走 `runPrintMode(session, prompt)`
- `vitamin --json [prompt]`：输出 `runJsonMode(session, prompt)` 结果
- `vitamin --interactive`：进入基于单个 `AgentSession` 的交互模式
- `vitamin run <prompt>`：一次性执行任务，等价于 print 模式
- `vitamin doctor`：环境检查占位命令，当前直接返回
- `vitamin auth`：认证管理占位命令，当前直接返回
- `vitamin config`：配置管理占位命令，当前直接返回

## Wired Flags

- `--model`, `-m`：透传到 `VitaminApp.modelId`
- `--config`, `-c`：透传到 `VitaminApp.projectConfigPath`
- `--project`, `-d`：透传到 `VitaminApp.workspaceDir`
- `--verbose`, `-v`：把 CLI logger 提升到 `debug`
- `--inspect`：启用 inspector / devtools 端口
- `--help`, `-h`：打印帮助
- `--version`：打印版本

## Parsed But Not Fully Wired Yet

- `--rpc`：当前只创建 session，JSON-RPC 服务本身仍是 TODO
- `--max-tokens`：CLI 已解析参数，但 `runCli()` 当前未消费
- `--continue`：CLI 已解析参数，但 `runCli()` 当前未消费

## Notes

- 这份 README 只描述 [src/cli.ts](src/cli.ts) 当前能直接验证的行为。
- CLI 当前不再承担 lead / orchestrator 级编排能力；若需要复杂任务调度，需要在更高层自行组合 runtime。
