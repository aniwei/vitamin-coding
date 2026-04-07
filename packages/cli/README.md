# @vitamin/cli

## 模块定位

Vitamin 命令行入口，解析参数并分发到 Print / JSON / Interactive / RPC 运行模式。

## 使用方式

```bash
# Print 模式（单次执行）
vitamin "fix the bug" -p

# Interactive 模式（REPL）
vitamin -i

# JSON 模式
vitamin "summarize this file" --json

# 指定模型
vitamin "explain this" -m claude-sonnet-4

# 启用调试
vitamin -i --inspect

# 子命令
vitamin doctor    # 环境诊断
vitamin config    # 配置管理
vitamin auth      # 认证管理
```

## 参数

| 参数 | 说明 |
|------|------|
| `-p` / `--print` | Print 模式 |
| `-i` / `--interactive` | Interactive 模式 |
| `--json` | JSON 模式 |
| `--rpc` | RPC 模式 |
| `-m` / `--model` | 指定模型 |
| `-c` / `--config` | 配置文件路径 |
| `-d` / `--dir` | 工作目录 |
| `-v` / `--verbose` | 详细日志 |
| `--max-tokens` | 最大 token |
| `--continue` | 继续上次会话 |
| `--inspect` | 启用调试 |

## 目录概览

```
bin/
  vitamin           # 二进制入口
src/
  types.ts          # 核心类型
  parse-cli.ts      # 参数解析
  run-cli.ts        # 主执行入口
  commands/         # 子命令
  index.ts
tests/              # 3 个测试文件
```

## 开发命令

```bash
pnpm --filter @vitamin/cli build
pnpm --filter @vitamin/cli typecheck
pnpm --filter @vitamin/cli clean
```

## 关联包

`@vitamin/coding`、`@vitamin/shared`、`@vitamin/env`
