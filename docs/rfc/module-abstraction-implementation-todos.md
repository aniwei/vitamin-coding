# Vitamin 全仓公共模块抽象实施方案

> 阶段：MA（Module Abstraction）
> 设计来源：[`docs/rfc/module-abstraction-audit.md`](./module-abstraction-audit.md)
> 更新时间：2026-05-02

## 阶段摘要

本阶段将全仓模块抽象审计转为可执行实施账本。目标不是把所有重复代码一次性公共化，而是按依赖方向、风险和验证成本，把确定性最高的能力先抽到稳定公共边界，再迁移调用方。

实施优先级遵循四个原则：

1. 先抽纯函数和协议类型，再抽运行时编排。
2. 先收敛重复实现，再创建新的公共依赖。
3. `@vitamin/coding`、`@vitamin/service`、`@vitamin/opendev-ui` 保持应用层定位，不作为底层公共模块。
4. 每个公共模块必须有清晰输入输出、测试和迁移证据，避免形成新的杂物包。

## 状态

- 阶段状态：Done
- 总完成百分比：100%
- 最新测试状态：Pass
- 最新测试命令：`pnpm vitest run packages/shared/tests/runtime.test.ts packages/agent/tests/concurrency.test.ts packages/orchestrator/tests/executor.test.ts`；`pnpm --filter @vitamin/shared typecheck`；`pnpm --filter @vitamin/shared build`；`pnpm --filter @vitamin/agent typecheck`；`pnpm --filter @vitamin/orchestrator typecheck`；`pnpm --filter @vitamin/agent build`；`pnpm --filter @vitamin/orchestrator build`；`pnpm typecheck`
- 最新测试结果：2026-05-02 20:13 Asia/Shanghai，目标 vitest 3 个文件 32 项通过；shared typecheck/build 通过；agent/orchestrator typecheck/build 通过；`pnpm typecheck` 通过，Nx 成功运行 24 个项目 typecheck 目标及 21 个依赖任务。
- 依赖项：`@vitamin/shared`、`@vitamin/service`、`@vitamin/opendev-ui`、`@vitamin/tools`、`@vitamin/mcp`、`@vitamin/skill`、`@vitamin/memory`、`@vitamin/hooks`、`@vitamin/agent`、`@vitamin/coding`、`@vitamin/cli`。
- 执行策略：按 Milestone A-D 分阶段推进；每个 TODO 开工前先读取目标代码和测试，补充实现路径，再修改代码。

## 设计与验收链接

- 审计 RFC：[`docs/rfc/module-abstraction-audit.md`](./module-abstraction-audit.md)
- RFC-to-TODO 参考：[`docs/rfc/vitamin-vs-claude-code-implementation-todos.md`](./vitamin-vs-claude-code-implementation-todos.md)
- 公共基础层：`packages/shared/src/*`、`packages/env/src/*`、`packages/invariant/src/*`
- 协议重复点：`packages/service/src/types.ts`、`packages/service/src/ws-protocol.ts`、`packages/opendev-ui/src/types/index.ts`
- UI API 重复点：`packages/opendev-ui/src/api/client.ts`、`packages/opendev-ui/src/api/mcp.ts`、`packages/opendev-ui/src/api/traces.ts`
- 数据读取重复点：`packages/opendev-ui/src/api/websocket.ts`、`packages/opendev-ui/src/stores/status.ts`、`packages/opendev-ui/src/stores/subagents.ts`、`packages/opendev-ui/src/stores/todo.ts`、`packages/service/src/inbound-router.ts`
- Schema/manifest 重复点：`packages/tools/src/tool-validator.ts`、`packages/mcp/src/mcp-tool-adapter.ts`、`packages/tools/src/plugin-manifest.ts`、`packages/skill/src/skill-parser.ts`、`packages/memory/src/layered-memory.ts`
- MCP 双轨：`packages/mcp/src/*`、`packages/tools/src/mcp/*`

## 启动检查清单

- [x] 已读取全仓模块抽象审计。
- [x] 已核对既有 RFC-to-TODO 跟踪器格式。
- [x] 已确认本方案不修改审计事实，只记录执行账本。
- [x] 开始实现前，重新读取目标模块当前代码，避免基于过期结论修改。
- [x] 每个 TODO 开工前补充目标测试文件列表。
- [x] 每个 TODO 完成前记录测试命令、测试结果、剩余风险。
- [x] 修改总完成百分比前，先用进度计算命令复核。

## 参考依据与需求方案设计备注

本节按 `rfc-to-todos` 方法论记录每个需求簇的方案设计证据。实施前如发现当前代码与备注不一致，必须先更新本节或对应 TODO 的“完成时设计核对”。

| 需求簇 | 要解决的问题 | 期望结果 | 约束与边界 | 方案选择 | 放弃方案 | 验证方式 |
| --- | --- | --- | --- | --- | --- | --- |
| 数据读取/归一化工具 | `asRecord/readString/readNumber/readBoolean/toCamelKey/normalizeToCamel` 在 UI 和 service 中重复 | 调用方使用同一组 browser-safe 纯函数读取未知对象、兼容 snake/camel key、执行浅/深 key 归一化 | 不引入 Node-only 依赖；不把领域字段规则塞进 shared；保持调用方现有行为 | 在 `@vitamin/shared` 增加 data 子模块，先迁移 UI/service 重复 helper | 新建独立 `@vitamin/data` 包，当前收益不足且增加包维护成本 | shared 单测、UI/service 相关测试、`pnpm typecheck` |
| UI API client core | `opendev-ui` 多个 API 文件重复 fetch/error/json/camelCase 处理 | UI API 层共享 `requestJson/postJson/deleteJson/ApiError/normalizeToCamel`，端点函数只保留业务参数 | 不改变 REST endpoint 和返回结构；先不强行公共化到 Node/CLI | 先在 UI 内新增 `api/core.ts`，稳定后再评估 `@vitamin/client` | 直接新建跨端 HTTP client，浏览器/Node fetch 差异会扩大范围 | UI API 单测或 build、调用点 diff 审查 |
| 协议公共化 | service 与 UI 分别维护 WS/CDP/session message union 和校验，字段新增容易漂移 | `@vitamin/protocol` 导出共享 message 类型、事件枚举和 validator，service/UI 引用同一份协议 | protocol 包不能依赖 service/UI；UI 必须能消费 workspace package；运行时校验仍在服务端执行 | 新建 `@vitamin/protocol`，先迁出稳定 WS message，再迁移 service/UI | 继续手动同步两端类型，无法降低漂移风险 | protocol 单测、service WS 测试、UI build/typecheck |
| Schema/tool validation | tools/mcp/plugin/skill 的 Zod、JSON Schema 和 manifest 校验分散，且 zod 版本存在漂移 | 底层 `ValidationResult`、Zod safeParse 包装、JSON Schema -> Zod 转换和 schema diagnostics 可复用 | Tool 领域模型仍留在 `@vitamin/tools`；先统一 zod 版本；不把全部 manifest 字段下沉 | 新建 `@vitamin/schema`，只放低耦合校验工具 | 把 schema 工具塞进 `@vitamin/tools`，会让更多包依赖 tools 大包 | schema 单测、tools/mcp 适配测试、包依赖审查 |
| Manifest/frontmatter | Skill、Memory、Plugin 都有 frontmatter/manifest 解析和错误展示需求 | 统一 frontmatter 解析、序列化、诊断结构；领域 schema 仍由各包定义 | Plugin JSON manifest 不等同于 Markdown frontmatter；公共层只处理格式和通用诊断 | 在 `@vitamin/manifest` 或 `@vitamin/shared/markdown` 增加通用 parser，领域包复用 | 把 Skill/Memory/Plugin schema 合成一个大 schema，领域差异过大 | parser 单测、skill/memory/plugin 回归测试 |
| MCP 双轨收敛 | `packages/mcp/src/*` 与 `packages/tools/src/mcp/*` 同时存在，协议修复容易漏改 | `@vitamin/mcp` 承担 client/manager/transport/adapter；`@vitamin/tools` 只做注册和兼容 re-export | 不能一次性删除老 import；需要兼容窗口和测试迁移 | 先把 tools 下 MCP 标记为 compatibility re-export，再迁移测试和调用方 | 继续双轨维护，后续 MCP 能力会重复实现 | MCP/tool 集成测试、import usage 审计 |
| Typed errors | 跨包边界大量普通 Error，用户可见错误缺少 code/cause/retryable/metadata | 协议、工具、provider、session 边界使用 typed errors，CLI/service/UI 展示一致 | 不迁移所有私有 helper 和测试故意错误；避免大范围 churn | 扩展 `@vitamin/shared/error` 并按边界渐进迁移 | 一次性替换全仓 `throw new Error`，风险和噪音过高 | 错误序列化单测、边界负向测试 |
| Runtime helpers | retry/backoff/queue/heartbeat/abort 等异步模式分散 | 在协议和错误边界稳定后，抽可复用 runtime helpers 给 agent/orchestrator/swarm/service 使用 | 不抽业务 task lifecycle；只抽纯稳定异步原语 | 后置到 Phase 4，先从 retry/backoff/abort propagation 低耦合工具开始 | 过早新建 `@vitamin/runtime` 承载所有编排概念，容易变成第二个应用层 | runtime 单测、agent/service 回归测试 |

## TODO 表

| ID | 状态 | 完成百分比 | 测试通过 | 文件/模块 | 功能介绍 | 完成时设计核对 |
| --- | --- | ---: | --- | --- | --- | --- |
| MA-01 | Done | 100% | Pass | `packages/shared/src/browser/data.ts`、`packages/shared/src/browser/index.ts`、`packages/shared/src/index.ts`、`packages/shared/package.json`、`packages/shared/tsdown.config.ts`、`packages/shared/tests/data.test.ts`、`packages/opendev-ui/package.json`、`packages/opendev-ui/src/api/websocket.ts`、`packages/opendev-ui/src/api/mcp.ts`、`packages/opendev-ui/src/stores/status.ts`、`packages/opendev-ui/src/stores/subagents.ts`、`packages/opendev-ui/src/stores/todo.ts`、`packages/service/src/inbound-router.ts` | 抽 `@vitamin/shared` browser-safe data helpers：record guard、typed readers、camel key 归一化，并迁移 UI/service 重复实现。 | 已实现输入/输出：`@vitamin/shared/browser/data` 导出 `isRecord/asRecord/readString/readNumber/readBoolean/readObject/readArray/toCamelKey/normalizeKeysToCamel`，root barrel 同步导出供 service 使用；`opendev-ui` 通过 browser subpath 复用 helper，`service` inbound router 删除本地 extract helper。测试覆盖 record guard、typed readers、NaN 过滤、数组/object 读取和递归 camel key 归一化；验证命令：`pnpm vitest run packages/shared/tests/data.test.ts packages/service/tests/inbound-router.test.ts packages/service/tests/websocket-manager.test.ts`、`pnpm --filter @vitamin/opendev-ui build`、`pnpm typecheck` 均通过。剩余风险：UI build 仍有既有大 chunk warning，与本 TODO 无关。 |
| MA-02 | Done | 100% | Pass | `packages/opendev-ui/src/api/core.ts`、`packages/opendev-ui/src/api/client.ts`、`packages/opendev-ui/src/api/mcp.ts`、`packages/opendev-ui/src/api/traces.ts`、`packages/opendev-ui/src/api/devtools.ts`、`packages/opendev-ui/src/api/logs.ts` | 抽 UI-local API core，统一 request/response/error/json/camelCase 处理，减少端点函数重复。 | 已实现输入/输出：新增 UI-local `api/core.ts`，提供 `API_BASE`、`ApiError`、`requestJson/getJson/postJson/putJson/deleteJson/requestRaw`、JSON header/body helper 和可选 `normalizeCamel`；`client.ts`、`mcp.ts`、`traces.ts`、`devtools.ts`、`logs.ts` 迁移到 core。特殊语义保持在调用处：`getSessionMessages()` 对 404 返回空数组，`getBridgeInfo()` 非 2xx 返回 fallback。验证：`pnpm --filter @vitamin/opendev-ui build` 和 `pnpm typecheck` 均通过。剩余风险：UI API 目前无专门单测，行为以 build/typecheck 和保留调用签名验证。 |
| MA-03 | Done | 100% | Pass | `packages/protocol/package.json`、`packages/protocol/tsconfig.json`、`packages/protocol/tsdown.config.ts`、`packages/protocol/src/index.ts`、`packages/protocol/src/types.ts`、`packages/protocol/src/validation.ts`、`packages/protocol/tests/ws-protocol.test.ts` | 新建 `@vitamin/protocol`，定义 WebSocket/CDP/session 共享 message 类型、事件枚举和 validator。 | 已实现输入/输出：新增零运行时依赖的 `@vitamin/protocol` package，导出 `WebSocketMessage`、`WebSocketClientMessage`、client/server event type、connection state、log entry、tool execution/review protocol shape、inbound data shape，以及 `validateWebSocketMessage()` / `isValidWebSocketMessage()`。协议包不依赖 service/UI/agent，后续 MA-04 负责 service/UI 迁移。测试覆盖 Runtime connectionState、未知消息、缺失字段、tool execution event、patch review failed 正/负向校验；验证命令：`pnpm --filter @vitamin/protocol build`、`pnpm --filter @vitamin/protocol typecheck`、`pnpm vitest run packages/protocol/tests/ws-protocol.test.ts`、`pnpm typecheck` 均通过。 |
| MA-04 | Done | 100% | Pass | `packages/service/package.json`、`packages/service/src/types.ts`、`packages/service/src/ws-protocol.ts`、`packages/opendev-ui/package.json`、`packages/opendev-ui/src/types/index.ts`、`pnpm-lock.yaml` | 迁移 service/UI 到 `@vitamin/protocol`，删除或收敛本地重复协议定义。 | 已实现输入/输出：`@vitamin/service` 和 `@vitamin/opendev-ui` 均新增 `@vitamin/protocol` workspace 依赖；`service/src/types.ts` 删除本地 WS/client/inbound 数据类型定义，改为从 protocol 兼容导出同名类型；`service/src/ws-protocol.ts` 改为 protocol validator re-export；UI `WebSocketMessage` 的事件名来源于 protocol，并保留宽松 `data` 以兼容现有 store 对历史字段的防御式读取和本地 `Runtime.disconnected` 合成事件。测试覆盖 service WS validator、inbound router 和 protocol validator；验证命令：目标 vitest、`@vitamin/service` typecheck/build、`@vitamin/opendev-ui` build、`pnpm typecheck` 均通过。剩余风险：UI data 仍是兼容宽松类型，后续若要全量严格化，需要逐个 store/event 做字段映射和协议补全。 |
| MA-05 | Done | 100% | Pass | `packages/schema/package.json`、`packages/schema/tsconfig.json`、`packages/schema/tsdown.config.ts`、`packages/schema/src/index.ts`、`packages/schema/src/validation.ts`、`packages/schema/src/json-schema.ts`、`packages/schema/tests/*`、`packages/tools/package.json`、`packages/tools/src/tool-validator.ts`、`packages/mcp/package.json`、`packages/mcp/src/mcp-tool-adapter.ts`、`vitest.config.ts`、`pnpm-lock.yaml` | 新建 `@vitamin/schema` 基础层，统一 `ValidationResult`、Zod safeParse 包装、JSON Schema -> Zod 转换和诊断结构。 | 已实现输入/输出：新增 `@vitamin/schema`，导出 `ValidationResult`、`ValidationIssue`、`validateWithZod()`、`formatValidationError()`、`JsonSchema`、`jsonSchemaPropertyToZod()`、`jsonSchemaObjectToZod()`；`tools/src/tool-validator.ts` 改为 schema 兼容 re-export，`mcp/src/mcp-tool-adapter.ts` 的 JSON Schema -> Zod 转换改用 schema 包。已补 `@vitamin/schema` 到 tools/mcp 依赖和 vitest alias。测试覆盖 Zod 成功/失败格式化、JSON Schema primitive/enum/object required 转换、旧 tool-validator 和 MCP adapter 行为。验证命令：schema build/typecheck、目标 vitest、tools/mcp typecheck/build、`pnpm typecheck` 均通过。剩余风险：`swarm` 仍使用 zod v3，本轮未强行升级；后续如 schema 工具要被 swarm 复用，需单独处理 zod 版本统一。 |
| MA-06 | Done | 100% | Pass | `packages/manifest/package.json`、`packages/manifest/tsconfig.json`、`packages/manifest/tsdown.config.ts`、`packages/manifest/src/frontmatter.ts`、`packages/manifest/src/index.ts`、`packages/manifest/tests/frontmatter.test.ts`、`packages/skill/package.json`、`packages/skill/src/skill-parser.ts`、`packages/skill/tests/skill-parser.test.ts`、`packages/memory/package.json`、`packages/memory/src/layered-memory.ts`、`packages/memory/tests/layered-memory.test.ts`、`vitest.config.ts`、`pnpm-lock.yaml` | 抽 manifest/frontmatter 通用解析、序列化和诊断能力，Skill/Memory 复用底层 Markdown frontmatter 格式处理。 | 已实现输入/输出：新增独立 `@vitamin/manifest` package，导出 `extractYamlFrontmatter()`、`parseYamlFrontmatter()`、`serializeYamlFrontmatter()`、`FrontmatterParseError` 和 typed error code；`skill-parser` 删除本地 YAML/frontmatter regex 解析，改用 manifest parser 并保留缺失 frontmatter 的兼容错误；`layered-memory` 删除本地 frontmatter 行解析和序列化，改用 manifest parser/serializer，并对坏 frontmatter 保持忽略条目的兼容行为。`@vitamin/skill` 不再直接依赖 `yaml`，YAML 格式能力由 `@vitamin/manifest` 持有。验证：manifest build/typecheck、目标 vitest、skill/memory typecheck/build、`pnpm typecheck` 均通过。剩余风险：Plugin JSON manifest 与 Markdown frontmatter 字段域不同，本轮未强行迁入 manifest；后续可复用通用 diagnostics，但领域 schema 仍应留在 tools/plugin 域。 |
| MA-07 | Done | 100% | Pass | `packages/mcp/src/index.ts`、`packages/tools/src/mcp/index.ts`、`packages/tools/src/mcp/mcp-client.ts`、`packages/tools/src/mcp/mcp-manager.ts`、`packages/tools/src/mcp/mcp-tool-adapter.ts`、`packages/tools/src/mcp/transport.ts`、`packages/tools/src/mcp/types.ts`、`packages/tools/src/register-builtin.ts`、`packages/tools/tests/mcp-client.test.ts`、`packages/tools/tests/mcp-manager.test.ts`、`packages/tools/tests/mcp-tool-adapter.test.ts`、`packages/tools/tests/mcp-transport.test.ts`、`packages/tools/tests/mcp-agent-tools.test.ts`、`packages/tools/tests/mcp-compatibility.test.ts` | 收敛 MCP 双轨：`@vitamin/mcp` 拥有 client/manager/transport/adapter/agent tools，`@vitamin/tools` 只负责注册和 compatibility re-export。 | 已实现输入/输出：MCP 行为测试 import 已迁到 `@vitamin/mcp`，确认 client、manager、transport、adapter、agent tools 的权威实现归属 MCP 包；`tools/src/mcp/*` 保持 compatibility re-export，并补齐 `createStdioTransport/createSseTransport`、adapter helper 和完整 type re-export，避免旧 subpath 使用方漂移。`register-builtin` 仍只通过 `createMcpAgentTools(options.mcpManager)` 注册 MCP agent tools，保留 tools 层注册语义，不重新拥有 MCP 协议实现。新增兼容测试校验 tools MCP root/subpath 出口指向 `@vitamin/mcp`。验证：目标 vitest 6 个文件 72 项通过，mcp/tools typecheck/build 通过，`pnpm typecheck` 通过。剩余风险：旧 `packages/tools/src/mcp/*` 兼容层仍保留，后续如要删除需先发布弃用窗口并审计外部 import。 |
| MA-08 | Done | 100% | Pass | `packages/shared/src/error.ts`、`packages/shared/src/index.ts`、`packages/shared/tests/error.test.ts`、`packages/session/package.json`、`packages/session/src/session-manager.ts`、`packages/session/src/in-memory-session.ts`、`packages/session/src/storage-factory.ts`、`packages/session/tests/session-manager.test.ts`、`packages/session/tests/in-memory-session.test.ts`、`packages/tools/src/web/url-validator.ts`、`packages/tools/tests/web-tools.test.ts`、`pnpm-lock.yaml` | 渐进收敛跨包 typed errors：shared 错误基类补 code/cause/retryable/metadata/serialize，session 和 web URL 安全边界改用 typed errors。 | 已实现输入/输出：`@vitamin/shared` error 基类新增 `ErrorOptions`、`ErrorMetadata`、`SerializedError`、`metadata`、`retryable`、`toJSON()`、`isVitaminError()`、`serializeError()`，root barrel 兼容导出 `VitaminError` 与序列化 API；`@vitamin/session` 新增 shared 依赖，并把 active session 缺失、容量耗尽、重复 session id、缺失 entry、unsupported storage、remote fetch 缺失迁为 `SessionError`，保留原 message 且补 code/metadata/retryable；tools web URL validator 将 invalid URL、blocked protocol/host/private IP 迁为 `ToolError`，保留原 message 并补 URL 诊断 metadata。测试覆盖 shared 序列化/cause/metadata、session 边界 code/metadata、web SSRF ToolError code/metadata；验证：目标 vitest 4 个文件 114 项通过，shared/session/tools typecheck/build 通过，`pnpm typecheck` 通过。剩余风险：本轮按 MA-08 约束只迁移跨包和用户可见高价值边界，未机械替换全仓普通 `Error`；AI provider、service route 和更多 tools 边界可在后续按 code 体系继续扩展。 |
| MA-09 | Done | 100% | Pass | `packages/shared/src/runtime.ts`、`packages/shared/tests/runtime.test.ts`、`packages/shared/src/index.ts`、`packages/shared/package.json`、`packages/shared/tsdown.config.ts`、`packages/agent/src/concurrency.ts`、`packages/agent/tests/concurrency.test.ts`、`packages/orchestrator/src/executor.ts`、`packages/orchestrator/tests/executor.test.ts`、`pnpm-lock.yaml` | 在协议/schema/error 稳定后抽 retry/backoff/queue/abort propagation 等低耦合 runtime helpers。 | 已实现输入/输出：新增 `@vitamin/shared/runtime`，导出 `sleep(ms, { signal })`、`withTimeout(promise, timeoutMs, { onTimeout, createTimeoutError })`、`limitConcurrency(tasks, maxConcurrency)`、`RuntimeTimeoutError`、`RuntimeAbortError`；root barrel 与 package subpath 同步导出，tsdown 增加 runtime entry。`agent/src/concurrency.ts` 改为兼容 re-export `limitConcurrency`，保留旧 import 面；`orchestrator/src/executor.ts` 删除本地 `sleep/withTimeout`，改用 shared runtime，并让 retry backoff 在 task cancellation 时通过 abort-aware sleep 尽快进入取消收尾，避免后台 promise 泄漏。测试覆盖 sleep abort、timeout custom error、并发上限、agent 旧入口兼容和 orchestrator timeout/cancel/retry 行为；验证：目标 vitest 3 个文件 32 项通过，shared/agent/orchestrator typecheck/build 通过，`pnpm typecheck` 通过。剩余风险：swarm parallel/hierarchical 仍保留手写运行池，本轮未改动以避免改变调度事件顺序；后续可基于 `limitConcurrency` 单独做保持事件语义的迁移。 |

## 里程碑计划

### Milestone A：低风险纯工具与 UI API 收敛

目标：不改变业务语义，先消除最确定的重复 helper。

- MA-01 数据读取/归一化工具
- MA-02 UI API client core

完成标准：

- UI/service 重复 data helper 迁移到 shared。
- UI API 端点函数不再重复基础 fetch/error/json 样板。
- `pnpm typecheck` 与相关包测试通过。

### Milestone B：协议公共化

目标：service/UI 使用同一份协议类型和 validator。

- MA-03 新建 `@vitamin/protocol`
- MA-04 service/UI protocol migration

完成标准：

- service 和 UI 引用同一份 WebSocket message 类型。
- `Runtime.connectionState` 等事件只在 protocol 中定义一次。
- 协议 validator 的单测和 service WS 测试通过。

### Milestone C：Schema、Manifest、MCP 收敛

目标：减少 tools/mcp/plugin/skill/memory 的校验和协议重复。

- MA-05 `@vitamin/schema`
- MA-06 manifest/frontmatter
- MA-07 MCP 双轨收敛

完成标准：

- zod 版本与 schema helper 边界明确。
- Skill/Memory/Plugin 复用通用 frontmatter/manifest parser。
- MCP client/manager/transport/adapter 归属 `@vitamin/mcp`。

### Milestone D：边界错误与 Runtime 原语

目标：在公共协议和校验层稳定后，收敛跨包错误和低耦合异步原语。

- MA-08 typed errors
- MA-09 runtime helpers

完成标准：

- 跨包边界错误可结构化展示和序列化。
- retry/backoff/abort/heartbeat 等 helper 有独立测试。
- 不引入新的反向依赖和应用层公共包。

## 实施顺序

1. MA-01：先抽纯函数，验证 shared browser-safe 边界。
2. MA-02：在 UI 内收敛 API 样板，不扩大公共包范围。
3. MA-03 / MA-04：完成 protocol 包和 service/UI 迁移。
4. MA-05：处理 schema 和 zod 版本统一。
5. MA-06：抽 frontmatter/manifest 通用格式层。
6. MA-07：在 schema/manifest 边界清楚后收敛 MCP 双轨。
7. MA-08：按跨包边界渐进迁移 typed errors。
8. MA-09：最后评估 runtime helpers，避免过早抽象编排语义。

## 测试策略

每个 TODO 至少满足：

- 单元测试：公共纯函数、schema、validator、错误结构。
- 集成测试：跨包调用链，例如 `protocol -> service -> opendev-ui`、`schema -> tools -> mcp`。
- 负向测试：坏协议消息、坏 manifest、坏 tool args、跨包错误序列化。
- 兼容测试：旧 import 或旧行为在兼容窗口内仍可运行。

建议目标命令：

```bash
pnpm --filter @vitamin/shared test
pnpm --filter @vitamin/service test
pnpm --filter @vitamin/opendev-ui build
pnpm --filter @vitamin/tools test
pnpm --filter @vitamin/mcp test
pnpm typecheck
```

如果全仓测试受沙箱网络、端口或用户目录写入影响失败，必须记录：

- 失败命令
- 失败原因
- 是否与当前 TODO 相关
- 非沙箱或 mock 后的复核结果

## 阶段完成标准

- 所有 TODO 行状态为 Done，完成百分比为 100%。
- 每个 TODO 的“完成时设计核对”都补充最终输入输出、实现路径、测试证据和剩余风险。
- `pnpm typecheck` 通过。
- 相关包级测试通过。
- 不新增违反依赖方向的公共依赖：应用层不能被核心能力层依赖。
- 文档更新：本文件、源审计 RFC、必要的 package README/DESIGN 同步更新。

## 状态更新规则

- `状态` 只能使用 `Not Started`、`In Progress`、`Done`。
- `测试通过` 只能使用 `Pass`、`Fail`、`Not Run`。
- `完成百分比` 使用保守整数。
- 只有实现、测试和设计核对均满足时，单项才能标为 100%。
- 阶段总完成百分比按 TODO 行百分比算术平均并四舍五入计算；当前为 9 项中 9 项 100%，总完成百分比为 100%。
- 25% 门槛以四舍五入后的阶段总完成百分比判断。
- 修改任一 TODO 百分比前，必须先读取对应实现和测试，不得只基于计划调整。

进度计算命令：

```sh
TODO_FILE=docs/rfc/module-abstraction-implementation-todos.md
awk -F'|' '
/\| MA-[0-9]+ / {
  gsub(/ /, "", $4);
  gsub(/%/, "", $4);
  sum += $4;
  count += 1
}
END {
  if (count == 0) {
    printf "count=0 sum=0 average=0.00 rounded=0\n"
  } else {
    printf "count=%d sum=%d average=%.2f rounded=%d\n", count, sum, sum / count, int(sum / count + 0.5)
  }
}' "$TODO_FILE"
```

## RFC-to-TODO 执行记录

- 2026-05-02：读取 `docs/rfc/module-abstraction-audit.md` 和既有 `vitamin-vs-claude-code-implementation-todos.md` 格式，将全仓抽象审计转换为 MA 阶段实施 TODO 跟踪器。当前为计划文档生成，未执行代码实现和测试。
- 2026-05-02 18:20 Asia/Shanghai：完成 MA-01。新增 `@vitamin/shared/browser/data` browser-safe data helpers，迁移 UI websocket/MCP/stores 和 service inbound router 重复 helper；刷新 `pnpm-lock.yaml` 和 shared dist。验证：目标 vitest 3 个文件 17 项通过，`@vitamin/opendev-ui` build 通过，`pnpm typecheck` 通过。
- 2026-05-02 18:27 Asia/Shanghai：完成 MA-02。新增 `packages/opendev-ui/src/api/core.ts`，迁移 UI REST API 文件到统一 request/error/json/camelCase helper，保留 404/fallback 等端点特殊语义。验证：`pnpm --filter @vitamin/opendev-ui build` 通过，`pnpm typecheck` 通过。
- 2026-05-02 19:32 Asia/Shanghai：完成 MA-03。新增 `@vitamin/protocol` package，抽出 WebSocket server/client message 类型、连接状态、协议 validator 与测试。验证：protocol build/typecheck 通过，协议 vitest 1 个文件 3 项通过，`pnpm typecheck` 通过且 Nx 已识别 22 个项目。
- 2026-05-02 19:41 Asia/Shanghai：完成 MA-04。service 类型和 validator 兼容入口改为引用 `@vitamin/protocol`，UI WebSocket 事件名接入 protocol 类型并保留现有宽松 data 兼容层，package 依赖和 lockfile 已刷新。验证：目标 vitest 3 个文件 17 项通过，service typecheck/build 通过，opendev-ui build 通过，`pnpm typecheck` 通过。
- 2026-05-02 19:47 Asia/Shanghai：完成 MA-05。新增 `@vitamin/schema` package，抽出 Zod validation wrapper 和 JSON Schema -> Zod 转换；tools validator 改为 schema re-export，mcp adapter 复用 schema 转换；补 vitest alias。验证：schema build/typecheck 通过，目标 vitest 4 个文件 32 项通过，tools/mcp typecheck/build 通过，`pnpm typecheck` 通过且 Nx 已识别 23 个项目。
- 2026-05-02 19:57 Asia/Shanghai：完成 MA-06。新增 `@vitamin/manifest` package，抽出 Markdown YAML frontmatter 解析、序列化和 typed diagnostics；skill parser 和 layered memory 迁移到 manifest parser/serializer，`@vitamin/skill` 移除残留 `yaml` 直依赖；Plugin JSON manifest 因字段域不同暂不迁移。验证：manifest build/typecheck 通过，目标 vitest 3 个文件 28 项通过，skill/memory typecheck/build 通过，`pnpm typecheck` 通过且 Nx 已识别 24 个项目；依赖清理后 `pnpm install --no-frozen-lockfile`、skill typecheck/build 通过。
- 2026-05-02 19:58 Asia/Shanghai：完成 MA-07。MCP 行为测试迁到 `@vitamin/mcp` 权威入口，`packages/tools/src/mcp/*` 固化为 compatibility re-export，并补齐 transport factory、adapter helper 与完整类型导出；新增兼容测试防止 tools MCP 出口与 `@vitamin/mcp` 漂移。验证：目标 vitest 6 个文件 72 项通过，mcp/tools typecheck/build 通过，`pnpm typecheck` 通过。
- 2026-05-02 20:06 Asia/Shanghai：完成 MA-08。扩展 `@vitamin/shared` typed error 基类，补 metadata/retryable/serialize/toJSON；session 跨包边界迁为 `SessionError` 并新增 shared 依赖；tools web URL 安全边界迁为 `ToolError` 并保留原 message。验证：目标 vitest 4 个文件 114 项通过，shared/session/tools typecheck/build 通过，`pnpm typecheck` 通过。
- 2026-05-02 20:13 Asia/Shanghai：完成 MA-09。新增 `@vitamin/shared/runtime`，抽出 abort-aware sleep、withTimeout、limitConcurrency 和 runtime typed errors；agent concurrency 旧入口改为 shared 兼容 re-export，orchestrator executor 复用 shared timeout/backoff sleep，并修复取消 retry backoff 时的后台 promise 泄漏风险。验证：目标 vitest 3 个文件 32 项通过，shared/agent/orchestrator typecheck/build 通过，`pnpm typecheck` 通过。
