# X-Mars Coding

基于 Anthropic API 构建的 AI 编程助手代理系统，可作为 CLI 在终端运行，也可通过 WebSocket/HTTP 提供 Web 界面服务。

## 架构概览

```
x-mars-coding/
├── packages/
│   ├── agent/        # 核心代理运行时（多模式执行引擎）
│   ├── ai/           # Anthropic API 客户端与流式抽象
│   ├── cli/          # CLI 入口点（命令：x-mars）
│   ├── coding/       # 文件系统与项目感知工具
│   ├── devtools/     # 代理状态的 HTTP 检查服务器
│   ├── invariant/    # 断言工具
│   ├── mcp/          # MCP（模型上下文协议）服务器适配器
│   ├── service/      # HTTP + WebSocket 服务（供 web-ui 使用）
│   ├── setting/      # 配置加载与 Schema
│   ├── shared/       # 共享类型、Schema、事件总线、日志
│   ├── skill/        # Skill/工具插件加载器
│   ├── swarm/        # 多代理集群编排
│   ├── tools/        # 文件、Shell、搜索工具实现
│   ├── assistant-ui/ # React 前端（占位/设计参考）
│   └── web-ui/       # Web 聊天界面（React + Vite + Tailwind v4）
```

### 包依赖关系

```
cli ──► agent ──► ai (Anthropic)
          │
          ├──► tools    (文件、Shell、搜索)
          ├──► coding   (项目上下文、工作区)
          ├──► skill    (可加载技能插件)
          ├──► setting  (配置：API Key、模型等)
          └──► devtools (检查 HTTP 服务器)

service ──► agent    (将代理封装为 HTTP/WS 供 web-ui 使用)
web-ui  ──► service  (React SPA 通过 WebSocket 连接)
```

### 代理运行模式

通过 `setting` 配置，代理支持四种执行模式：

| 模式          | 说明                                                 |
| ------------- | ---------------------------------------------------- |
| `interactive` | REPL 循环 — 从 stdin 读取用户输入，流式输出到 stdout |
| `print`       | 单次运行 — 执行一个任务后退出，流式输出到 stdout     |
| `json`        | 单次运行 — 将结构化 JSON 事件输出到 stdout           |
| `rpc`         | 服务器模式 — 通过 stdin/stdout 暴露 JSON-RPC 接口    |

`web-ui` 通过 `service` 与代理通信，`service` 将 `rpc` 模式封装为 WebSocket。

## 环境要求

- **Node.js** >= 22.0.0
- **pnpm** >= 9.15.4

## 安装

```bash
# 安装所有依赖
pnpm install

# 按依赖顺序构建所有包（通过 Nx）
pnpm build
```

## 配置

代理从 `~/.config/x-mars/config.json`（或 `$X_MARS_CONFIG_PATH`）读取配置：

```json
{
  "apiKey": "sk-ant-...",
  "model": "claude-opus-4-5-20251001",
  "maxTokens": 8192
}
```

也可以在环境变量中设置 `ANTHROPIC_API_KEY`。

## 开发命令

```bash
# 构建所有包
pnpm build

# 构建单个包（Nx 语法）
npx nx build @x-mars/agent

# 仅构建受影响的包（git 变更后）
npx nx run-many -t build --affected

# 类型检查所有包
pnpm typecheck

# 代码检查（oxlint）+ 格式检查（oxfmt）
pnpm lint

# 自动修复 lint 问题并重新格式化代码
pnpm lint:fix

# 仅格式化代码
pnpm format

# 运行测试
pnpm test

# 以监视模式运行测试
pnpm test:watch

# 运行测试并生成覆盖率报告
pnpm test:coverage

# 清除所有构建产物
pnpm clean
```

## 运行 CLI

构建完成后：

```bash
# 以交互模式运行
node packages/cli/dist/index.js

# 或全局链接（若已发布）
npm install -g @x-mars/cli
x-mars
```

## 运行 Web UI

Web 界面需要同时启动 `@x-mars/service`（后端）和 `web-ui`（前端）。

```bash
# 启动服务（默认端口 3000）
npx nx dev @x-mars/service

# 另开终端，启动 Web UI 开发服务器
npx nx dev @x-mars/web-ui
```

然后在浏览器中打开 http://localhost:5173。

## 包说明

| 包                  | 说明                                               |
| ------------------- | -------------------------------------------------- |
| `@x-mars/agent`     | 核心执行引擎：工具循环、流式处理、会话管理         |
| `@x-mars/ai`        | Anthropic API 的轻量封装，支持 SSE 解析            |
| `@x-mars/cli`       | 二进制入口点 — 解析参数并启动代理                  |
| `@x-mars/coding`    | 工作区检测、文件树、语言感知工具                   |
| `@x-mars/devtools`  | 暴露代理状态的 Hono HTTP 调试服务器                |
| `@x-mars/invariant` | 带描述性错误信息的类型化断言工具                   |
| `@x-mars/mcp`       | MCP 协议服务器 — 向 MCP 兼容客户端暴露工具         |
| `@x-mars/service`   | Hono + WebSocket 服务器，桥接 HTTP 客户端与代理    |
| `@x-mars/setting`   | 配置 Schema（Zod）、加载、校验与默认值             |
| `@x-mars/shared`    | 事件类型、日志（pino）、Markdown 解析、共享 Schema |
| `@x-mars/skill`     | 加载 YAML/JSON 技能定义并注入为工具                |
| `@x-mars/swarm`     | 生成并协调多个代理实例                             |
| `@x-mars/tools`     | 实现：读写文件、bash、搜索、网页抓取               |
| `web-ui`            | React 19 + Vite 8 + Tailwind CSS v4 聊天界面       |

## 工具链

| 工具           | 用途                                               |
| -------------- | -------------------------------------------------- |
| **Nx**         | Monorepo 任务编排 — 按依赖顺序构建，缓存结果       |
| **tsup**       | 库打包器（ESM 输出，`.d.ts` 生成）                 |
| **Vite**       | `web-ui` 的前端打包器                              |
| **oxlint**     | 基于 Rust 的高速 Linter（替代 Biome linter）       |
| **oxfmt**      | 基于 Rust 的高速格式化工具（替代 Biome formatter） |
| **vitest**     | 单元测试运行器                                     |
| **TypeScript** | 全包严格模式                                       |

## 贡献指南

1. Fork 仓库并创建功能分支
2. 进行修改；提交前运行 `pnpm lint && pnpm typecheck && pnpm test`
3. 提交 Pull Request

所有包均为 ESM-only（`"type": "module"`），TypeScript 目标为 ES2024。
