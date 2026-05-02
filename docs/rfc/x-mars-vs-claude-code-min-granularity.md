# X-Mars vs Claude Code 最小颗粒度对比与借鉴清单

> 范围：基于本地 `x-mars-coding` 当前工作区，以及 `aniwei/Claude-Code` 还原仓库 `b78dd22a091b717c8938ab98c736bc04825a8ee8` 的源码结构、README 和关键模块进行对比。
>
> 注意：`aniwei/Claude-Code` README 标注其为从 npm source map 还原的非官方源码，仅作为工程研究参考。本文关注架构和功能颗粒，不建议复制实现。

## 1. 总体结论

X-Mars 当前已经不是“基础版 Agent”。在 Agent loop、工具分区、延迟工具加载、多策略上下文压缩、Prompt Cache scope、权限审计、Web UI trace、多模型等方面，X-Mars 已经具备接近或超过 Claude Code 的底层能力。

真正的差距主要在产品闭环和生态层：

1. Claude Code 的 CLI/TUI、slash command、plugin、MCP、skill、remote/bridge 已形成完整用户产品。
2. X-Mars 的底层包拆分更清晰，但很多能力停留在 runtime/framework 层，缺少管理入口、信任模型、热加载、端到端验证和默认内容生态。
3. X-Mars 最值得借鉴的不是隐藏功能，而是 Claude Code 对“上下文成本、工具发现、插件生态、MCP 连接、会话恢复”的细粒度工程处理。

## 2. 架构对比

| 维度       | Claude Code                          | X-Mars                               | 判断                           |
| ---------- | ------------------------------------ | ------------------------------------ | ------------------------------ |
| 架构形态   | 单体 `src/` + feature gate           | pnpm monorepo + 20+ packages         | X-Mars 模块边界更清楚          |
| 运行入口   | CLI/TUI 为主，Web/remote 辅助        | CLI + service + opendev-ui           | X-Mars Web 更强，CLI 弱        |
| Agent loop | Query/work loop 深度集成工具/UI/权限 | `@x-mars/agent` 状态机 + hooks       | X-Mars 更可测，Claude 更产品化 |
| 配置模型   | settings + feature flags + user type | setting + model slots + profiles     | Claude 实验治理更成熟          |
| 多模型     | Claude 优先                          | Anthropic/OpenAI/Copilot/DeepSeek 等 | X-Mars 优势                    |
| 调试       | telemetry/VCR/internal trace         | devtools + audit trace + DAG UI      | X-Mars 优势                    |

## 3. 工具数量与实现原理

### 3.1 工具数量

| 类别             |                                                     Claude Code |                                            X-Mars |
| ---------------- | --------------------------------------------------------------: | ------------------------------------------------: |
| 静态内置工具文件 |                                          约 46 个 `*Tool.ts(x)` |                                约 31 个注册工具名 |
| 文件工具         |                              Read / Write / Edit / NotebookEdit |                        read / write / edit / diff |
| 搜索工具         |                                                     Glob / Grep |                                  ls / find / grep |
| Shell 工具       |                                               Bash / PowerShell |                                              bash |
| Web 工具         |                                            WebFetch / WebSearch |                            web_fetch / web_search |
| 计划/Todo        |                                TodoWrite / EnterPlan / ExitPlan |                       write_todos / plan approval |
| Agent/任务       |                                    Agent / Task\* / SendMessage | task*delegate / agent_task / agent_call / task*\* |
| MCP              | MCPTool / McpAuth / ListResource / ReadResource + dynamic tools |                         MCP adapter dynamic tools |
| Skill            |                                      SkillTool + bundled skills |                        skill_load / skill_execute |
| LSP              |                                               单个 LSPTool 聚合 |                                 多个 lsp\_\* 工具 |

X-Mars 当前核心工具名包括：

```text
read, write, edit, diff,
ls, find, grep,
bash,
web_fetch, web_search,
lsp_goto_definition, lsp_find_references, lsp_symbols, lsp_diagnostics,
lsp_prepare_rename, lsp_rename,
task_delegate, agent_task, agent_call, review_call,
write_todos,
task_create, task_get, task_list, task_update,
background_output, background_cancel,
capture_file_state, clarify_request, learn,
session_manager,
skill_load, skill_execute
```

MCP 工具是运行时动态增加，两边都没有固定上限。

### 3.2 工具抽象

| 粒度        | Claude Code                                                                    | X-Mars                                                     | 借鉴点                                  |
| ----------- | ------------------------------------------------------------------------------ | ---------------------------------------------------------- | --------------------------------------- |
| Tool 定义   | `buildTool()` 厚对象：schema、prompt、UI、权限、analytics                      | `AgentTool` 轻接口：name、description、parameters、execute | X-Mars 保持轻接口，但补 metadata 覆盖率 |
| Schema      | lazy zod schema                                                                | zod schema                                                 | 基本对齐                                |
| 工具 prompt | 每个工具可动态生成 prompt                                                      | ToolRegistry 集中生成 guidance/snippet                     | 给每个工具补专属 guideline              |
| 并发判断    | `isReadOnly(input)` + `isConcurrencySafe(input)`，Bash/PowerShell 有命令级判断 | 工具级 read-only + partitioner                             | 补 input-sensitive 只读判断             |
| 延迟加载    | ToolSearch + `shouldDefer`，MCP 默认 defer                                     | DeferredToolManager + `tool_search`                        | 基本追平，补搜索排序和 pending MCP 状态 |
| 权限        | per-tool permission + UI dialog                                                | hooks permission guard + audit                             | 补插件/MCP 专属权限                     |
| 展示        | 每个 Tool 有 TUI UI/折叠/拒绝文案                                              | Web UI 统一渲染                                            | CLI 体验需补                            |

## 4. System Prompt 内容与生成流程

### 4.1 内容结构

| 内容块   | Claude Code                                          | X-Mars                                            |
| -------- | ---------------------------------------------------- | ------------------------------------------------- |
| 身份     | Claude Code / Anthropic CLI                          | X-Mars / coding agent framework                   |
| 任务规则 | coding、git、工具、安全、输出                        | 身份、安全、沟通、工具、流程、阶段                |
| 工具指导 | 根据 enabled tools 动态生成                          | ToolRegistry guidance hook                        |
| 环境信息 | CWD、date、platform、git、model、extra dirs          | environment-injection hook                        |
| 记忆     | CLAUDE.md、rules、memdir                             | AGENTS.md、lesson injection、operational learning |
| MCP 指令 | MCP server instructions 一等 prompt section 或 delta | 主要是 MCP tool adapter，instructions 注入较弱    |
| Skill    | skill catalog / bundled / MCP skills                 | Skill framework 有，默认生态较薄                  |
| 子代理   | AgentTool/Coordinator/Fork prompt                    | prompt preset + agent profile template            |
| Cache    | static/dynamic sections + boundary                   | PromptCache + 单字符串 + hooks                    |

### 4.2 Claude Code 生成流程

```text
getSystemPrompt(tools, model, additionalWorkingDirectories, mcpClients)
  -> simple/proactive 分支判断
  -> 并行加载 skill commands / output style / env info
  -> 读取 settings / enabled tools
  -> 构造 dynamicSections:
       session_guidance
       memory
       model override
       environment
       language
       output style
       MCP instructions
       scratchpad
       function-result-clearing
       summarize-tool-results
       feature-gated sections
  -> resolveSystemPromptSections()
       cacheable section 复用
       dangerous uncached section 每轮重算
  -> 返回 string[]:
       static cacheable sections
       SYSTEM_PROMPT_DYNAMIC_BOUNDARY
       dynamic sections
```

关键设计：system prompt 是 section array，并通过动态边界服务 prompt cache。

### 4.3 X-Mars 生成流程

```text
XMarsApp.createSession(options)
  -> resolveSessionConfig()
     -> promptPreset = agentName ? subagent : main
     -> resolve model / tools / slot
     -> 固化 per-session promptRefresh closure
        main: PromptManager.assemblePreset({ preset: 'main' })
        subagent: assembleSubAgentPrompt(profile, context)
  -> AgentSession 保存 initialSystemPrompt + promptRefresh

AgentSession.prompt(text)
  -> promptRefresh()
  -> chat.message.before
  -> buildContext()
  -> system-prompt.transform hooks:
       tool-guidance-injection
       environment-injection
       phase-injection
       lesson-injection
  -> agent.run({ systemPrompt, tools, messages })
  -> model stream + tool loop
  -> chat.message.after
  -> session.idle
```

X-Mars 当前优势是 preset/profile/hook 链条清晰；短板是 prompt section 没有 cacheability 标记，MCP/skill instructions 注入不够一等。

### 4.4 System Prompt 内容借鉴清单

Claude Code 值得借鉴的不是完整文案，而是“内容块职责”和“注入边界”。X-Mars 应保持自身中文 lead-guidance 和 profile 体系，但把以下内容块补成一等 prompt section。

| ID     | 内容块                   | Claude Code 做法                                                               | X-Mars 当前                                       | 借鉴方式                                                                                     | 最小验收                                                      |
| ------ | ------------------------ | ------------------------------------------------------------------------------ | ------------------------------------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| SP-C01 | Session guidance         | 根据 enabled tools、skill commands、当前会话模式生成 session-specific guidance | lead-guidance 固定文本 + tool-guidance hook       | 新增 `session-guidance` section，汇总当前 session 的工具、模式、agentName、preset            | `/context` 可看到 session-guidance；不同 tool preset 内容不同 |
| SP-C02 | Tool availability        | `getUsingYourToolsSection(enabledTools)` 只描述当前可用工具                    | ToolRegistry guidance 会遍历当前 preset           | 保留现有 guidance，但拆成 `tool-availability` 与 `tool-guidelines`                           | 禁用某工具后 prompt 不再出现该工具说明                        |
| SP-C03 | Deferred tools catalog   | ToolSearch prompt 明确说明 deferred tool 的查询和 schema 获取方式              | `tool_search` 有工具说明，但 system prompt 层较弱 | 新增 `deferred-tools` section，仅列名称、搜索方式、禁止未加载直接调用                        | 有 deferred tool 时出现；无 deferred tool 时省略              |
| SP-C04 | MCP instructions         | MCP server instructions 可进入 prompt 或 delta attachment                      | MCP 主要作为 tool adapter                         | 新增 `mcp-instructions` section，聚合已连接 server 的 instructions、resources/prompts 可用性 | 连接带 instructions 的 MCP server 后 section 出现             |
| SP-C05 | Skill catalog            | skills 以 commands/catalog 形式进入上下文，正文按需加载                        | SkillRegistry 可 build catalog，但未形成主链路    | 新增 `skill-catalog` section，只注入 name/description/trigger，不注入正文                    | 注册 skill 后 prompt 中出现短 catalog                         |
| SP-C06 | Memory hierarchy         | CLAUDE.md、rules、memdir 分层加载                                              | AGENTS.md + lesson injection                      | 新增 `memory-sources` section，列出全局/项目/只读来源和写回规则                              | prompt 明确哪些 memory 可写                                   |
| SP-C07 | Output style             | output style 可配置，且可决定是否保留 coding instructions                      | lead-guidance 固定输出风格                        | 新增 `output-style` section，允许 setting/profile 覆盖语气和详略                             | setting 变更后 prompt 输出风格 section 改变                   |
| SP-C08 | Language                 | 独立 language section                                                          | 默认中文文档，但运行时没有独立 section            | 新增 `language` section，明确用户语言优先级                                                  | 中文/英文配置可切换                                           |
| SP-C09 | Function result clearing | 有工具结果清理/摘要提示，降低重复引用旧结果                                    | 主要靠 memory compaction                          | 新增 `tool-result-lifecycle` section，提示旧工具结果可能被裁剪，当前文件为准                 | 长上下文时仍优先 re-read                                      |
| SP-C10 | Token budget             | feature-gated token budget 指令                                                | 有 token budget hook/压缩，但 prompt 不一等       | 新增 `token-budget` section，说明当前窗口、阈值、压缩行为                                    | `/context` 显示 token budget section                          |
| SP-C11 | Cache awareness          | static/dynamic boundary 服务 cache，不直接暴露给模型太多                       | cache-scope 存在但 prompt 无 section 边界         | 不必让模型知道 cache，但 section metadata 要标注 cacheable                                   | debug 输出显示 cacheable/non-cacheable                        |
| SP-C12 | Subagent contract        | Agent/Fork/Coordinator prompt 明确 worker 责任边界                             | profile template 已有                             | 在 subagent prompt 增加固定 `parent-contract`：范围、工具边界、回传格式                      | 子代理 prompt 都包含 contract                                 |

建议的 X-Mars prompt 内容分层：

```text
Static / cacheable
  - identity
  - safety-boundaries
  - base-communication
  - base-workflow
  - phase-discipline
  - review-guidance

Session static / cacheable within session
  - session-guidance
  - tool-availability
  - tool-guidelines
  - deferred-tools
  - skill-catalog
  - model-slot-guidance

Dynamic / per-turn
  - environment
  - git-status
  - memory-sources
  - runtime-lessons
  - mcp-instructions
  - phase-state
  - token-budget
```

### 4.5 System Prompt 生成流程借鉴清单

Claude Code 的关键流程价值是：先分 section，再标记 cacheability，再并行加载动态输入，最后生成可调试的 prompt block 列表。X-Mars 可在不改变现有 `PromptManager` API 的前提下逐步升级。

| ID     | 流程能力                       | Claude Code 做法                                                    | X-Mars 当前                                  | 借鉴方式                                                           | 最小验收                                               |
| ------ | ------------------------------ | ------------------------------------------------------------------- | -------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------ |
| SP-F01 | Section object                 | `systemPromptSection(name, compute)`                                | `PromptManager.assemble()` 返回字符串        | 新增 `PromptSection { key, content, cacheable, source, priority }` | 单测能组装 section 数组                                |
| SP-F02 | Volatile section               | `DANGEROUS_uncachedSystemPromptSection`                             | hook 每次直接改字符串                        | section 支持 `cacheable: false` 和 reason                          | 动态 section 变化不污染静态 cache                      |
| SP-F03 | Dynamic boundary               | `SYSTEM_PROMPT_DYNAMIC_BOUNDARY`                                    | 无                                           | assemble 后生成 staticPrefix + dynamicTail                         | Anthropic provider 能对 static prefix 做 cache_control |
| SP-F04 | Parallel loading               | skill/env/output style 并行加载                                     | promptRefresh 后 hooks 串行执行              | `PromptAssembler` 并行 resolve independent section                 | env、skill、MCP section 并行加载测试                   |
| SP-F05 | Section cache invalidation     | `/clear`、`/compact` 清 section cache                               | PromptCache 只缓存模板                       | 按 key/version/source invalidation                                 | 修改 prompt 文件后只刷新对应 section                   |
| SP-F06 | Prompt diff/debug              | Claude 有 `/context`、dump prompt 相关能力                          | 无 `/context`                                | 新增 debug endpoint/CLI 输出 section keys、tokens、cacheable       | `/context` 不泄露敏感正文时可显示结构                  |
| SP-F07 | MCP delta                      | MCP instructions 可用 delta attachment 避免 late connect bust cache | 无                                           | 初版先做 dynamic section，后续做 delta message                     | MCP late connect 不重建 static prefix                  |
| SP-F08 | Tool schema cache              | 工具 schema 与 prompt prefix 共同缓存                               | cache-scope 有，但工具/prompt section 未对齐 | tool list hash 纳入 prompt section fingerprint                     | tool 变更触发 cache break detection                    |
| SP-F09 | Per-session promptRefresh 固化 | X-Mars 已有                                                         | 已对齐                                       | 保留，不让运行中 preset 漂移                                       | fork 后继承正确 promptRefresh                          |
| SP-F10 | Subagent prompt fork           | Claude fork agent 复用 parent cache prefix                          | subagent 独立 prompt                         | 子代理可继承 parent static sections，只替换 contract/task context  | fork 子代理 cache read 增加                            |

推荐的 X-Mars 生成流程目标态：

```text
PromptManager.assembleSections(preset, context)
  -> load static template sections
  -> resolve session sections:
       session-guidance
       tool-availability
       deferred-tools
       skill-catalog
  -> resolve dynamic sections in parallel:
       environment
       memory-sources
       runtime-lessons
       mcp-instructions
       phase-state
       token-budget
  -> sort by priority
  -> compute fingerprints
  -> split staticPrefix / dynamicTail
  -> return PromptAssembly {
       sections,
       systemPrompt,
       staticPrefix,
       dynamicTail,
       diagnostics
     }

AgentSession.prompt(text)
  -> promptRefreshAssembly()
  -> system-prompt.sections.transform hooks
  -> render final systemPrompt
  -> provider receives cache metadata
  -> /context can inspect diagnostics
```

迁移顺序：

1. 先保留 `assemblePreset(): Promise<string>`，新增旁路 API `assemblePresetSections()`。
2. 将现有 `tool-guidance`、`environment`、`phase`、`lesson` hook 从“拼字符串”迁移为“追加 section”。
3. `AgentSession` 同时兼容 string 和 `PromptAssembly`。
4. Anthropic provider 读取 static/dynamic 信息做 cache_control。
5. CLI/Web 增加 `/context` 或 debug API 展示 section diagnostics。

## 5. MCP 实现对比

| 粒度         | Claude Code                                         | X-Mars                            | 差距                        |
| ------------ | --------------------------------------------------- | --------------------------------- | --------------------------- |
| 连接管理     | stdio/SSE/SDK、OAuth、pending request 清理、重连    | `McpManager` + client + transport | X-Mars 骨架完整，边界处理少 |
| 工具命名     | `mcp__server__tool`                                 | `mcp__serverName__toolName`       | 对齐                        |
| Tool adapter | MCP tools 转 Tool，默认 deferred                    | MCP tools 转 AgentTool            | 对齐                        |
| Resources    | List/Read resource 专门工具                         | manager 聚合 resources            | 缺一等 resource 工具        |
| Prompts      | MCP prompts 可转 commands                           | manager 聚合 prompts              | 缺产品入口                  |
| Auth         | McpAuthTool、OAuth port、headers、official registry | 基础配置                          | 明显差距                    |
| 权限         | MCP server/tool/channel permissions                 | 通用 permission hook              | 缺 MCP 专属策略             |
| UI/CLI       | `/mcp` command + dialogs                            | Web settings 有，CLI 弱           | CLI 需补                    |

最小借鉴：

1. `mcp_list_resources`
2. `mcp_read_resource`
3. `mcp_list_prompts`
4. `mcp_get_prompt`
5. `mcp_auth`
6. MCP server instructions 注入 system prompt
7. MCP tool/resource/prompt list_changed 热刷新
8. pending call cleanup 和超时错误归一

## 6. Skill 实现对比

| 粒度     | Claude Code                                        | X-Mars                       | 差距                         |
| -------- | -------------------------------------------------- | ---------------------------- | ---------------------------- |
| 格式     | SKILL.md + bundled + MCP skills                    | Agent Skills 兼容 SKILL.md   | 格式对齐                     |
| 发现     | managed/user/project/plugin/MCP/legacy commands    | project/global/plugin/inline | X-Mars 少 managed/MCP/legacy |
| 内置生态 | batch、skillify、simplify、debug、stuck、verify 等 | 框架有，默认 skill 少        | 内容生态差距                 |
| 匹配     | ToolSearch/SkillTool/description search            | skill-matcher                | 对齐但简单                   |
| 执行     | SkillTool 带权限、进度、输出                       | skill_load / skill_execute   | X-Mars 工具拆分更轻          |
| 自生成   | skillify                                           | learn + operational learning | 缺 skill_create/improve 闭环 |
| 插件集成 | plugin skills 一等组件                             | manifest 支持 skills         | 缺加载产品闭环               |

最小借鉴：

1. `skill_search`
2. `skill_create`
3. `skill_improve`
4. bundled skills 目录
5. plugin skill loader
6. MCP skills adapter
7. skill catalog 注入 system prompt，只注入 name/description

## 7. 插件架构设计对比

### 7.1 能力矩阵

| 维度        | Claude Code                                                        | X-Mars                                 | 差距          |
| ----------- | ------------------------------------------------------------------ | -------------------------------------- | ------------- |
| 管理入口    | `/plugin` UI + CLI install/enable/disable/update                   | manifest 库能力                        | 缺 CLI/UI     |
| Manifest    | commands、agents、skills、hooks、MCP、LSP、output styles、settings | tools、skills、mcpServers、permissions | X-Mars 类型少 |
| Marketplace | 官方/自定义 marketplace、浏览、安装                                | 无                                     | 明显差距      |
| 安装范围    | user/project/local/managed                                         | roots 扫描                             | 缺 scope      |
| 安装方式    | git/zip/cache/MCPB                                                 | 本地 manifest                          | 缺安装器      |
| 信任策略    | trust warning、policy、blocklist、managed policy                   | permissions 字段校验                   | 缺信任模型    |
| 依赖        | dependencyResolver、reverse dependents                             | 无                                     | 缺依赖        |
| 热刷新      | reload plugins、MCP reconnect key                                  | runtime plan apply/disable             | 缺入口        |
| 错误模型    | 类型化 PluginError                                                 | validation/lifecycle errors            | 需细化        |

### 7.2 X-Mars 当前插件流程

```text
discoverPluginManifests(roots)
  -> read plugin.json / x-mars-plugin.json
  -> validatePluginManifest()
  -> buildPluginRuntimePlan()
  -> applyPluginRuntimePlan(adapters)
       registerToolOptions
       loadSkill
       connectMcpServer
```

### 7.3 Claude Code 插件流程

```text
settings / marketplace declaration
  -> reconcile marketplaces
  -> clone/update/cache plugin repository
  -> load manifest
  -> validate policy/blocklist/trust
  -> load components:
       commands
       agents
       skills
       hooks
       MCP servers
       LSP servers
       output styles
       settings
  -> merge runtime state
  -> reload/uninstall/update
```

最小借鉴：

1. `PluginManager` 接入 `XMarsApp.start()`
2. `plugin.json` 支持 `hooks`
3. `plugin.json` 支持 `commands`
4. `plugin.json` 支持 `agents`
5. 真实加载 `tools[].module/exportName`
6. 插件信任确认
7. `/plugin list`
8. `/plugin enable|disable|reload`
9. 本地 marketplace JSON
10. 版本缓存和卸载清理

## 8. 最小颗粒功能清单

### P0：上下文与成本

| ID    | 功能                          | X-Mars 当前                        | 借鉴目标                                              | 验收                                                       |
| ----- | ----------------------------- | ---------------------------------- | ----------------------------------------------------- | ---------------------------------------------------------- |
| P0-01 | Reactive compact              | 有 snip/prune/micro/full pipeline  | Prompt-too-long 后自动重试                            | 构造超长上下文能自动恢复                                   |
| P0-02 | Post-compact restore e2e      | 有 state-restoration               | 恢复文件、计划、tool_search、skill、MCP 状态          | `tool_search -> read/edit -> compact -> continue` 测试通过 |
| P0-03 | PromptSection 模型            | 单字符串 + hook                    | static/dynamic section + cacheable 标记               | final prompt 可打印 section 列表                           |
| P0-04 | Prompt cache metrics          | 有 cache-scope                     | 命中率、break detection 可观测                        | session usage 显示 cache read/write                        |
| P0-08 | Prompt 内容分层               | lead-guidance + hooks              | static/session/dynamic 三层内容块                     | `/context` 显示每个 section 的 layer/source                |
| P0-09 | Session guidance section      | 固定 workflow 文案                 | 按当前 tools/preset/agentName 生成 session guidance   | 切换 preset 后 section 内容变化                            |
| P0-10 | Deferred tools prompt section | `tool_search` 工具说明存在         | system prompt 中说明 deferred tool 发现/加载规则      | 有 deferred tool 时出现，无 deferred tool 时省略           |
| P0-11 | Prompt assembly diagnostics   | 无                                 | 输出 section keys、token 估算、cacheable、fingerprint | debug API/CLI 可查看且不泄露敏感正文                       |
| P0-12 | Section transform hook        | `system-prompt.transform` 拼字符串 | `system-prompt.sections.transform` 修改 section array | 现有 tool/env/phase/lesson hook 可迁移                     |

### P0：工具执行

| ID    | 功能                     | X-Mars 当前                  | 借鉴目标                                       | 验收                                |
| ----- | ------------------------ | ---------------------------- | ---------------------------------------------- | ----------------------------------- |
| P0-05 | 工具 metadata 覆盖       | 部分工具有 guideline/snippet | 每个工具有 category、readonly、defer、guidance | 覆盖率测试                          |
| P0-06 | input-sensitive readonly | 工具级判断为主               | Bash 等按输入判断是否只读                      | `git status` 并发，`rm` 串行/需审批 |
| P0-07 | ToolSearch 搜索排序      | 已有 deferred manager        | 支持 select、多关键词、MCP pending             | 单测覆盖                            |

### P1：MCP

| ID    | 功能                     | X-Mars 当前          | 借鉴目标                                | 验收                            |
| ----- | ------------------------ | -------------------- | --------------------------------------- | ------------------------------- |
| P1-01 | MCP resources tools      | manager 有 resources | list/read resource 工具                 | 能读取 MCP resource             |
| P1-02 | MCP prompts tools        | manager 有 prompts   | list/get prompt 工具或 slash command    | 能选择 MCP prompt 注入          |
| P1-03 | MCP instructions section | 弱                   | server instructions 注入 prompt section | 连接 MCP 后 prompt section 可见 |
| P1-04 | MCP auth/trust           | 基础配置             | auth tool + trust prompt                | 未信任 server 不自动执行        |
| P1-05 | MCP list_changed         | 部分事件             | tools/resources/prompts 热刷新          | server 通知后工具列表更新       |

### P1：Skill

| ID    | 功能                  | X-Mars 当前               | 借鉴目标                     | 验收                        |
| ----- | --------------------- | ------------------------- | ---------------------------- | --------------------------- |
| P1-06 | Skill catalog section | registry 可 build catalog | name/description 注入 prompt | prompt 中出现 skill catalog |
| P1-07 | `skill_search`        | matcher 有                | 工具化搜索                   | Agent 可按 query 找 skill   |
| P1-08 | `skill_create`        | learn 工具有经验存储      | 从经验生成 SKILL.md          | 生成合法 frontmatter        |
| P1-09 | `skill_improve`       | 无                        | 基于失败反馈修改 skill       | 保留版本/变更记录           |
| P1-10 | Bundled skills        | 少                        | 内置 verify/debug/review 等  | 默认可搜索                  |

### P1：插件

| ID    | 功能               | X-Mars 当前             | 借鉴目标                    | 验收                          |
| ----- | ------------------ | ----------------------- | --------------------------- | ----------------------------- |
| P1-11 | PluginManager      | manifest 函数           | start 时自动 discover/apply | 插件启动后 tool 可用          |
| P1-12 | Tool module loader | manifest 有 module 字段 | 动态 import AgentTool       | plugin tool 可执行            |
| P1-13 | Plugin hooks       | 无 manifest 字段        | hooks 作为一等组件          | 插件可注册 system-prompt hook |
| P1-14 | Plugin CLI         | 无                      | list/enable/disable/reload  | CLI 可管理                    |
| P1-15 | Plugin trust       | permissions 字段        | 首次启用危险权限确认        | 未确认不加载                  |

### P2：CLI/TUI 产品化

| ID    | 功能           | X-Mars 当前     | 借鉴目标                   | 验收                   |
| ----- | -------------- | --------------- | -------------------------- | ---------------------- |
| P2-01 | `/mcp`         | Web settings 有 | CLI 管理 MCP               | list/add/remove/status |
| P2-02 | `/skills`      | registry 有     | CLI 管理 skill             | list/load/search       |
| P2-03 | `/tools`       | registry 有     | 查看工具/延迟工具          | 显示 loaded/deferred   |
| P2-04 | `/context`     | 无              | 展示 prompt sections/token | 可调试最终上下文       |
| P2-05 | `/permissions` | policy 有       | CLI 管理策略               | 查看/添加/删除规则     |

### P2：Remote/Bridge

| ID    | 功能                       | X-Mars 当前     | 借鉴目标                                  | 验收           |
| ----- | -------------------------- | --------------- | ----------------------------------------- | -------------- |
| P2-06 | Bridge 定义                | 本地 service/ws | 明确本地 Web bridge vs 云端 remote bridge | RFC 决策落地   |
| P2-07 | WS reconnect state machine | 基础 WS         | keepalive、指数退避、状态事件             | 断线恢复测试   |
| P2-08 | Remote permission callback | 审批已有        | 远端审批通道                              | UI 可审批 tool |

## 9. 推荐实施顺序

### 第一阶段：把现有底层能力产品化

1. P0-02 post-compact restore e2e
2. P0-05 工具 metadata 覆盖率
3. P0-08 Prompt 内容分层
4. P0-11 Prompt assembly diagnostics
5. P2-04 `/context`
6. P2-03 `/tools`

原因：这些任务最能暴露系统真实状态，且不会引入大安全面。

### 第二阶段：补 MCP/Skill 的一等入口

1. P1-01 MCP resources tools
2. P1-02 MCP prompts tools
3. P1-06 Skill catalog section
4. P1-07 `skill_search`

原因：MCP/Skill 已有框架，补入口比重写架构收益更高。

### 第三阶段：插件闭环

1. P1-11 PluginManager
2. P1-12 Tool module loader
3. P1-14 Plugin CLI
4. P1-15 Plugin trust

原因：没有信任和管理入口前，不建议做 marketplace。

### 第四阶段：成本与稳定性优化

1. P0-01 Reactive compact
2. P0-03 PromptSection 模型
3. P0-04 Prompt cache metrics
4. P1-05 MCP hot refresh

原因：这些会影响核心 loop，需要在工具和上下文可观测后再做。

## 10. 不建议优先借鉴的功能

| 功能               | 原因                                         |
| ------------------ | -------------------------------------------- |
| Buddy              | 产品趣味功能，不影响核心 coding 能力         |
| Voice              | 依赖交互面和音频链路，当前收益低             |
| Ultraplan/Teleport | 依赖云端执行平台，X-Mars 暂无对应产品边界    |
| 大规模 marketplace | 需要先有 plugin trust、loader、CLI、cache    |
| 完整 TUI 复刻      | X-Mars 已有 Web UI 优势，应先补 CLI 管理命令 |

## 11. 最小可执行 Roadmap

```text
Milestone A: 可观测上下文
  - /context
  - prompt section model
  - prompt content layering
  - prompt assembly diagnostics
  - post-compact restore e2e

Milestone B: 工具体系补齐
  - tool metadata coverage
  - input-sensitive readonly
  - ToolSearch ranking/pending MCP

Milestone C: MCP/Skill 一等化
  - MCP resources/prompts tools
  - MCP instructions prompt section
  - skill_search/create/improve

Milestone D: 插件闭环
  - PluginManager
  - tool module loader
  - plugin CLI
  - trust/permission gate

Milestone E: 成本和远程稳定性
  - reactive compact
  - cache metrics
  - WS reconnect
```

## 12. 关键判断

X-Mars 最应该保留的是模块化、hook、Web trace、多模型和清晰 runtime 边界；最应该借鉴 Claude Code 的是：

1. section 级 system prompt 与 cache 边界；
2. MCP/Skill/Plugin 的产品级管理入口；
3. 工具 metadata、延迟发现和输入级并发判断；
4. 上下文压缩后的状态恢复和 PTL 自动修复；
5. 插件信任、安装范围、热刷新和卸载清理。

换句话说，X-Mars 不需要复刻 Claude Code 的单体架构；需要把 Claude Code 已经打磨过的“最小行为颗粒”接到 X-Mars 现有包边界里。
