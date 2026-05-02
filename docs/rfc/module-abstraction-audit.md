# Vitamin 全仓模块抽象审计

> 审计时间：2026-05-02
> 审计范围：`packages/*`
> 目标：统一统计全仓模块规模、依赖方向和重复实现热点，判断哪些能力适合抽象到公共模块。

## 总览

当前仓库共有 22 个 package，约 421 个 TS/TSX 源文件。核心依赖结构已经形成分层：

- 基础层：`@vitamin/env`、`@vitamin/invariant`、`@vitamin/shared`、`@vitamin/persistence`。
- 协议/模型层：`@vitamin/ai`、`@vitamin/agent`、`@vitamin/hooks`、`@vitamin/session`、`@vitamin/setting`。
- 能力层：`@vitamin/tools`、`@vitamin/mcp`、`@vitamin/skill`、`@vitamin/memory`、`@vitamin/prompt`、`@vitamin/orchestrator`、`@vitamin/swarm`。
- 应用层：`@vitamin/coding`、`@vitamin/service`、`@vitamin/cli`、`@vitamin/opendev-ui`。

`@vitamin/shared` 是最稳定的公共模块，被 15 个包依赖；`@vitamin/env` 被 9 个包依赖；`@vitamin/ai` 被 8 个包依赖；`@vitamin/agent` 被 7 个包依赖。`@vitamin/coding` 是明显的组合层，依赖 15 个内部包，不应再向更底层模块反向渗透。

## 模块统计

| Package | TS/TSX 文件数 | 源码行数 | 内部依赖数 | 被内部依赖数 | 判断 |
| --- | ---: | ---: | ---: | ---: | --- |
| `@vitamin/opendev-ui` | 131 | 19141 | 0 | 0 | 前端应用层，存在大量可抽通用 UI/API 辅助 |
| `@vitamin/tools` | 63 | 8233 | 8 | 3 | 能力聚合偏重，适合拆 schema/tool-kit/plugin-kit |
| `@vitamin/memory` | 20 | 4363 | 4 | 2 | 领域能力独立，少量解析/预算模型可公共化 |
| `@vitamin/coding` | 19 | 3778 | 15 | 2 | 应用编排层，不适合再作为公共依赖 |
| `@vitamin/ai` | 17 | 3565 | 2 | 8 | 模型协议公共层，应保持 provider 纯度 |
| `@vitamin/hooks` | 42 | 3447 | 2 | 5 | 横切治理层，可承接 policy/validation 抽象 |
| `@vitamin/service` | 20 | 2694 | 6 | 0 | 服务应用层，协议可抽，路由实现不宜下沉 |
| `@vitamin/agent` | 11 | 2264 | 5 | 7 | 核心 agent runtime，适合作为 tool/session 协议边界 |
| `@vitamin/mcp` | 9 | 2019 | 2 | 1 | MCP 协议能力层，可移出 tools 下重复 MCP 代码 |
| `@vitamin/swarm` | 12 | 1803 | 3 | 0 | 高阶编排层，可复用 orchestrator/agent 基础抽象 |
| `@vitamin/devtools` | 9 | 1337 | 2 | 3 | 调试基础设施，可和 service 共享 WS/debug protocol |
| `@vitamin/shared` | 18 | 1241 | 2 | 15 | 现有公共基础层，适合继续接纳低耦合纯工具 |
| `@vitamin/session` | 10 | 1199 | 2 | 1 | 会话存储模型，应保持独立 |
| `@vitamin/orchestrator` | 7 | 1195 | 5 | 1 | 编排领域层，可与 swarm 进一步收敛边界 |
| `@vitamin/setting` | 11 | 985 | 4 | 6 | 配置公共层，适合承接持久化配置 schema |
| `@vitamin/skill` | 6 | 958 | 2 | 1 | Skill 领域层，解析能力可与 manifest/frontmatter 抽象复用 |
| `@vitamin/prompt` | 13 | 865 | 1 | 2 | Prompt 公共层，section/diagnostics 应保持公共 |
| `@vitamin/persistence` | 9 | 544 | 1 | 3 | 存储抽象公共层 |
| `@vitamin/resources` | 6 | 531 | 4 | 1 | 资源组合层，依赖偏多但规模小 |
| `@vitamin/cli` | 3 | 358 | 5 | 0 | 命令入口层，不适合作公共依赖 |
| `@vitamin/invariant` | 4 | 309 | 0 | 5 | 编译/断言基础层 |
| `@vitamin/env` | 1 | 149 | 0 | 9 | 常量层，但已开始承载跨领域常量，需治理 |

## 当前公共模块边界

### 已经适合保留的公共模块

- `@vitamin/shared`：事件、日志、HTTP、路径、JSONC、Markdown、Disposable、字符串/截断工具。被依赖最多，定位合理。
- `@vitamin/env`：全局常量和环境变量读取。依赖为零，适合作底层常量包，但需要避免继续塞入过多领域常量。
- `@vitamin/invariant`：断言和编译期裁剪能力。保持底层纯净。
- `@vitamin/persistence`：磁盘/远端持久化抽象。适合作 session、setting、memory 复用。
- `@vitamin/session`：会话条目、checkpoint、branch、compaction entry。应作为会话模型公共层，而不是放入 coding。

### 不建议成为公共模块的包

- `@vitamin/coding`：依赖 15 个内部包，是应用编排层。任何公共类型若放入 coding，都会造成反向依赖风险。
- `@vitamin/service`、`@vitamin/cli`、`@vitamin/opendev-ui`：入口/展示层，只应依赖公共模块，不应被核心能力依赖。
- `@vitamin/tools`：当前是能力大集合，已经偏重。可以拆出公共 kit，但不宜让更多包直接依赖整个 tools。

## 可抽象候选

| 优先级 | 候选公共模块 | 当前重复/耦合点 | 建议归属 | 收益 | 风险 |
| --- | --- | --- | --- | --- | --- |
| P0 | `@vitamin/protocol` | `service/src/types.ts`、`service/src/ws-protocol.ts`、`opendev-ui/src/types/index.ts` 的 WebSocket message 类型重复 | 新包或 `@vitamin/shared/protocol` | 前后端共用 WS/CDP/Event 类型和校验，减少漂移 | 需要让 UI 能消费 workspace 包或生成类型 |
| P0 | `@vitamin/client` 或 `@vitamin/http-client` | `opendev-ui/src/api/client.ts`、`api/mcp.ts`、`api/traces.ts` 重复 fetch/error/json/camelCase | 新包或 UI 内先建 `src/api/core.ts` | 大幅减少 API 客户端重复，统一错误模型 | 若直接公共化要处理浏览器/Node fetch 差异 |
| P0 | `@vitamin/data` / `@vitamin/shape` | `asRecord/readString/readNumber/normalizeToCamel/toCamelKey` 在 service/UI 多处重复 | `@vitamin/shared` browser-safe 子导出 | 纯函数低风险，service/UI/hooks 都可复用 | 命名要克制，避免变成杂物包 |
| P1 | `@vitamin/schema` / `@vitamin/toolkit` | 大量 tool 参数 schema、`validateToolArgs`、MCP JSON Schema -> Zod、Plugin manifest 手写校验 | 新包或 `@vitamin/tools/schema` | 统一 Zod/JSON Schema/manifest 校验，减少 tools/mcp/plugin 重复 | `zod` 版本目前 agent 用 v3，tools/mcp 用 v4，需要先统一 |
| P1 | `@vitamin/manifest` | Skill frontmatter、Memory frontmatter、Plugin manifest、Markdown frontmatter 解析分散 | 新包或扩展 `@vitamin/shared/markdown` | 统一 frontmatter 解析、诊断、序列化 | 领域字段不同，需保留领域 schema 层 |
| P1 | `@vitamin/errors` | 多包 `throw new Error` 和局部错误类混杂；shared 已有基础 error 类型 | 扩展 `@vitamin/shared/error` | 错误 code/cause/retryable/metadata 一致，CLI/service 展示更稳 | 一次性迁移成本高，建议渐进 |
| P1 | `@vitamin/runtime` | Deferred、tool side-effect、abort/heartbeat/retry、queue 等运行时模式分散 | 新包或 `@vitamin/agent/runtime` | agent/orchestrator/swarm/service 共享异步运行时工具 | 容易过度抽象，需从稳定纯工具开始 |
| P2 | `@vitamin/fs` | tools fs/read/write/edit、shared fs-extra、memory file snapshot、path normalize 交叉 | 新包或扩展 `@vitamin/shared/fs` | 统一路径校验、workspace 边界、文件变更摘要 | 权限语义属于 hooks/tools，不应下沉 |
| P2 | `@vitamin/bridge` | service websocket manager、debug bridge、UI websocket client 共享连接状态协议 | 基于 `@vitamin/protocol` 后再抽 | Bridge 可靠性可复用到 CLI/TUI | 当前实现仍偏应用，先抽协议更稳 |
| P2 | `@vitamin/orchestration-core` | orchestrator、swarm、tools/orchestration 有相近 task/agent/task store 概念 | 后续 RFC | 收敛 task lifecycle、background task、subagent result | 当前语义未完全一致，贸然抽象风险高 |

## 重复热点分析

### 1. 前后端协议与事件类型重复

当前服务端有 `packages/service/src/types.ts` 和 `packages/service/src/ws-protocol.ts`，前端有 `packages/opendev-ui/src/types/index.ts`。新增 `Runtime.connectionState` 时必须同时改两边，说明协议边界还没有真正公共化。

建议：

1. 新建 `@vitamin/protocol`，导出 `WebSocketMessage`、`WebSocketClientMessage`、`validateWebSocketMessage()`。
2. `@vitamin/service` 依赖 protocol 做运行时校验。
3. `@vitamin/opendev-ui` 依赖 protocol 类型，或在 build 前生成 `src/types/protocol.generated.ts`。

验收：

- 删除 UI 中手写的 WS message union。
- service 和 UI 引用同一份 `Runtime.connectionState` 类型。
- 协议测试迁移到 protocol 包。

### 2. HTTP API 客户端重复

`opendev-ui/src/api/client.ts` 有大量重复：

- `fetch(...)`
- `if (!response.ok) throw new Error(...)`
- `return response.json()`
- POST/PUT JSON body/header

`api/mcp.ts` 又实现了独立的 `fetchAPI<T>()` 和 `normalizeToCamel()`，`api/traces.ts` 再单独处理 response。

建议先在 UI 内抽 `packages/opendev-ui/src/api/core.ts`，稳定后再考虑公共包：

- `requestJson<T>(path, options)`
- `postJson<T>(path, body)`
- `deleteJson<T>(path)`
- `ApiError(status, message, body?)`
- `normalizeToCamel()`

如果 CLI/service 也需要消费相同 HTTP client，再迁移为 `@vitamin/client`。

### 3. 数据读取/归一化工具重复

重复函数包括：

- `toCamelKey()` / `normalizeToCamel()`：`opendev-ui/src/api/mcp.ts`、`opendev-ui/src/api/websocket.ts`。
- `asRecord()`：`opendev-ui/src/api/websocket.ts`，service inbound/router 类似。
- `readString()` / `readNumber()` / `readObject()`：`opendev-ui/src/stores/status.ts`、`subagents.ts`、`todo.ts`。
- `extractString()` / `extractBoolean()` / `extractNumber()` / `extractRecord()`：`service/src/inbound-router.ts`。

建议抽到 `@vitamin/shared/browser/data`：

- `isRecord(value): value is Record<string, unknown>`
- `asRecord(value): Record<string, unknown>`
- `readString(record, ...keys)`
- `readNumber(record, ...keys)`
- `readBoolean(record, ...keys)`
- `readArray(record, key, guard?)`
- `toCamelKey()` / `normalizeKeysToCamel()`

这是最低风险、最高确定性的公共抽象。

### 4. Tool schema 与 manifest 校验分散

现状：

- `tools` 大量工具直接 `z.object(...)`。
- `tools/src/tool-validator.ts` 做 tool 参数 safeParse。
- `mcp/src/mcp-tool-adapter.ts` 做 JSON Schema -> Zod。
- `tools/src/plugin-manifest.ts` 手写 validate plugin manifest。
- `skill/src/skill-parser.ts`、`memory/src/layered-memory.ts` 都有 frontmatter/schema 校验。

建议：

1. 先统一 Zod 版本。当前 `swarm` 使用 zod v3，`tools/mcp/root` 使用 zod v4，长期会制造类型摩擦。
2. 抽 `@vitamin/schema`，只放稳定底层能力：
   - `ValidationResult<T>`
   - `validateWithZod(schema, value)`
   - `jsonSchemaToZod(schema)`
   - `defineManifestSchema(...)`
3. Tool 领域保留在 `@vitamin/tools`，MCP/Plugin/Skill 只复用底层 schema utilities。

### 5. Manifest/frontmatter 能力可以统一

重复点：

- Skill: `SKILL.md` YAML frontmatter。
- Memory: markdown frontmatter。
- Plugin: `plugin.json` / manifest validation。
- Shared markdown 已有 `extractFrontmatter()` 等 AST 级能力。

建议抽象为 `@vitamin/manifest` 或扩展 `@vitamin/shared/markdown`：

- `parseYamlFrontmatter(raw)`
- `serializeYamlFrontmatter(meta, body)`
- `validateFrontmatter(meta, requiredFields)`
- `FrontmatterParseError` with file path/code.

Plugin JSON manifest 仍保留在 `@vitamin/tools` 或未来 `@vitamin/plugin`，但可复用统一错误和校验结果结构。

### 6. 错误体系需要收敛，但不建议一次性迁移

`@vitamin/shared` 已有 `ConfigError/ProviderError/AgentError/ToolError/...`，但仓库里仍有大量 `throw new Error(...)`。这不是全部都该替换：局部纯函数错误可以保留普通 Error；跨包边界、用户可见、协议可序列化的错误应该用 typed error。

建议优先迁移：

- service/ws/protocol：`ProtocolError`
- tools/plugin/mcp/fs：`ToolError` with code + metadata
- setting/session/persistence：`ConfigError` / `SessionError`
- ai provider：`ProviderError` subclasses

不建议迁移：

- 测试里的故意错误。
- 私有 helper 内部不可恢复错误。

### 7. MCP 代码存在双轨，应收敛

当前同时存在：

- `packages/mcp/src/*`
- `packages/tools/src/mcp/*`

这类双轨容易造成协议修复漏改。建议目标边界：

- `@vitamin/mcp`：client、manager、transport、adapter、agent tools。
- `@vitamin/tools`：只负责把 MCP 工具注册进 ToolRegistry，不再维护 MCP client/transport 副本。

迁移方式：

1. 标记 `packages/tools/src/mcp/*` 为 compatibility re-export。
2. 测试指向 `@vitamin/mcp`。
3. 后续删除重复实现。

## 建议拆分路线

### Phase 1：低风险纯工具抽象

目标：不改业务语义，只消除重复 helper。

1. 在 `@vitamin/shared` 增加 browser-safe `data` 工具。
2. UI/service 替换 `asRecord/readString/readNumber/toCamelKey/normalizeToCamel`。
3. 在 UI 内抽 `api/core.ts`，统一 REST client。

预期收益：减少 opendev-ui/service 重复，降低后续协议字段变更成本。

### Phase 2：协议公共化

目标：让 service/UI 使用同一份 message 类型和 validator。

1. 新建 `@vitamin/protocol`。
2. 迁移 `WebSocketMessage`、`WebSocketClientMessage`、`validateWebSocketMessage`。
3. service 删除本地协议定义，UI 删除手写 union。

预期收益：Web bridge、debug bridge、approval callback 不再两端手动同步。

### Phase 3：工具/manifest/schema 收敛

目标：降低 tools/mcp/plugin/skill 的 schema 和 manifest 重复。

1. 统一 zod 版本。
2. 抽 `@vitamin/schema`。
3. 抽 frontmatter/manifest parse helper。
4. MCP 双轨代码收敛到 `@vitamin/mcp`。

预期收益：Plugin、MCP、Skill 能力扩展时校验一致，错误结构一致。

### Phase 4：运行时编排抽象

目标：在 agent/orchestrator/swarm/service 稳定后抽公共 runtime。

候选：

- retry/backoff
- async queue
- heartbeat/keepalive
- abort propagation
- task lifecycle event

这阶段风险较高，应等协议和 schema 先稳定。

## 明确不建议抽象的内容

- 不把 `@vitamin/coding` 抽成公共依赖；它是组合层。
- 不把完整 `@vitamin/tools` 作为更多模块的公共依赖；应拆小公共 kit。
- 不把 UI 状态 store 抽到后端公共模块；最多共享协议类型和数据读取工具。
- 不把 Claude Code 的云端 Teleport/Ultraplan 概念抽象进当前 bridge；当前产品边界是本地 Web bridge。
- 不把所有错误都改成 typed error；只处理跨模块、用户可见、协议可序列化边界。

## 结论

最值得优先抽象的是三类：

1. `@vitamin/shared/browser/data`：纯数据读取和 key normalize helper。
2. `@vitamin/protocol`：WebSocket/CDP/Session event 协议和 validator。
3. UI `api/core.ts`，稳定后再考虑 `@vitamin/client`。

中期再处理：

1. `@vitamin/schema`：Zod/JSON Schema/manifest validation。
2. `@vitamin/manifest` 或 shared markdown frontmatter helpers。
3. MCP 双轨代码收敛到 `@vitamin/mcp`。

这些抽象方向都符合现有依赖分层：公共模块只下沉纯工具、协议和 schema，不把应用编排逻辑下沉。
