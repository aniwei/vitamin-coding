# X-Mars 借鉴 Claude Code 最小颗粒功能实施方案

> 阶段：VCCG（X-Mars Claude Code Granularity Gap）
> 设计来源：[`docs/rfc/x-mars-vs-claude-code-min-granularity.md`](./x-mars-vs-claude-code-min-granularity.md)
> 对比来源：`https://github.com/aniwei/Claude-Code.git`，HEAD `b78dd22a091b717c8938ab98c736bc04825a8ee8`
> 更新时间：2026-05-02

## 阶段摘要

本阶段将 X-Mars 与 Claude Code 的最小颗粒度对比结论转为可执行实施账本。实施策略不是复刻 Claude Code 单体架构，而是把 Claude Code 已经打磨过的行为颗粒接入 X-Mars 现有包边界：`@x-mars/prompt`、`@x-mars/coding`、`@x-mars/agent`、`@x-mars/tools`、`@x-mars/mcp`、`@x-mars/skill`、`@x-mars/hooks`、`@x-mars/cli`、`@x-mars/service`。

优先顺序遵循三个原则：

1. 先做可观测性和边界重构，再做生态扩展。
2. 先把已有底层能力产品化，再新增大功能。
3. 所有高风险能力（插件、MCP、shell、远程控制）必须先有权限/信任/审计闭环。

## 状态

- 阶段状态：Done
- 总完成百分比：100%
- 最新测试状态：Pass
- 最新测试命令：`pnpm typecheck`；`pnpm vitest run packages/service/tests/websocket-manager.test.ts packages/service/tests/inbound-router.test.ts`；`pnpm --filter @x-mars/service typecheck`；`pnpm --filter @x-mars/service build`；`pnpm --filter @x-mars/opendev-ui build`
- 最新测试结果：2026-05-02 18:07 Asia/Shanghai，`pnpm typecheck` 通过，Nx 成功运行 21 个项目 typecheck 目标及 18 个依赖任务（其中 19/39 任务命中缓存）；此前 2026-05-02 18:03 Asia/Shanghai，目标测试 2 个文件 14 项通过，`@x-mars/service` typecheck/build 和 `@x-mars/opendev-ui` build 通过。`@x-mars/opendev-ui` 无单独 typecheck 脚本，build 已执行 `tsc && vite build`；Vite 仅提示大 chunk warning。
- 依赖项：`@x-mars/prompt` prompt 组装、`@x-mars/coding` session/runtime、`@x-mars/agent` tool loop、`@x-mars/tools` registry/plugin manifest、`@x-mars/mcp` manager/client、`@x-mars/skill` registry、`@x-mars/hooks` permission/hook registry、`@x-mars/cli` 命令入口。
- 执行策略：按 Milestone A-E 分阶段推进；每个 TODO 必须先补测试，再接入 runtime，最后补诊断入口。

## 设计与验收链接

- RFC：[`docs/rfc/x-mars-vs-claude-code-min-granularity.md`](./x-mars-vs-claude-code-min-granularity.md)
- 既有 RFC-to-TODO 参考：[`docs/rfc/claude-code-agent-framework-todos.md`](./claude-code-agent-framework-todos.md)
- Prompt：`packages/prompt/src/prompt-manager.ts`、`packages/prompt/prompts/lead-guidance.md`、`packages/coding/src/session/agent-session.ts`
- System prompt hooks：`packages/coding/src/hooks/tool-guidance.ts`、`packages/coding/src/hooks/environment-injection.ts`、`packages/coding/src/hooks/phase-tracking.ts`、`packages/coding/src/hooks/lesson-injection.ts`
- Agent/tool loop：`packages/agent/src/work-loop.ts`、`packages/agent/src/deferred-tools.ts`、`packages/agent/src/tool-partitioner.ts`
- MCP：`packages/mcp/src/*`、`packages/tools/src/mcp/*`
- Skill：`packages/skill/src/*`、`packages/tools/src/skill/*`
- Plugin：`packages/tools/src/plugin-manifest.ts`、`packages/tools/src/tool-registry.ts`
- CLI/service：`packages/cli/src/cli.ts`、`packages/service/src/*`

## 启动检查清单

- [x] 已读取最小颗粒度对比 RFC。
- [x] 已核对现有 RFC-to-TODO 跟踪器格式。
- [x] 已确认本实施方案不覆盖既有 RFC。
- [x] 开始实现前，重新读取目标模块当前代码，避免基于过期结论修改。
- [x] 每个 TODO 开工前补充目标测试文件列表。
- [x] 每个 TODO 完成前记录测试命令、测试结果、剩余风险。

## 参考依据与需求方案设计备注

本节按 `rfc-to-todos` 方法论记录每个需求簇的方案设计证据。实施前如发现当前代码与备注不一致，必须先更新本节或对应 TODO 的“完成时设计核对”。

| 需求簇               | 要解决的问题                                                                                             | 期望结果                                                                                       | 约束与边界                                                                                          | 方案选择                                                                     | 放弃方案                                     | 验证方式                                                          |
| -------------------- | -------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | -------------------------------------------- | ----------------------------------------------------------------- |
| Prompt section 化    | 当前 system prompt 是字符串拼接，缺少 section、cacheability、诊断边界                                    | 调用方能知道每段 prompt 的来源、层级、是否可缓存、token 估算和 fingerprint                     | 不能一次性破坏 `assemblePreset(): Promise<string>`、`AgentSession.systemPrompt: string` 和现有 hook | 新增旁路 `PromptAssembly`，旧 API 渲染为 string，新 hook 操作 section array  | 直接替换所有 prompt 为 `string[]`，风险过高  | prompt 单测、coding session 集成测试、`/context` diagnostics      |
| Prompt 内容借鉴      | Claude Code 有 session/tool/MCP/skill/memory/output-style 等内容块，X-Mars 多数内容散落在固定模板或 hook | X-Mars 拥有 static/session/dynamic 三层 prompt 内容，MCP/Skill/deferred tools 成为一等 section | 不复刻 Claude Code 完整文案；保持 X-Mars 中文 lead-guidance 与 profile 体系                         | 复用现有 prompt 文案，新增 section key 和 source metadata                    | 把所有内容塞回 lead-guidance，无法调试和缓存 | section snapshot 测试、禁用工具/MCP/skill 时 section 条件变化测试 |
| 工具 metadata 与并发 | 工具数量增加后，缺少统一 metadata 覆盖率和输入级只读判断                                                 | 每个工具有 category/guideline/defer/readonly；tool loop 能基于 input 安全并发                  | permission hook 仍是最终安全边界；未知命令保守处理                                                  | 增量扩展 `AgentTool` 可选函数和 ToolRegistry 覆盖率测试                      | 仅靠工具级 `isReadOnly`，无法判断 bash 输入  | partitioner 单测、bash 只读/危险命令负向测试                      |
| MCP 一等化           | X-Mars MCP 骨架完整，但 resource/prompt/instructions/auth/trust 产品入口弱                               | Agent 能发现和读取 MCP resources/prompts，server instructions 进入 prompt section              | 不能依赖真实外部 MCP 服务；测试必须 fake server/client                                              | 新增 MCP resource/prompt 工具和 dynamic prompt section，后续再做 delta       | 先做 OAuth/marketplace，基础入口未稳前收益低 | fake MCP list/read/get/instructions/list_changed 测试             |
| Skill 一等化         | Skill registry 已有，但默认生态、搜索、创建/改进闭环不足                                                 | Skill catalog 注入、`skill_search/create/improve` 可用，skill 正文按需加载                     | 不让大量 skill 正文污染初始 context；生成文件需校验 frontmatter                                     | catalog 只注入摘要，正文通过工具加载；learn 可作为 create/improve 的经验来源 | 每次全量注入 skill body，token 成本高        | skill parser/registry/tool 集成测试、生成合法性测试               |
| Plugin 闭环          | 当前 plugin manifest 是库能力，不是可启停、可信任、可热刷新的 runtime 能力                               | XMarsApp 能加载本地插件，CLI 能管理，危险权限需信任确认                                        | marketplace 暂缓；动态 import 必须限制在 plugin root 内                                             | 先做 PluginManager + local roots + trust gate，再做 marketplace              | 直接接远程 marketplace，安全面过大           | plugin loader/trust/disable/reload/stale cleanup 测试             |
| 长上下文恢复         | 已有预算/压缩能力，但 prompt-too-long 错误恢复和压缩后 e2e 证据不足                                      | PTL 后自动选择策略重试，压缩后工具/文件/计划/MCP/Skill 状态可继续                              | 最大重试次数必须固定，避免无限循环；不能吞掉最终错误                                                | preflight budget 保留，reactive compact 作为错误恢复层                       | 只靠预压缩，无法处理模型端真实 PTL           | fake provider PTL 测试、post-compact e2e                          |
| Bridge 稳定性        | X-Mars service/ws 有基础桥接，但缺少明确 bridge 边界和重连状态机                                         | 本地 Web bridge 可靠，断线可恢复，审批链路不中断                                               | 不做 Claude Code 云端 Teleport/Ultraplan；先限定本地服务边界                                        | keepalive + 指数退避 + 状态事件 + permission callback                        | 直接设计云端 remote bridge，产品边界不清     | websocket manager/service/UI 集成测试                             |

## TODO 表

| ID      | 状态 | 完成百分比 | 测试通过 | 文件/模块                                                                                                                                                                                                                                                                                                                                                                                                                                 | 功能介绍                                                                                                                                                                                               | 完成时设计核对                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ------- | ---- | ---------: | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| VCCG-01 | Done |       100% | Pass     | `packages/prompt/src/types.ts`、`packages/prompt/src/prompt-assembly.ts`、`packages/prompt/src/prompt-manager.ts`、`packages/hooks/src/types.ts`、`packages/hooks/src/hook-spec.ts`、`packages/hooks/src/hook-registry.ts`、`packages/coding/src/session/agent-session.ts`、`packages/coding/src/hooks/*`、`vitest.config.ts`                                                                                                             | PromptSection 与 PromptAssembly：把当前单字符串 system prompt 升级为 section 化组装模型，支持 `static/session/dynamic` layer、`cacheable`、`source`、`priority`、fingerprint 和 diagnostics。          | 已实现输入/输出：`PromptManager.assemblePresetSections()` 输出 `PromptAssembly`，旧 `assemble()` / `assemblePreset()` 仍返回 string；`AgentSession.promptRefresh` 兼容 string 或 `PromptAssembly`；新增 `system-prompt.sections.transform`，并保留旧 `system-prompt.transform` 在 section 渲染后执行。已迁移 tool/environment/phase/lesson hook 使用 section 追加。测试覆盖 section 排序、cacheable/static/dynamic 拆分、subagent profile metadata、hook registry 执行、AgentSession section hook 与 legacy hook 顺序。剩余风险：尚未实现 provider 级 cache_control 传递和 `/context` 诊断入口，分别留给 VCCG-02/VCCG-03。                                                                                                                                                                                                                                                                             |
| VCCG-02 | Done |       100% | Pass     | `packages/ai/src/types.ts`、`packages/ai/src/provider/anthropic.ts`、`packages/agent/src/types.ts`、`packages/agent/src/work-loop.ts`、`packages/agent/src/agent.ts`、`packages/coding/src/session/agent-session.ts`                                                                                                                                                                                                                      | Prompt cache 边界与诊断：借鉴 Claude Code static/dynamic boundary，把 PromptAssembly 拆为 staticPrefix/dynamicTail，并向 Anthropic provider 传递 cache metadata。                                      | 已实现输入/输出：`AgentSession` 将 `PromptAssembly` 转为 `PromptCacheMetadata`，`AgentRunContext -> WorkLoopContext -> StreamContext` 透传 `promptCache`；`work-loop` 基于 active tool definitions 计算 `toolSchemaFingerprint`；Anthropic provider 使用 `buildSystemWithPromptCache()` 仅对 `staticPrefix` 加 `cache_control`，`dynamicTail` 和 legacy suffix 保持非缓存 block。diagnostics 只传 section key/layer/source/token/fingerprint 结构，不进入普通日志。测试覆盖 static/dynamic cache boundary、legacy suffix 不污染 static cache、工具列表变化触发 tool schema fingerprint 变化、agent loop 兼容。剩余风险：真实 Anthropic cache 命中率仍需后续接 `/context`/运行时 telemetry 可视化。                                                                                                                                                                                                     |
| VCCG-03 | Done |       100% | Pass     | `packages/coding/src/session/types.ts`、`packages/coding/src/session/agent-session.ts`、`packages/coding/src/modes/run-modes.ts`、`packages/service/src/routes/sessions.ts`、`packages/coding/src/index.ts`                                                                                                                                                                                                                               | `/context` 与 prompt diagnostics：提供 CLI/debug API 展示最终上下文结构、section keys、layer、source、token 估算、cacheable 状态和 tool/deferred/MCP/skill 概览。                                      | 已实现输入/输出：`AgentSession.getContextDiagnostics({ includePrompt })` 返回 session/model/message/tool/runtime/prompt section 结构；interactive CLI 支持 `/context` 和 `/context --show-prompt`；service 支持 `GET /api/sessions/:id/context` 与 `GET /api/sessions/current/context?includePrompt=true`。默认输出不包含 system prompt 正文，仅显式 `includePrompt` / `--show-prompt` 返回正文。测试覆盖指定 session、active session、缺失 session、默认脱敏、显式正文、section diagnostics。剩余风险：MCP/Skill/Plugin 的一等化摘要会在 VCCG-06/VCCG-07/VCCG-08 后扩展进同一 diagnostics 结构。                                                                                                                                                                                                                                                                                                      |
| VCCG-04 | Done |       100% | Pass     | `packages/tools/src/types.ts`、`packages/tools/src/tool-registry.ts`、`packages/tools/src/index.ts`、`packages/coding/src/hooks/tool-guidance.ts`                                                                                                                                                                                                                                                                                         | 工具 metadata 覆盖与 deferred prompt section：补齐每个内置工具的 category、guideline/snippet、readonly/defer 元数据，并生成 `tool-availability`、`tool-guidelines`、`deferred-tools` prompt sections。 | 已实现输入/输出：`ToolRegistry` 注册时将 `shouldDefer` 归一为 boolean；新增 `buildToolAvailability()`、`buildDeferredToolsGuidance()` 和 `getMetadataCoverage()`；`createToolGuidanceHook()` 现在注入 `tool-availability`、`deferred-tools`、`tool-guidance` 三个 session/cacheable prompt sections。deferred section 仅列出名称、分类、描述和 `tool_search` 用法，不暴露完整 schema；完整 schema 仍通过 `tool_search` 运行时加载。测试覆盖 metadata coverage 100%、缺失 metadata 负向、availability/deferred section、有/无 deferred、builtin full preset、`tool_search` select/关键词、hook 注入 section。剩余风险：输入级只读/并发判断仍在 VCCG-05。                                                                                                                                                                                                                                                |
| VCCG-05 | Done |       100% | Pass     | `packages/agent/src/types.ts`、`packages/agent/src/tool-capabilities.ts`、`packages/agent/src/tool-partitioner.ts`、`packages/agent/src/tool-executor.ts`、`packages/tools/src/shell/bash.ts`、`packages/mcp/src/mcp-tool-adapter.ts`、`packages/mcp/src/types.ts`                                                                                                                                                                        | 输入敏感的只读并发判断：从工具级 readonly 升级到 `isReadOnly(input)` / `isConcurrencySafe(input)`，优先覆盖 bash、web、fs、MCP adapter。                                                               | 已实现输入/输出：`AgentTool` 新增 `isReadOnly(params)` 与 `isConcurrencySafe(params)`，`readonly` boolean/function 保持兼容；`tool-partitioner` 先看 `isConcurrencySafe`，否则回退只读判定；`tool-executor` 用同一只读判定跳过启发式 side-effect。`bash` 新增保守 allowlist：`git status/diff/log/show/branch/rev-parse/ls-files/grep`、`rg`、`ls`、`cat`、`find` 等只读命令可并发；`rm`、写重定向、`git reset`、未知命令保守串行。MCP adapter 将 `annotations.readOnlyHint=true` 且 `destructiveHint!==true` 映射为 readonly/concurrency safe；fs/web 既有 readonly 元数据继续走兼容路径。测试覆盖新旧字段优先级、异常降级串行、Bash 只读/危险命令、MCP annotations 和执行器 side-effect 过滤。剩余风险：shell 分类仍是保守启发式，不替代 permission hook；复杂 shell 语法默认 false。                                                                                                                |
| VCCG-06 | Done |       100% | Pass     | `packages/mcp/src/types.ts`、`packages/mcp/src/mcp-client.ts`、`packages/mcp/src/mcp-manager.ts`、`packages/mcp/src/mcp-agent-tools.ts`、`packages/mcp/src/index.ts`、`packages/tools/src/mcp/index.ts`、`packages/tools/src/register-builtin.ts`、`packages/coding/src/hooks/mcp-injection.ts`、`packages/coding/src/app/x-mars-app.ts`、`packages/coding/src/types.ts`                                                                  | MCP 一等化：补 MCP resources/prompts tools、server instructions prompt section、list_changed 热刷新、pending call 超时/清理。                                                                          | 已实现输入/输出：新增 `mcp_list_resources`、`mcp_read_resource`、`mcp_list_prompts`、`mcp_get_prompt` 四个只读/可并发 AgentTool，并通过 `RegisterBuiltinOptions.mcpManager` 以 full/deferred/mcp 类别注册；`XMarsAppOptions.mcpManager` 接入后会注册 MCP 工具并注入 `mcp-context` dynamic prompt section。`McpInitializeResult.instructions` 被 `McpClient.getInstructions()`、`McpManager.getServerInstructions()` 聚合进入 prompt；`notifications/prompts/list_changed` 现在会刷新 prompts 并触发 `prompts.changed`，resources/tools 继续保留既有 list_changed 热刷新。pending request 仍沿用现有 request timeout 和 disconnect 清理路径。测试覆盖 MCP agent tools list/read/get/error、MCP manager/client 既有连接与错误路径、MCP context section 注入。剩余风险：本轮提供 manager 注入点，不自动从 settings 连接 MCP server；真实 MCP 配置生命周期可并入 VCCG-08/09 插件闭环或后续 settings 集成。 |
| VCCG-07 | Done |       100% | Pass     | `packages/skill/src/types.ts`、`packages/skill/src/skill-registry.ts`、`packages/skill/src/index.ts`、`packages/tools/src/skill/skill-search.ts`、`packages/tools/src/skill/skill-create.ts`、`packages/tools/src/skill/skill-improve.ts`、`packages/tools/src/register-builtin.ts`、`packages/tools/src/index.ts`、`packages/coding/src/hooks/skill-catalog.ts`、`packages/coding/src/app/x-mars-app.ts`、`packages/coding/src/types.ts` | Skill 一等化：补 `skill_search`、`skill_create`、`skill_improve`，并把 Skill catalog 作为 prompt section 注入。                                                                                        | 已实现输入/输出：`SkillProvider` 扩展可选 `search/create/improve/catalog`；`SkillRegistry` 实现 search、创建项目级 `.x-mars/skills/<name>/SKILL.md`、改进时保留原内容并追加 `Improvement Log`，失败会回滚；新增 `skill_search`、`skill_create`、`skill_improve` 工具并与 `skill_load/skill_execute` 一起注册为 full/deferred/skill 类别；`XMarsApp` 不再无条件卸载 skill 工具，且当 provider 提供 `catalog()` 时注入 `skill-catalog` session/cacheable prompt section。catalog 只包含 name/description/trigger，不注入正文；正文仍通过 load/execute 按需进入上下文。测试覆盖 registry 创建/搜索/改进、工具回调、builtin 注册和 catalog prompt section。剩余风险：默认未配置 `skillProvider` 时工具会返回“未配置”；真实 SkillRegistry 初始化/discover 仍需由上层创建并传入。                                                                                                                            |
| VCCG-08 | Done |       100% | Pass     | `packages/tools/src/plugin-manager.ts`、`packages/tools/src/plugin-manifest.ts`、`packages/tools/src/tool-registry.ts`、`packages/tools/src/index.ts`、`packages/coding/src/app/x-mars-app.ts`、`packages/coding/src/types.ts`                                                                                                                                                                                                            | PluginManager 与插件工具加载：把当前 manifest/runtime plan 函数接入 XMarsApp 生命周期，支持扫描 plugin roots、动态 import `tools[].module/exportName` 并注册 AgentTool。                               | 已实现输入/输出：新增 `PluginManager`，可扫描 `pluginRoots` 下的 `plugin.json` / `x-mars-plugin.json`，按 manifest 动态 import `tools[].module`，默认读取 default export，也支持 `exportName`；导入路径必须 resolve 在 plugin root 内，导出对象必须是合法 `AgentTool` 且名称与 manifest 匹配。注册时写入 `metadata.pluginId`、category、preset、shouldDefer；单个插件加载失败只进入 diagnostics/errors，不阻断其他插件或 App 启动；`unloadAll()` 只卸载当前插件拥有的 tool。`XMarsAppOptions.pluginRoots` 接入 start/stop 生命周期，start 后加载插件并同步权限策略，stop 时卸载插件工具。测试覆盖有效插件工具、无效 module 不阻断、越界 module 拒绝、卸载 unregister、App start/stop 集成。剩余风险：本轮只做 tool 加载闭环；插件 hooks/commands/agents 和 trust gate 留给 VCCG-09。                                                                                                                   |
| VCCG-09 | Done |       100% | Pass     | `packages/tools/src/plugin-manifest.ts`、`packages/tools/src/plugin-manager.ts`、`packages/tools/src/index.ts`、`packages/cli/src/cli.ts`                                                                                                                                                                                                                                                                                                 | 插件 hooks、commands 与信任模型：manifest 增加 hooks/commands/agents 字段，首次启用危险权限插件时要求确认，并提供 `/plugin list/enable/disable/reload`。                                               | 已实现输入/输出：manifest 支持 `hooks[]`、`commands[]`、`agents[]` 并进入 summary/runtime plan/lifecycle steps；`PluginManager` 新增 `trustedPluginIds`、`disabledPluginIds`、`trust/untrust/enable/disable/reloadAll`，危险权限（除 `tools` 外的 `shell/network/filesystem/mcp/skills`）、hooks、MCP server 均需 trust 才加载。可信插件可动态 import hook module 并注册到 `HookRegistry`，disable/unload 会注销插件 hook/tool；commands/agents 先进入 manifest/lifecycle diagnostics，为后续实际命令执行预留结构。CLI 增加 `x-mars plugin list                                                                                                                                                                                                                                                                                                                                                        | enable <id>                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | disable <id> | reload`基础入口，默认扫描`.x-mars/plugins`。测试覆盖 manifest 新字段、未信任阻断、可信 hook 加载/卸载、plugin disable、旧插件工具加载和 App 集成。剩余风险：trust 状态目前是运行时内存态，尚未持久化到 settings；commands/agents 只做声明与 diagnostics，实际执行入口可在后续 CLI/UI 工作中扩展。 |
| VCCG-10 | Done |       100% | Pass     | `packages/agent/src/types.ts`、`packages/agent/src/work-loop.ts`、`packages/agent/src/agent.ts`、`packages/hooks/src/types.ts`、`packages/coding/src/session/agent-session.ts`、`packages/agent/tests/agent-loop.test.ts`、`packages/coding/tests/auto-compaction-hook.test.ts`                                                                                                                                                           | Reactive compact 与 PTL 恢复：在模型调用遇到 prompt-too-long/context-too-long 后自动执行 snip/prune/micro/full compact 重试，并保留 post-compact restore。                                             | 已实现输入/输出：`ContextTransform` 支持返回 `{ messages, metadata }`，并接收 `reason: preflight                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | prompt-too-long`、`attempt`、`tokenCount`、`error`；work loop 默认最多 2 次 reactive PTL 恢复，可由 `maxPromptTooLongRetries`覆盖。PTL 后调用现有`messages.transform`管线执行 snip/prune/micro/full compact，写回当前 loop messages 并重试；若压缩无变化或超过最大次数，保留原`PromptTooLongError` 失败。`compaction_needed` 事件记录 attempt、maxAttempts、before/after count、provider tokenCount、model contextWindow threshold 和 hook metadata，包含 auto-compaction 的 strategies/tokensSaved。测试覆盖 fake provider 抛 PTL 后恢复重试、metadata 透传、状态写回、超过次数失败；auto-compaction hook 既有策略 metadata 测试保持通过。剩余风险：session 持久化层的 deferred tools/recent files/todos/skills/MCP 端到端恢复仍留给 VCCG-11。 |
| VCCG-11 | Done |       100% | Pass     | `packages/memory/src/state-restoration.ts`、`packages/memory/src/memory-manager.ts`、`packages/memory/src/index.ts`、`packages/memory/tests/state-restoration.test.ts`、`packages/memory/tests/post-compact-restore-e2e.test.ts`                                                                                                                                                                                                          | Post-compact restore 端到端验证：覆盖 `tool_search -> read/edit -> compact -> continue`，确保 deferred tools、recent files、todos、skills、MCP state 在压缩后恢复。                                    | 已实现输入/输出：`collectRestorationState()` 在原有 recent files、deferred tools、MCP tool usage 基础上补齐 `write_todos` 活跃 TODO 与 `skill_*` 工具调用识别；`RestorationState` 新增 `activeTodos`，`buildRestorationMessage()` 输出 `[Active Todos]`。`MemoryManager.getRestorationState()` 改为深拷贝数组字段，避免外部污染恢复快照。端到端测试真实执行 `MemoryManager.process()` 的 full compaction，验证压缩后消息序列为 summary + post-compaction restoration + preserved continuation，并断言 deferred tool、read/edit 文件、TODO、skill、active plan、MCP server/tool 状态均恢复。剩余风险：这是 memory 层 E2E，不覆盖真实 AgentSession UI 展示；VCCG-12 会继续覆盖 service/ws 侧稳定性。                                                                                                                                                                                                     |
| VCCG-12 | Done |       100% | Pass     | `packages/service/src/types.ts`、`packages/service/src/websocket-manager.ts`、`packages/service/src/ws-protocol.ts`、`packages/service/tests/websocket-manager.test.ts`、`packages/opendev-ui/src/api/websocket.ts`、`packages/opendev-ui/src/types/index.ts`                                                                                                                                                                             | Bridge/WS 稳定性定义与重连状态机：明确 X-Mars 的 bridge 边界，先做本地 Web bridge 的 keepalive、指数退避、状态事件和远程审批通道。                                                                     | 已实现输入/输出：正式定义 `Runtime.connectionState` 服务端事件，状态包含 `connecting/connected/reconnecting/disconnected/stale`、timestamp、attempt、delayMs、queuedCommands；`WebSocketManager` 连接后发送 `Runtime.connected` 与 `Runtime.connectionState(connected)`，pong 和任意有效 client message 都刷新 `lastSeenAt/isAlive`，stale client 统一通过 `removeClient()` 清理连接与 session subscription。前端 WebSocket client 保留指数退避重连，新增 connectionState 本地事件、断线命令队列、重连后 flush、pong timeout 主动断开重连，审批/ask/plan/review 等 callback 在短暂断线期间不会直接丢失。测试覆盖 Runtime connectionState 协议校验、stale client 清理 session subscription、既有 inbound route 与 outbound validation。剩余风险：本轮限定本地 Web bridge，不实现 Claude Code 云端 Teleport；UI 侧以 build 验证为主，未新增浏览器自动化测试。                                            |

## 里程碑计划

### Milestone A：可观测上下文与 Prompt 基建

目标：让 X-Mars 能解释“最终 prompt 是怎么来的、哪些内容可缓存、哪些内容每轮变化”。

- VCCG-01 PromptSection 与 PromptAssembly
- VCCG-02 Prompt cache 边界与诊断
- VCCG-03 `/context` 与 prompt diagnostics

完成标准：

- `PromptManager` 同时支持旧字符串 API 和新 section API。
- `AgentSession.prompt()` 能消费 PromptAssembly。
- `/context` 可显示 section 结构，不泄露敏感正文。
- 相关 prompt/coding/ai 单测通过。

### Milestone B：工具体系补齐

目标：把工具可用性、延迟加载和并发安全变成可测契约。

- VCCG-04 工具 metadata 覆盖与 deferred prompt section
- VCCG-05 输入敏感的只读并发判断

完成标准：

- 内置工具 metadata 覆盖率 100%。
- deferred tool 只能通过 tool_search 激活。
- tool partitioner 基于 input 级只读判断分批。

### Milestone C：MCP / Skill 一等化

目标：把 MCP 和 Skill 从“框架存在”推进到“Agent 可发现、可使用、可调试”。

- VCCG-06 MCP 一等化
- VCCG-07 Skill 一等化

完成标准：

- MCP resources/prompts 有工具或命令入口。
- MCP instructions 和 Skill catalog 进入 prompt sections。
- Skill search/create/improve 有工具和测试。

### Milestone D：插件闭环

目标：把 plugin manifest 从库函数升级为可启停、可信任、可热刷新的运行时能力。

- VCCG-08 PluginManager 与插件工具加载
- VCCG-09 插件 hooks、commands 与信任模型

完成标准：

- XMarsApp 启动时可加载本地插件。
- 插件 tool/skill/MCP/hook/command 至少覆盖 tool+hook+MCP 三类。
- CLI 可 list/enable/disable/reload。
- 危险权限插件未经信任不加载。

### Milestone E：长上下文与 Bridge 稳定性

目标：补齐长上下文错误恢复和本地 bridge 可靠性。

- VCCG-10 Reactive compact 与 PTL 恢复
- VCCG-11 Post-compact restore 端到端验证
- VCCG-12 Bridge/WS 稳定性定义与重连状态机

完成标准：

- Prompt-too-long 能自动恢复或给出结构化失败。
- 压缩后 deferred tools/recent files/todos/MCP/skills 可恢复。
- 本地 Web bridge 断线可恢复，审批链路不中断。

## 实施顺序

1. VCCG-01：先做 PromptSection 数据结构和兼容 API。
2. VCCG-03：尽早做 `/context`，为后续所有 prompt/MCP/skill/plugin 调试提供入口。
3. VCCG-04：补工具 metadata，减少 prompt section 和 ToolSearch 的盲区。
4. VCCG-06 / VCCG-07：并行补 MCP 和 Skill 的一等 prompt/tool 入口。
5. VCCG-08 / VCCG-09：在 trust gate 明确后再接插件加载。
6. VCCG-10 / VCCG-11：最后补长上下文错误恢复，避免在不可观测状态下改核心 loop。
7. VCCG-12：与 Web UI/service 改动窗口合并推进。

## 测试策略

每个 TODO 至少满足：

- 单元测试：核心纯函数、schema、状态转换。
- 集成测试：跨包调用链，例如 `PromptManager -> AgentSession -> Provider`。
- 负向测试：权限、信任、越界路径、失效 MCP、坏插件、坏 skill。
- 兼容测试：旧 API/旧配置仍可运行。

建议目标命令：

```bash
pnpm --filter @x-mars/prompt test
pnpm --filter @x-mars/agent test
pnpm --filter @x-mars/tools test
pnpm --filter @x-mars/mcp test
pnpm --filter @x-mars/skill test
pnpm --filter @x-mars/coding test
pnpm --filter @x-mars/service test
pnpm typecheck
pnpm test
```

如果全仓测试受沙箱网络、端口或用户目录写入影响失败，必须记录：

- 失败命令
- 失败原因
- 是否与当前 TODO 相关
- 非沙箱或 mock 后的复核结果

## 阶段完成标准

- 所有 TODO 行状态为 Done，完成百分比为 100%。
- 每个 TODO 的“完成时设计核对”都补充最终实现路径、测试证据和剩余风险。
- `pnpm typecheck` 通过。
- 相关包级测试通过。
- 高风险能力必须有负向测试：插件信任、MCP 网络/认证、shell 只读判断、prompt diagnostics 脱敏、PTL 重试上限。
- 文档更新：本文件、源 RFC、必要的 package README/DESIGN 同步更新。

## 状态更新规则

- `状态` 只能使用 `Not Started`、`In Progress`、`Done`。
- `测试通过` 只能使用 `Pass`、`Fail`、`Not Run`。
- `完成百分比` 使用保守整数。
- 只有实现、测试和设计核对均满足时，单项才能标为 100%。
- 阶段总完成百分比按 TODO 行百分比算术平均并四舍五入计算；当前为 12 项中 12 项 100%，总完成百分比为 100%。
- 修改任一 TODO 百分比前，必须先读取对应实现和测试，不得只基于计划调整。

进度计算命令：

```sh
TODO_FILE=docs/rfc/x-mars-vs-claude-code-implementation-todos.md
awk -F'|' '
/\| VCCG-[0-9]+ / {
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

证据记录格式：

```text
- YYYY-MM-DD HH:mm TZ：推进 `VCCG-xx`，实现 <能力>；输入/输出接口为 <...>；测试命令 `<command>`，结果 <Pass/Fail>；剩余风险 <...>。
```

## 风险与约束

| 风险                                     | 影响 | 约束                                     |
| ---------------------------------------- | ---- | ---------------------------------------- |
| Prompt section 改动影响所有模型调用      | 高   | 先双轨兼容 string 和 PromptAssembly      |
| Plugin 动态加载扩大安全面                | 高   | 先 trust gate，再 loader，再 marketplace |
| MCP instructions late connect 打破 cache | 中   | 初版 dynamic section，后续 delta         |
| Bash 输入级只读误判                      | 高   | 未知命令保守串行并走权限                 |
| `/context` 泄露敏感 prompt               | 高   | 默认只显示结构和 token，不显示正文       |
| Reactive compact 重试循环                | 中   | 最大重试次数和策略日志必需               |

## RFC-to-TODO 执行记录

- 2026-05-02：读取 `docs/rfc/x-mars-vs-claude-code-min-granularity.md`，将最小颗粒功能清单合并为 12 个实施 TODO。
- 2026-05-02：未找到用户提到的 `rfc-to-todos/SKILL.md`，改为参照仓库现有 `docs/rfc/claude-code-agent-framework-todos.md` 的 RFC-to-TODO 跟踪器结构生成本文。
- 2026-05-02：用户补充 `rfc-to-todos` SKILL 正文后，按方法论补齐需求方案设计备注、参考依据、进度计算命令、证据记录格式和最新测试状态时间。
- 2026-05-02 16:22 Asia/Shanghai：推进 `VCCG-01`，实现 PromptSection/PromptAssembly 兼容 API、`system-prompt.sections.transform` hook、AgentSession section 消费链路和 tool/environment/phase/lesson hook 迁移；输入/输出接口为 `PromptSectionInput -> PromptAssembly -> effectiveSystemPrompt string`，旧 string API 保持兼容；测试命令 `pnpm vitest run packages/prompt/tests/prompt.test.ts packages/hooks/tests/hook-registry.test.ts packages/coding/tests/hooks-integration.test.ts`，结果 Pass（3 个文件 51 项）；typecheck 命令 `pnpm --filter @x-mars/prompt typecheck`、`pnpm --filter @x-mars/hooks typecheck`、`pnpm --filter @x-mars/coding typecheck`，结果 Pass；剩余风险为 provider cache 边界和 `/context` 诊断尚未落地，后续由 VCCG-02/VCCG-03 承接。
- 2026-05-02 16:30 Asia/Shanghai：推进 `VCCG-02`，实现 `PromptCacheMetadata`、Agent/work-loop 透传、tool schema fingerprint 和 Anthropic static/dynamic cache boundary；输入/输出接口为 `PromptAssembly -> PromptCacheMetadata -> StreamContext.promptCache -> Anthropic system TextBlockParam[]`；测试命令 `pnpm vitest run packages/agent/tests/agent-loop.test.ts packages/agent/tests/agent.test.ts packages/ai/tests/prompt-cache.test.ts packages/coding/tests/hooks-integration.test.ts`，结果 Pass（4 个文件 40 项）；typecheck 命令 `pnpm --filter @x-mars/ai typecheck`、`pnpm --filter @x-mars/agent typecheck`、`pnpm --filter @x-mars/coding typecheck`，结果 Pass；剩余风险为真实 cache 命中 telemetry 和 `/context` 展示尚未落地，后续由 VCCG-03 承接。
- 2026-05-02 16:34 Asia/Shanghai：推进 `VCCG-03`，实现 `ContextDiagnostics`、`AgentSession.getContextDiagnostics()`、interactive `/context` 命令和 service context route；输入/输出接口为 `AgentSession -> ContextDiagnostics`，默认隐藏 prompt 正文，显式 `includePrompt` / `--show-prompt` 才返回正文；测试命令 `pnpm vitest run packages/coding/tests/run-modes.test.ts packages/coding/tests/hooks-integration.test.ts packages/service/tests/sessions-route.test.ts`，结果 Pass（3 个文件 15 项）；typecheck 命令 `pnpm --filter @x-mars/coding typecheck`、`pnpm --filter @x-mars/service typecheck`、`pnpm --filter @x-mars/cli typecheck`，结果 Pass；剩余风险为 MCP/Skill/Plugin 摘要待后续 TODO 扩展。
- 2026-05-02 16:45 Asia/Shanghai：推进 `VCCG-04`，实现工具 metadata 覆盖检查、tool availability prompt section、deferred tools prompt section 和 hook 注入；输入/输出接口为 `ToolRegistry -> buildToolAvailability/buildDeferredToolsGuidance/getMetadataCoverage -> PromptAssembly sections`；测试命令 `pnpm vitest run packages/tools/tests/tool-registry.test.ts packages/tools/tests/builtin-orchestration-registration.test.ts packages/agent/tests/deferred-tools.test.ts packages/coding/tests/hooks-integration.test.ts`，结果 Pass（4 个文件 59 项）；typecheck 命令 `pnpm --filter @x-mars/tools typecheck`、`pnpm --filter @x-mars/agent typecheck`、`pnpm --filter @x-mars/coding typecheck`，结果 Pass；剩余风险为输入级只读/并发判断待 VCCG-05 承接。
- 2026-05-02 16:58 Asia/Shanghai：推进 `VCCG-05`，实现输入敏感的只读/并发工具能力、bash 保守只读分类和 MCP annotations 映射；输入/输出接口为 `AgentTool.isReadOnly(params)`、`AgentTool.isConcurrencySafe(params)`、`partitionToolCalls(toolCalls, tools) -> ToolBatch[]`；测试命令 `pnpm vitest run packages/agent/tests/tool-partitioner.test.ts packages/agent/tests/tool-executor.test.ts packages/tools/tests/shell-readonly.test.ts packages/tools/tests/mcp-tool-adapter.test.ts`，结果 Pass；typecheck 命令 `pnpm --filter @x-mars/agent typecheck`、`pnpm --filter @x-mars/tools typecheck`、`pnpm --filter @x-mars/mcp typecheck`，结果 Pass；剩余风险为复杂 shell 语法仍按保守非只读处理，permission hook 仍是最终安全边界。
- 2026-05-02 17:13 Asia/Shanghai：推进 `VCCG-06`，实现 MCP resources/prompts agent tools、server instructions prompt section、list_changed 热刷新和 MCP manager 注入点；输入/输出接口为 `McpManager -> mcp_list_resources/mcp_read_resource/mcp_list_prompts/mcp_get_prompt` 与 `buildMcpContextSection(manager)`；测试命令 `pnpm vitest run packages/tools/tests/mcp-agent-tools.test.ts packages/mcp/tests/mcp-manager.test.ts packages/coding/tests/hooks-integration.test.ts`，结果 Pass；typecheck 命令 `pnpm --filter @x-mars/mcp typecheck`、`pnpm --filter @x-mars/tools typecheck`、`pnpm --filter @x-mars/coding typecheck`，结果 Pass；剩余风险为真实 MCP server settings 生命周期未在本 TODO 内自动接入。
- 2026-05-02 17:26 Asia/Shanghai：推进 `VCCG-07`，实现 Skill catalog prompt section 和 `skill_search/create/improve` 工具闭环；输入/输出接口为 `SkillProvider.search/create/improve/catalog`、`SkillRegistry.search/create/improve/catalog` 与 skill agent tools；测试命令 `pnpm vitest run packages/skill/tests/skill-registry.test.ts packages/tools/tests/skill-tools.test.ts packages/coding/tests/hooks-integration.test.ts`，结果 Pass；typecheck 命令 `pnpm --filter @x-mars/skill typecheck`、`pnpm --filter @x-mars/tools typecheck`、`pnpm --filter @x-mars/coding typecheck`，结果 Pass；剩余风险为默认未配置 `skillProvider` 时工具返回未配置，真实 discover/初始化由上层传入。
- 2026-05-02 17:38 Asia/Shanghai：推进 `VCCG-08`，实现 PluginManager 扫描本地 plugin roots、动态 import tool module、注册/卸载插件工具并接入 XMarsApp 生命周期；输入/输出接口为 `PluginManager.loadAll()/unloadAll()`、`XMarsAppOptions.pluginRoots`、manifest `tools[].module/exportName`；测试命令 `pnpm vitest run packages/tools/tests/plugin-manager.test.ts packages/tools/tests/plugin-manifest.test.ts packages/coding/tests/plugin-manager-integration.test.ts`，结果 Pass；typecheck 命令 `pnpm --filter @x-mars/tools typecheck`、`pnpm --filter @x-mars/coding typecheck`，结果 Pass；剩余风险为 hooks/commands/agents 和 trust gate 已留给 VCCG-09。
- 2026-05-02 17:47 Asia/Shanghai：推进 `VCCG-09`，实现 plugin manifest hooks/commands/agents 字段、PluginManager trust/disable/reload 和 CLI plugin list/enable/disable/reload；输入/输出接口为 `PluginManager.trust/untrust/enable/disable/reloadAll`、manifest runtime plan/lifecycle diagnostics、`x-mars plugin <cmd>`；测试命令 `pnpm vitest run packages/tools/tests/plugin-manager.test.ts packages/tools/tests/plugin-manifest.test.ts packages/coding/tests/plugin-manager-integration.test.ts`，结果 Pass（3 个文件 16 项）；typecheck 命令 `pnpm --filter @x-mars/tools typecheck`、`pnpm --filter @x-mars/coding typecheck`、`pnpm --filter @x-mars/cli typecheck`，结果 Pass；build 命令 `pnpm --filter @x-mars/coding build`、`pnpm --filter @x-mars/tools build` 已刷新本地 dist；剩余风险为 trust 状态暂为运行时内存态，commands/agents 只做声明与 diagnostics。
- 2026-05-02 17:54 Asia/Shanghai：推进 `VCCG-10`，实现 Reactive prompt-too-long compact 恢复、transform metadata 透传、最大重试次数和无变化保护；输入/输出接口为 `ContextTransform(messages, signal, { reason, attempt, tokenCount, error }) -> AgentMessage[] | { messages, metadata }`，PTL 恢复事件为 `compaction_needed` 携带 attempt/maxAttempts/beforeCount/afterCount/tokenCount/threshold/metadata；测试命令 `pnpm vitest run packages/agent/tests/agent-loop.test.ts packages/coding/tests/auto-compaction-hook.test.ts`，结果 Pass（2 个文件 12 项）；typecheck 命令 `pnpm --filter @x-mars/agent typecheck`、`pnpm --filter @x-mars/hooks typecheck`、`pnpm --filter @x-mars/coding typecheck`，结果 Pass；build 命令 `pnpm --filter @x-mars/hooks build`、`pnpm --filter @x-mars/agent build`、`pnpm --filter @x-mars/coding build` 已刷新本地 dist；剩余风险为 post-compact 后 deferred tools/recent files/todos/skills/MCP 的端到端恢复证据待 VCCG-11 承接。
- 2026-05-02 17:59 Asia/Shanghai：推进 `VCCG-11`，实现 post-compact restore 端到端验证与 TODO/skill 恢复状态补齐；输入/输出接口为 `collectRestorationState(messages) -> RestorationState(activeTodos/invokedSkills/loadedDeferredTools/recentFiles/mcpServers)`，`MemoryManager.process()` full compaction 输出 summary + restoration message + preserved messages；测试命令 `pnpm vitest run packages/memory/tests/state-restoration.test.ts packages/memory/tests/post-compact-restore-e2e.test.ts`，结果 Pass（2 个文件 10 项）；typecheck 命令 `pnpm --filter @x-mars/memory typecheck`，结果 Pass；build 命令 `pnpm --filter @x-mars/memory build` 已刷新本地 dist；剩余风险为 service/ws bridge 稳定性待 VCCG-12 承接。
- 2026-05-02 18:03 Asia/Shanghai：推进 `VCCG-12`，实现本地 Web bridge 连接状态协议、stale client 清理、前端指数退避重连期间命令队列和 heartbeat timeout；输入/输出接口为 `Runtime.connectionState` websocket event 与 `WebSocketClient.sendCommand()` 断线缓冲/重连 flush；测试命令 `pnpm vitest run packages/service/tests/websocket-manager.test.ts packages/service/tests/inbound-router.test.ts`，结果 Pass（2 个文件 14 项）；typecheck 命令 `pnpm --filter @x-mars/service typecheck`，结果 Pass；build 命令 `pnpm --filter @x-mars/service build`、`pnpm --filter @x-mars/opendev-ui build`，结果 Pass；剩余风险为 UI 浏览器自动化覆盖未纳入本阶段，且不做 Claude Code 云端 Teleport。
- 2026-05-02 18:07 Asia/Shanghai：审计阶段完成标准，补齐 `VCCG-05` 到 `VCCG-09` 的 RFC-to-TODO 执行记录，并执行全仓类型检查；测试命令 `pnpm typecheck`，结果 Pass，Nx 成功运行 21 个项目 typecheck 目标及 18 个依赖任务（19/39 任务命中缓存）；剩余风险为工作区仍有大量未提交/未跟踪文件，需后续整理为可 review 的提交边界。
