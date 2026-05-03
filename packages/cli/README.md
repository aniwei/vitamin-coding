# @x-mars/cli

## 模块定位

X-Mars 命令行入口，解析参数并分发到 Print / JSON / Interactive / RPC 运行模式。

## 使用方式

```bash
# Print 模式（单次执行）
x-mars "fix the bug" -p

# Interactive 模式（REPL）
x-mars -i

# JSON 模式
x-mars "summarize this file" --json

# 指定模型
x-mars "explain this" -m claude-sonnet-4

# 启用调试
x-mars -i --inspect

# 子命令
x-mars doctor    # 环境诊断
x-mars config    # 配置管理
x-mars auth      # 认证管理
```

## 参数

| 参数                   | 说明             |
| ---------------------- | ---------------- |
| `-p` / `--print`       | Print 模式       |
| `-i` / `--interactive` | Interactive 模式 |
| `--json`               | JSON 模式        |
| `--rpc`                | RPC 模式         |
| `-m` / `--model`       | 指定模型         |
| `-c` / `--config`      | 配置文件路径     |
| `-d` / `--dir`         | 工作目录         |
| `-v` / `--verbose`     | 详细日志         |
| `--max-tokens`         | 最大 token       |
| `--continue`           | 继续上次会话     |
| `--inspect`            | 启用调试         |

## 目录概览

```
bin/
  x-mars           # 二进制入口
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
pnpm --filter @x-mars/cli build
pnpm --filter @x-mars/cli typecheck
pnpm --filter @x-mars/cli clean
```

## 关联包

`@x-mars/coding`、`@x-mars/shared`、`@x-mars/env`
