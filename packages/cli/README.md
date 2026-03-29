# @vitamin/cli

Vitamin 命令行入口，基于 `@vitamin/coding` 的 `VitaminApp` 运行。

当前源码里，默认用户主路径已经对齐到 lead：`vitamin [prompt]`、`vitamin --json [prompt]`、`vitamin --interactive` 最终都会调用 `app.lead()`。只有 `--rpc` 仍保留 `app.createSession()` 的 session 级占位路径。

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
- `vitamin [prompt]`：默认 print 模式，内部走 `app.lead(prompt)`
- `vitamin --json [prompt]`：输出 `LeadResult` JSON
- `vitamin --interactive`：进入 lead-driven 交互模式
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

- 这份 README 只描述 [src/cli.ts](src/cli.ts) 和 [src/lead-modes.ts](src/lead-modes.ts) 当前能直接验证的行为。
- 当前 README 不把 planning、review、clarify、recovery 写成 CLI 默认闭环能力。
