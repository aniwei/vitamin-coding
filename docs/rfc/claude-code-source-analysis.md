# Claude Code 源码深度分析与 X-Mars-Coding 借鉴报告

> **RFC 编号**：rfc-001  
> **状态**：正式版（v4）  
> **日期**：2026-05-01  
> **来源仓库**：https://github.com/aniwei/Claude-Code（`@anthropic-ai/claude-code` npm 包 source map 还原版）  
> **分析范围**：1,987 个源文件 · 340 个目录 · TypeScript + React/Ink 终端渲染

---

## 目录

- [一、项目全局概览](#一项目全局概览)
- [二、完整目录结构与模块地图](#二完整目录结构与模块地图)
- [三、整体流程逻辑（从启动到对话）](#三整体流程逻辑从启动到对话)
- [四、核心模块详解](#四核心模块详解)
  - [4.1 启动与引导 — entrypoints/ + bootstrap/](#41-启动与引导--entrypoints--bootstrap)
  - [4.2 会话主循环 — QueryEngine + query.ts](#42-会话主循环--queryengine--queryts)
  - [4.3 工具系统 — Tool.ts + tools/](#43-工具系统--toolts--tools)
  - [4.4 命令系统 — commands.ts + commands/](#44-命令系统--commandsts--commands)
  - [4.5 任务系统 — Task.ts + tasks/](#45-任务系统--taskts--tasks)
  - [4.6 权限系统 — hooks/useCanUseTool + toolPermission/](#46-权限系统--hooksusecanuseTool--toolpermission)
  - [4.7 上下文压缩 — services/compact/](#47-上下文压缩--servicescompact)
  - [4.8 API 客户端 — services/api/claude.ts](#48-api-客户端--servicesapiclaude)
  - [4.9 状态管理 — state/ + bootstrap/state.ts](#49-状态管理--state--bootstrapstatets)
  - [4.10 UI 渲染层 — ink/ + components/ + screens/](#410-ui-渲染层--ink--components--screens)
  - [4.11 MCP 集成 — services/mcp/](#411-mcp-集成--servicesmcp)
  - [4.12 Skill 技能系统 — skills/](#412-skill-技能系统--skills)
  - [4.13 Bridge 桥接系统 — bridge/](#413-bridge-桥接系统--bridge)
  - [4.14 Remote 远程会话 — remote/](#414-remote-远程会话--remote)
  - [4.15 Memory 记忆系统 — memdir/](#415-memory-记忆系统--memdir)
  - [4.16 服务层 — services/ 其他模块](#416-服务层--services-其他模块)
  - [4.17 键绑定系统 — keybindings/](#417-键绑定系统--keybindings)
  - [4.18 Vim 模式 — vim/](#418-vim-模式--vim)
  - [4.19 Coordinator 多 Agent 编排 — coordinator/](#419-coordinator-多-agent-编排--coordinator)
  - [4.20 Buddy 伴侣系统 — buddy/](#420-buddy-伴侣系统--buddy)
- [五、调用依赖关系](#五调用依赖关系)
- [六、流程逻辑图](#六流程逻辑图)
- [七、X-Mars-Coding 借鉴分析](#七x-mars-coding-借鉴分析)

---

## 一、项目全局概览

### 1.1 Claude Code 是什么

Claude Code 是 Anthropic 官方的 AI 编程助手 CLI 工具。它以终端 REPL 为核心交互界面，通过 React/Ink 渲染框架构建终端 UI，内置 54+ 工具（文件读写、Shell 执行、Web 搜索等），支持多 Agent 编排、MCP 协议集成、远程会话桥接等高级功能。

### 1.2 技术栈

| 层次        | 技术                                            |
| ----------- | ----------------------------------------------- |
| 运行时      | Bun（主要），Node.js 18+ 兼容                   |
| 语言        | TypeScript（严格模式）                          |
| UI 框架     | React + Ink（终端渲染器）                       |
| 布局引擎    | Yoga（Facebook 的 Flexbox 布局）                |
| API 客户端  | @anthropic-ai/sdk                               |
| 协议        | MCP（Model Context Protocol）                   |
| 构建工具    | Bun bundler（feature() 死代码消除）             |
| Schema 验证 | Zod v4                                          |
| 分析        | GrowthBook（特性门控）+ Datadog + OpenTelemetry |

### 1.3 规模统计

```
源文件数:      1,987 (.ts/.tsx)
目录数:        340
核心模块:      20+ 子系统
内置工具:      54 个
内置命令:      120+ 个
技能(Skill):   18 个 bundled + 动态加载
Hook 文件:     77 个
UI 组件:       400+ 个
Ink 渲染层:    100 个文件
```

---

## 二、完整目录结构与模块地图

```
src/
├── main.tsx                 # 主入口（4,690 行）
├── QueryEngine.ts           # 查询引擎（1,295 行）
├── query.ts                 # 核心查询循环（1,729 行）
├── Tool.ts                  # 工具类型系统（792 行）
├── tools.ts                 # 工具注册表（389 行）
├── commands.ts              # 命令注册表（754 行）
├── Task.ts                  # 任务类型系统（125 行）
├── tasks.ts                 # 任务注册表（39 行）
├── context.ts               # 上下文组装（189 行）
├── setup.ts                 # 会话初始化（~800 行）
├── history.ts               # 历史管理
├── cost-tracker.ts          # 成本追踪
├── costHook.ts              # 成本 Hook
├── ink.ts                   # Ink 重导出
├── replLauncher.tsx          # REPL 启动器
├── dialogLaunchers.tsx       # 对话框启动器
├── interactiveHelpers.tsx    # 交互辅助
│
├── entrypoints/             # 入口点
│   ├── cli.tsx              # CLI 入口（302 行）
│   ├── init.ts              # 初始化（340 行）
│   ├── mcp.ts               # MCP 服务器入口（196 行）
│   ├── agentSdkTypes.ts     # SDK 类型（443 行）
│   └── sandboxTypes.ts      # 沙箱配置（156 行）
│
├── bootstrap/               # 引导层
│   └── state.ts             # 全局状态单例（1,758 行）
│
├── query/                   # 查询子系统
│   ├── config.ts            # 查询配置快照
│   ├── deps.ts              # 依赖注入
│   ├── transitions.ts       # 状态转换
│   ├── stopHooks.ts         # 停止钩子（473 行）
│   └── tokenBudget.ts       # Token 预算（93 行）
│
├── state/                   # 应用状态
│   ├── store.ts             # 通用 Store（35 行）
│   ├── AppStateStore.ts     # AppState 定义（570 行）
│   ├── selectors.ts         # 状态选择器
│   └── onChangeAppState.ts  # 状态变更监听
│
├── tools/                   # 54 个工具实现
│   ├── AgentTool/           # Sub-Agent 调用
│   ├── BashTool/            # Shell 执行
│   ├── FileReadTool/        # 文件读取
│   ├── FileWriteTool/       # 文件写入
│   ├── FileEditTool/        # 文件编辑
│   ├── GlobTool/            # 文件搜索
│   ├── GrepTool/            # 内容搜索
│   ├── WebSearchTool/       # Web 搜索
│   ├── WebFetchTool/        # URL 抓取
│   ├── SkillTool/           # 技能调用
│   ├── MCPTool/             # MCP 工具
│   ├── LSPTool/             # 语言服务器
│   ├── NotebookEditTool/    # Jupyter 编辑
│   ├── ToolSearchTool/      # 工具搜索（延迟加载）
│   ├── TaskCreateTool/      # 任务创建
│   ├── TaskGetTool/         # 任务查询
│   ├── TaskUpdateTool/      # 任务更新
│   ├── TaskListTool/        # 任务列表
│   ├── AskUserQuestionTool/ # 用户交互
│   ├── EnterWorktreeTool/   # Git Worktree
│   ├── EnterPlanModeTool/   # 计划模式
│   ├── ExitPlanModeTool/    # 退出计划
│   ├── ConfigTool/          # 配置修改
│   ├── BriefTool/           # 简洁模式
│   ├── MonitorTool/         # 后台监控
│   ├── RemoteTriggerTool/   # 远程触发
│   └── ... (27+ more)
│
├── commands/                # 120+ 命令实现
│   ├── commit.ts            # Git 提交
│   ├── review.ts            # 代码审查
│   ├── init.ts              # 项目初始化
│   ├── insights.ts          # 会话分析
│   ├── compact/             # 压缩命令
│   ├── config/              # 配置 UI
│   ├── model/               # 模型选择
│   ├── permissions/         # 权限编辑
│   ├── hooks/               # Hook 配置
│   ├── skills/              # 技能列表
│   ├── mcp/                 # MCP 配置
│   ├── plugin/              # 插件管理
│   ├── session/             # 会话管理
│   ├── resume/              # 恢复会话
│   └── ... (100+ more)
│
├── services/                # 服务层
│   ├── api/                 # API 客户端（17 文件）
│   │   ├── claude.ts        # 核心 API（36,906+ tokens）
│   │   ├── client.ts        # HTTP 客户端
│   │   ├── errors.ts        # 错误处理
│   │   └── withRetry.ts     # 重试逻辑
│   ├── compact/             # 上下文压缩（16 文件）
│   │   ├── compact.ts       # 核心压缩（1,706 行）
│   │   ├── autoCompact.ts   # 自动压缩
│   │   ├── reactiveCompact.ts # 响应式压缩
│   │   ├── microCompact.ts  # 微压缩
│   │   └── prompt.ts        # 压缩提示词
│   ├── mcp/                 # MCP 集成（24 文件）
│   │   ├── client.ts        # MCP 客户端
│   │   ├── config.ts        # MCP 配置
│   │   └── MCPConnectionManager.tsx
│   ├── tools/               # 工具执行引擎
│   │   ├── toolOrchestration.ts  # 编排（并发/串行）
│   │   ├── toolExecution.ts      # 执行
│   │   ├── toolHooks.ts          # Hook
│   │   └── StreamingToolExecutor.ts # 流式执行
│   ├── analytics/           # 分析与遥测
│   ├── lsp/                 # LSP 客户端
│   ├── oauth/               # OAuth 认证
│   ├── skillSearch/         # 技能搜索
│   ├── plugins/             # 插件管理
│   └── ... (20+ more)
│
├── components/              # UI 组件（406 文件）
│   ├── design-system/       # 设计系统
│   ├── messages/            # 消息渲染（40 文件）
│   ├── PromptInput/         # 输入组件（15 文件）
│   ├── permissions/         # 权限对话框（50 文件）
│   ├── agents/              # Agent UI（20 文件）
│   ├── tasks/               # 任务 UI（12 文件）
│   ├── VirtualMessageList/  # 虚拟列表
│   ├── StatusLine/          # 状态栏
│   ├── LogoV2/              # 动画 Logo
│   └── ...
│
├── ink/                     # Ink 终端渲染（100 文件）
│   ├── components/          # Box, Text, Button, ScrollBox
│   ├── events/              # 键盘/鼠标/焦点事件
│   ├── hooks/               # useInput, useTerminalSize
│   ├── layout/              # Yoga 布局引擎
│   ├── termio/              # ANSI 终端 I/O
│   ├── renderer.ts          # React Reconciler
│   ├── reconciler.ts        # Fiber 协调器
│   └── screen.ts            # 屏幕缓冲
│
├── screens/                 # 顶级屏幕
│   ├── REPL.tsx             # 主交互屏（5,061 行）
│   ├── Doctor.tsx           # 诊断屏
│   └── ResumeConversation.tsx
│
├── hooks/                   # React Hooks（77 文件）
│   ├── useCanUseTool.tsx    # 权限决策（1,100 行）
│   ├── useTextInput.ts      # 输入处理（529 行）
│   ├── useVoice.ts          # 语音（1,144 行）
│   ├── useGlobalKeybindings.tsx
│   ├── useVirtualScroll.ts  # 虚拟滚动（721 行）
│   ├── toolPermission/      # 权限处理器
│   └── notifs/              # 通知 Hook
│
├── keybindings/             # 键绑定系统（12 文件）
│   ├── defaultBindings.ts   # 默认绑定（300+ 行）
│   ├── resolver.ts          # 按键解析
│   ├── parser.ts            # 按键解析器
│   └── KeybindingContext.tsx # Context Provider
│
├── vim/                     # Vim 模式（5 文件）
│   ├── types.ts             # 状态机类型
│   ├── motions.ts           # 动作
│   ├── operators.ts         # 操作符
│   ├── textObjects.ts       # 文本对象
│   └── transitions.ts       # 状态转换
│
├── skills/                  # 技能系统（18+ 文件）
│   ├── loadSkillsDir.ts     # 技能加载（1,086 行）
│   ├── bundledSkills.ts     # 内置注册
│   ├── bundled/             # 内置技能
│   │   ├── updateConfig.ts  # 配置技能（475 行）
│   │   ├── scheduleRemoteAgents.ts
│   │   ├── keybindings.ts   # 键绑定技能
│   │   └── ... (15+ more)
│   └── mcpSkills.ts         # MCP 技能
│
├── plugins/                 # 插件系统
│   ├── builtinPlugins.ts    # 内置插件注册
│   └── bundled/             # 捆绑插件
│
├── bridge/                  # 桥接系统（33 文件，12,619 行）
│   ├── bridgeMain.ts        # 入口（2,999 行）
│   ├── replBridge.ts        # REPL 桥接（2,406 行）
│   ├── bridgeApi.ts         # API 客户端（539 行）
│   ├── sessionRunner.ts     # 会话执行
│   └── ...
│
├── remote/                  # 远程会话（4 文件）
│   ├── RemoteSessionManager.ts
│   ├── SessionsWebSocket.ts
│   └── sdkMessageAdapter.ts
│
├── coordinator/             # 多 Agent 编排
│   ├── coordinatorMode.ts   # 协调器模式（369 行）
│   └── workerAgent.ts       # Worker 类型
│
├── memdir/                  # 记忆系统（9 文件）
│   ├── memdir.ts            # 核心管理（507 行）
│   ├── memoryTypes.ts       # 类型分类（271 行）
│   ├── findRelevantMemories.ts # 语义检索
│   └── memoryScan.ts        # 文件扫描
│
├── buddy/                   # 伴侣系统（6 文件）
│   ├── companion.ts         # 角色生成
│   ├── sprites.ts           # SVG 精灵（514 行）
│   └── CompanionSprite.tsx  # React 组件
│
├── proactive/               # 主动模式（2 文件）
├── voice/                   # 语音模式
├── server/                  # 直连服务器
├── ssh/                     # SSH（存根）
├── cli/                     # CLI 工具
│   ├── print.ts             # 输出格式（5,594 行）
│   ├── structuredIO.ts      # 结构化 I/O（859 行）
│   ├── remoteIO.ts          # 远程 I/O
│   └── update.ts            # 更新系统
│
├── types/                   # 类型定义
├── utils/                   # 工具函数
├── constants/               # 常量
├── schemas/                 # Schema
├── migrations/              # 迁移
├── outputStyles/            # 输出样式
└── native-ts/               # 原生 TS 替代
    ├── yoga-layout/         # Yoga 布局
    ├── file-index/          # 文件索引
    └── color-diff/          # 颜色差异
```

---

## 三、整体流程逻辑（从启动到对话）

### 3.1 完整启动流程

```
┌─────────────────────────────────────────────────────────────────────┐
│                        CLI 启动 (cli.tsx)                           │
│                                                                     │
│  1. 环境变量设置 (COREPACK_ENABLE_AUTO_PIN, NODE_OPTIONS)           │
│  2. 特性门控检查 (ABLATION_BASELINE)                                │
│  3. 快速路径检测 (--dump-system-prompt, --chrome-mcp)               │
│  4. 调度 main() 入口                                                │
└──────────────────────────────┬──────────────────────────────────────┘
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      main.tsx (4,690 行)                            │
│                                                                     │
│  ┌────── 并行启动优化 (~135ms) ──────┐                              │
│  │  • MDM 子进程读取                  │                              │
│  │  • Keychain OAuth 预取             │                              │
│  │  • 模块加载                        │                              │
│  └───────────────────────────────────┘                              │
│                                                                     │
│  5. Commander.js 参数解析                                           │
│  6. init() 初始化（memoized，仅执行一次）                            │
│     ├── 配置验证 (enableConfigs)                                    │
│     ├── 安全环境变量（信任对话前）                                    │
│     ├── 优雅关机注册                                                │
│     ├── 1P 事件日志初始化                                           │
│     ├── OAuth 账户信息                                              │
│     ├── mTLS + HTTP Agent                                           │
│     └── API 预连接                                                  │
│                                                                     │
│  7. 信任对话框 (TrustDialog)                                        │
│  8. 远程管理设置加载                                                │
│  9. 遥测初始化 (OpenTelemetry)                                      │
│  10. 全量环境变量（信任后）                                          │
└──────────────────────────────┬──────────────────────────────────────┘
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      setup.ts (~800 行)                             │
│                                                                     │
│  11. Node.js 版本验证 (≥18)                                        │
│  12. Session ID 管理                                                │
│  13. CWD + Hook 初始化                                              │
│  14. Worktree 创建（可选）                                          │
│  15. tmux 会话（可选）                                              │
│  16. 后台作业初始化                                                 │
│  17. 插件预加载                                                     │
│  18. 权限验证                                                       │
│  19. 遥测 Beacon                                                    │
└──────────────────────────────┬──────────────────────────────────────┘
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    REPL 屏幕 (screens/REPL.tsx)                     │
│                                                                     │
│  React 组件树:                                                      │
│  <BootstrapBoundary>                                                │
│    <FpsMetricsProvider>                                              │
│      <StatsProvider>                                                 │
│        <AppStateProvider>                                            │
│          <KeybindingSetup>                                           │
│            <ThemeProvider>                                            │
│              <REPL />  (5,061 行主循环)                              │
│            </ThemeProvider>                                           │
│          </KeybindingSetup>                                           │
│        </AppStateProvider>                                            │
│      </StatsProvider>                                                 │
│    </FpsMetricsProvider>                                              │
│  </BootstrapBoundary>                                                │
└──────────────────────────────┬──────────────────────────────────────┘
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                  用户输入 → 查询处理循环                             │
│                                                                     │
│  PromptInput → useTextInput → onSubmit                              │
│        ↓                                                            │
│  QueryEngine.submitMessage()                                        │
│        ↓                                                            │
│  query() → queryLoop()                                              │
│        ↓                                                            │
│  ┌─── 多轮循环 ───────────────────────┐                            │
│  │ 1. callModel() 流式 API 调用       │                            │
│  │ 2. 接收 Assistant 响应             │                            │
│  │ 3. 解析 tool_use 块               │                            │
│  │ 4. runTools() 执行工具             │                            │
│  │    ├── 只读工具 → 并发执行         │                            │
│  │    └── 变更工具 → 串行执行         │                            │
│  │ 5. 权限检查 (canUseTool)           │                            │
│  │ 6. 上下文压缩检查                  │                            │
│  │    ├── autoCompact (阈值触发)      │                            │
│  │    ├── reactiveCompact (错误恢复)  │                            │
│  │    └── microCompact (增量)         │                            │
│  │ 7. Token 预算检查                  │                            │
│  │ 8. 模型降级检查                    │                            │
│  └────────────────────────────────────┘                            │
│        ↓                                                            │
│  handleStopHooks()                                                  │
│  ├── 执行 Stop hooks                                               │
│  ├── 记忆提取（后台）                                              │
│  ├── Auto-Dream（后台）                                            │
│  ├── 提示建议（后台）                                              │
│  └── 任务完成 hooks                                                │
└─────────────────────────────────────────────────────────────────────┘
```

### 3.2 关键代码路径

```typescript
// QueryEngine.submitMessage() - 主入口
async *submitMessage(prompt, options): AsyncGenerator<SDKMessage> {
  // 1. 组装系统提示词
  const systemPrompt = await fetchSystemPromptParts()
  const systemContext = await getSystemContext()  // git状态
  const userContext = await getUserContext()       // CLAUDE.md + 日期

  // 2. 记录转录
  recordTranscript(userMessage)

  // 3. 权限包装
  const wrappedCanUseTool = wrapWithDenialTracking(canUseTool)

  // 4. 进入核心循环
  for await (const event of query({
    messages, systemPrompt, userContext, systemContext,
    canUseTool: wrappedCanUseTool,
    toolUseContext, fallbackModel, querySource
  })) {
    yield convertToSDKMessage(event)
  }
}

// query() - 核心循环
async function* query(params: QueryParams) {
  const config = buildQueryConfig()   // 快照配置
  const deps = productionDeps()       // 注入依赖

  while (true) {
    // 调用模型
    const response = await deps.callModel(messages, ...)

    // 恢复路径
    if (isPromptTooLong(response)) {
      await deps.autocompact(messages, ...)  // 自动压缩
      continue
    }
    if (isFallbackTriggered(response)) {
      switchToFallbackModel()  // 模型降级
      continue
    }

    // 执行工具
    for await (const update of runTools(toolUses, ...)) {
      yield update.message
    }

    // 退出条件
    if (response.stop_reason === 'end_turn') break
    if (turnCount >= maxTurns) break
  }

  // 停止钩子
  yield* handleStopHooks(messages, context)
}
```

---

## 四、核心模块详解

### 4.1 启动与引导 — entrypoints/ + bootstrap/

#### 入口文件链

| 文件                  | 行数  | 职责                                   |
| --------------------- | ----- | -------------------------------------- |
| `entrypoints/cli.tsx` | 302   | CLI 入口，环境设置，快速路径           |
| `main.tsx`            | 4,690 | 主入口，参数解析，会话生命周期         |
| `entrypoints/init.ts` | 340   | 异步初始化（memoized），配置/安全/遥测 |
| `setup.ts`            | ~800  | 会话级初始化，worktree/tmux/权限/插件  |
| `replLauncher.tsx`    | ~20   | REPL 启动器（动态导入组件）            |
| `dialogLaunchers.tsx` | ~250  | 对话框启动器（7 个异步 launcher）      |

#### bootstrap/state.ts（全局状态单例 - 1,758 行）

这是整个应用的全局状态单例，通过 getter/setter 函数对管理所有会话级状态：

```typescript
// 状态类别：
// 1. 会话标识: sessionId, parentSessionId, projectRoot
// 2. 指标统计: totalCostUSD, totalAPIDuration, totalToolDuration
// 3. 模型状态: mainLoopModelOverride, modelStrings, modelUsage
// 4. 权限: allowedSettingSources, sessionBypassPermissionsMode
// 5. 遥测: meter, counters, tracers (OpenTelemetry)
// 6. UI 状态: agentColorMap, planSlugCache, invokedSkills
// 7. Hook/插件: registeredHooks, inlinePlugins

// 关键模式：
// - Memoized 状态: 模块级单例避免多实例
// - 信号发布: createSignal() 响应式变更
// - 特性门控: 按 KAIROS, COORDINATOR_MODE 等条件化
```

#### 启动性能优化

```
timeline (ms)
0           50          100         135
├───────────┼───────────┼───────────┤
│  MDM子进程 ▓▓▓▓▓▓▓▓▓▓▓▓          │
│  Keychain  ▓▓▓▓▓▓▓▓▓▓            │
│  模块加载   ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓│
│            ↑ 并行执行 ↑           │
```

**关键优化点：**

- MDM 读取和 Keychain 预取在模块评估时并行执行
- API 预连接在 setup 阶段预热 TCP+TLS
- 动态导入重模块（assistant/coordinator/telemetry）按需加载
- `feature()` 编译时死代码消除减小 bundle 大小

---

### 4.2 会话主循环 — QueryEngine + query.ts

#### QueryEngine.ts（1,295 行）

每个对话拥有一个 QueryEngine 实例，负责：

| 职责         | 说明                        |
| ------------ | --------------------------- |
| 会话持久化   | 转录记录到磁盘              |
| 权限跟踪     | 拒绝追踪包装                |
| SDK 消息适配 | 内部消息 → SDKMessage       |
| 使用量累计   | 跨轮次 token/cost 汇总      |
| 轮次控制     | maxTurns/maxBudget 强制执行 |

```typescript
class QueryEngine {
  async *submitMessage(prompt, options): AsyncGenerator<SDKMessage>
  interrupt(): void
  getMessages(): readonly Message[]
  getReadFileState(): FileStateCache
  setModel(model: string): void
}
```

#### query.ts（1,729 行）— 核心消息处理引擎

这是整个系统的心脏，实现了多轮对话循环：

```typescript
type State = {
  messages: Message[]
  toolUseContext: ToolUseContext
  autoCompactTracking: AutoCompactTrackingState | undefined
  maxOutputTokensRecoveryCount: number
  hasAttemptedReactiveCompact: boolean
  maxOutputTokensOverride: number | undefined
  pendingToolUseSummary: Promise<ToolUseSummaryMessage | null> | undefined
  stopHookActive: boolean | undefined
  turnCount: number
  transition: Continue | undefined
}
```

**核心循环状态机：**

```
                ┌─────────────┐
                │  callModel  │ ← 流式 API 调用
                └──────┬──────┘
                       │
            ┌──────────┼──────────┐
            ▼          ▼          ▼
     ┌──────────┐ ┌────────┐ ┌─────────────┐
     │ 正常响应  │ │PTL错误 │ │ MaxOutput  │
     │          │ │        │ │   错误      │
     └────┬─────┘ └───┬────┘ └──────┬──────┘
          │           │             │
          │    ┌──────▼──────┐  ┌───▼──────────┐
          │    │reactiveCompact│ │截断重试(retry)│
          │    │ /contextCollapse│ └──────────────┘
          │    └──────┬──────┘
          │           │
          ▼           ▼
     ┌──────────────────────┐
     │     runTools()       │
     │  ├─ 只读 → 并发      │
     │  └─ 变更 → 串行      │
     └──────────┬───────────┘
                │
     ┌──────────▼───────────┐
     │  自动压缩检查          │
     │  ├─ autoCompact      │
     │  ├─ microCompact     │
     │  └─ tokenBudget      │
     └──────────┬───────────┘
                │
     ┌──────────▼───────────┐
     │  退出条件检查          │
     │  ├─ end_turn         │
     │  ├─ maxTurns         │
     │  ├─ maxBudget        │
     │  └─ user abort       │
     └──────────┬───────────┘
                │
     ┌──────────▼───────────┐
     │  handleStopHooks()   │
     │  ├─ Stop hooks       │
     │  ├─ extractMemories  │
     │  ├─ autoDream        │
     │  └─ promptSuggestion │
     └─────────────────────┘
```

#### 依赖注入模式 (query/deps.ts)

```typescript
type QueryDeps = {
  callModel: typeof queryModelWithStreaming
  microcompact: typeof microcompactMessages
  autocompact: typeof autoCompactIfNeeded
  uuid: () => string
}

function productionDeps(): QueryDeps {
  return {
    callModel: queryModelWithStreaming,
    microcompact: microcompactMessages,
    autocompact: autoCompactIfNeeded,
    uuid: randomUUID,
  }
}
```

#### Token 预算 (query/tokenBudget.ts)

```typescript
// 决策逻辑：
// - < 90% 预算消耗 且 无递减 → 继续（nudge message）
// - 递减检测：连续 2 轮 delta < 500 tokens 且 3+ 续发 → 停止
// - 子 Agent 跳过（不使用 token budget）
type BudgetTracker = {
  continuationCount: number
  lastDeltaTokens: number
  lastGlobalTurnTokens: number
  startedAt: number
}
```

---

### 4.3 工具系统 — Tool.ts + tools/

#### Tool.ts（792 行）— 工具接口定义

这是 Claude Code 最核心的类型系统之一：

```typescript
interface Tool<Input, Output, Progress> {
  // 标识
  name: string
  aliases?: string[]

  // Schema
  inputSchema: ZodSchema<Input>
  inputJSONSchema?: JSONSchema // MCP 兼容

  // 核心方法
  call(args, context, canUseTool, parent, onProgress?): Promise<ToolResult>
  description(input, options): Promise<string>
  prompt(options): string // 系统提示内容

  // 权限
  checkPermissions(input, context): PermissionResult
  validateInput(input, context): ValidationResult
  preparePermissionMatcher(input): PermissionMatcher
  getPath(input): string // 文件路径提取

  // 元数据
  isReadOnly(input): boolean
  isDestructive(input): boolean // 不可逆（删除/发送）
  isConcurrencySafe(input): boolean // 可并行
  isEnabled(): boolean // 特性门控
  shouldDefer?: boolean // 延迟加载
  alwaysLoad?: boolean // 始终加载

  // 渲染
  renderToolUseMessage(input, options): ReactNode
  renderToolResultMessage(output, progress, options): ReactNode
  renderGroupedToolUse(toolUses, options): ReactNode

  // 高级
  interruptBehavior(): 'cancel' | 'block'
  maxResultSizeChars: number
  isMcp: boolean
  isLsp: boolean
}
```

#### 工具注册表 (tools.ts - 389 行)

```typescript
function getAllBaseTools(): Tools {
  return [
    AgentTool, // Sub-Agent 调用
    TaskOutputTool, // 后台任务输出
    BashTool, // Shell 执行
    FileReadTool, // 文件读取
    FileWriteTool, // 文件写入
    FileEditTool, // 文件编辑
    GlobTool, // 文件模式搜索
    GrepTool, // 内容搜索
    SkillTool, // 技能调用
    NotebookEditTool, // Jupyter
    // ... 44+ more tools
  ]
}

// 延迟加载模式
const REPLTool =
  process.env.USER_TYPE === 'ant' ? require('./tools/REPLTool/REPLTool.js').REPLTool : null
```

#### 工具编排 (services/tools/toolOrchestration.ts)

```typescript
// 分区策略：只读工具并发，变更工具串行
function partitionToolCalls(toolUses, context): Batch[] {
  // 连续的只读工具 → 一个并发批次
  // 单个非只读工具 → 一个串行批次
}

async function* runTools(toolUses, ...): AsyncGenerator<MessageUpdate> {
  for (const { isConcurrencySafe, blocks } of partitionToolCalls(toolUses)) {
    if (isConcurrencySafe) {
      // 并发执行（最大 10 并发）
      yield* runToolsConcurrently(blocks, ...)
    } else {
      // 串行执行
      yield* runToolsSerially(blocks, ...)
    }
  }
}
```

#### 工具目录结构（典型）

```
tools/FileReadTool/
├── FileReadTool.ts       # 主实现（buildTool()）
├── prompt.ts             # 系统提示内容
├── UI.ts                 # 渲染组件
├── limits.ts             # Token/大小限制
└── imageProcessor.ts     # 图片处理
```

---

### 4.4 命令系统 — commands.ts + commands/

#### 命令类型体系

```typescript
type Command = CommandBase & (PromptCommand | LocalCommand | LocalJSXCommand)

// PromptCommand: 技能扩展到 prompt 内容
interface PromptCommand {
  type: 'prompt'
  getPromptForCommand(args, context): Promise<ContentBlockParam[]>
  allowedTools?: string[] // 预批准的工具
  context?: 'inline' | 'fork' // 执行模式
}

// LocalCommand: 本地执行
interface LocalCommand {
  type: 'local'
  load(): Promise<LocalCommandModule>
}

// LocalJSXCommand: React/Ink UI
interface LocalJSXCommand {
  type: 'local-jsx'
  load(): Promise<LocalJSXCommandModule>
}
```

#### 命令来源

```
命令来源层级:
┌─────────────────────────────┐
│  内置命令 (120+)             │ ← COMMANDS()
├─────────────────────────────┤
│  Bundled 技能 (18)           │ ← registerBundledSkill()
├─────────────────────────────┤
│  用户技能                    │ ← ~/.claude/skills/*.md
├─────────────────────────────┤
│  项目技能                    │ ← .claude/skills/*.md
├─────────────────────────────┤
│  插件命令                    │ ← ~/.claude/plugins/
├─────────────────────────────┤
│  MCP 命令                    │ ← MCP 服务器
├─────────────────────────────┤
│  工作流命令                  │ ← ~/.claude/workflows/
└─────────────────────────────┘
```

---

### 4.5 任务系统 — Task.ts + tasks/

```typescript
type TaskType =
  | 'local_bash' // 后台 Shell
  | 'local_agent' // 子 Agent
  | 'remote_agent' // 远程 Agent
  | 'in_process_teammate' // 队友
  | 'local_workflow' // 工作流
  | 'monitor_mcp' // MCP 监控
  | 'dream' // 梦境任务

type TaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'killed'

// 任务 ID 生成：<类型前缀><8位随机字符>
// 前缀: bash='b', agent='a', remote='r', teammate='t', workflow='w', monitor='m', dream='d'
// 36^8 ≈ 2.8万亿组合 → 防暴力枚举
```

---

### 4.6 权限系统 — hooks/useCanUseTool + toolPermission/

权限系统是 Claude Code 安全模型的核心：

```
权限决策流程:
┌──────────────────────────┐
│  canUseTool(tool, input) │
└──────────┬───────────────┘
           ▼
┌──────────────────────────┐
│ tool.validateInput()     │ → 验证输入 Schema
└──────────┬───────────────┘
           ▼
┌──────────────────────────┐
│ hasPermissionsToUseTool()│
│ ├─ 自动模式分类器        │ (BashTool 专用)
│ ├─ 权限规则匹配          │ (allow/deny/ask)
│ └─ 沙箱配置检查          │
└──────────┬───────────────┘
           │
     ┌─────┼─────┬────────┐
     ▼     ▼     ▼        ▼
  allow  deny   ask    classifier
           │     │        │
           │     ▼        ▼
           │  ┌────────────────┐
           │  │ 路由到处理器    │
           │  │ ├─ Coordinator │ ← worker 权限
           │  │ ├─ Interactive │ ← 用户 UI 对话框
           │  │ └─ Swarm       │ ← 父协调器
           │  └────────────────┘
           ▼
    记录 + 返回决策
```

---

### 4.7 上下文压缩 — services/compact/

这是 Claude Code 中最复杂的子系统之一（16 个文件，核心 compact.ts 1,706 行）。

#### 压缩策略

| 策略                | 触发条件                 | 工作方式                    |
| ------------------- | ------------------------ | --------------------------- |
| **autoCompact**     | Token 阈值达到           | 主动压缩全部历史            |
| **reactiveCompact** | API 返回 prompt-too-long | 被动恢复，截断 + 重试       |
| **microCompact**    | 增量微调                 | 小量增量压缩                |
| **partialCompact**  | 用户选择消息             | 部分压缩（from/up_to 方向） |
| **snipCompact**     | 特定消息截取             | 精确截取                    |

#### 压缩核心流程

```typescript
async function compactConversation(messages, context, ...): Promise<CompactionResult> {
  // 1. PreCompact hooks
  const hookResult = await executePreCompactHooks(...)

  // 2. 组装压缩请求
  const compactPrompt = getCompactPrompt(customInstructions)
  const summaryRequest = createUserMessage({ content: compactPrompt })

  // 3. 流式摘要生成 (Fork Agent 共享 cache prefix)
  let summaryResponse = await streamCompactSummary({...})

  // 4. PTL 重试循环 (最多 3 次)
  while (summary?.startsWith(PROMPT_TOO_LONG_ERROR_MESSAGE)) {
    const truncated = truncateHeadForPTLRetry(messagesToSummarize, ...)
    if (!truncated) throw new Error(ERROR_MESSAGE_PROMPT_TOO_LONG)
    summaryResponse = await streamCompactSummary({...})
  }

  // 5. 后压缩文件恢复 (最近 5 个文件)
  const fileAttachments = await createPostCompactFileAttachments(...)

  // 6. 计划/技能/工具状态恢复
  const planAttachment = createPlanAttachmentIfNeeded(...)
  const skillAttachment = createSkillAttachmentIfNeeded(...)

  // 7. SessionStart hooks + PostCompact hooks
  const hookMessages = await processSessionStartHooks('compact')

  // 8. 返回结果
  return {
    boundaryMarker,   // 压缩边界标记
    summaryMessages,  // 摘要消息
    attachments,      // 附件
    hookResults,      // Hook 结果
  }
}
```

#### 压缩后状态恢复

```
压缩后自动恢复:
├── 最近 5 个文件内容 (POST_COMPACT_MAX_FILES_TO_RESTORE)
├── 每个文件最多 5,000 tokens (POST_COMPACT_MAX_TOKENS_PER_FILE)
├── 总预算 50,000 tokens (POST_COMPACT_TOKEN_BUDGET)
├── 计划文件 (plan)
├── 已调用技能 (最多 25,000 tokens 技能预算)
├── 延迟工具 Schema
├── Agent 列表
├── MCP 指令
└── 异步 Agent 状态
```

---

### 4.8 API 客户端 — services/api/claude.ts

这是系统中最大的单文件（36,906+ tokens），负责所有与 Claude API 的交互。

#### 关键功能

```typescript
// 核心函数
async function* queryModelWithStreaming({
  messages,
  systemPrompt,
  thinkingConfig,
  tools,
  signal,
  options,
}): AsyncGenerator<StreamEvent | AssistantMessage>

function getMaxOutputTokensForModel(model: string): number

// 关键特性:
// - Beta headers 管理 (AFK_MODE, CONTEXT_1M, EFFORT, FAST_MODE, ...)
// - Prompt cache 优化 (scope: global/session, 1h allowlist)
// - 结构化输出 (JSON output format)
// - Thinking config (adaptive thinking, budget tokens)
// - 工具搜索 (deferred tool loading)
// - Advisor 模式 (dual-model)
// - 成本计算 (calculateUSDCost)
// - 指纹计算 (cache key fingerprint)
// - 速率限制检测 (quota headers)
```

---

### 4.9 状态管理 — state/ + bootstrap/state.ts

#### 极简 Store 实现 (store.ts - 35 行)

```typescript
export function createStore<T>(initialState: T, onChange?: OnChange<T>): Store<T> {
  let state = initialState
  const listeners = new Set<Listener>()

  return {
    getState: () => state,
    setState: (updater) => {
      const prev = state
      const next = updater(prev)
      if (Object.is(next, prev)) return
      state = next
      onChange?.({ newState: next, oldState: prev })
      for (const listener of listeners) listener()
    },
    subscribe: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}
```

#### AppState 类型 (AppStateStore.ts - 570 行)

AppState 包含整个应用的完整状态：

```typescript
type AppState = DeepImmutable<{
  settings: SettingsJson
  mainLoopModel: ModelSetting
  toolPermissionContext: ToolPermissionContext
  kairosEnabled: boolean
  thinkingEnabled: boolean | undefined
  effortValue?: EffortValue
  fastMode?: boolean
  // ... 60+ 字段
}> & {
  tasks: { [taskId: string]: TaskState }
  agentNameRegistry: Map<string, AgentId>
  mcp: { clients; tools; commands; resources }
  plugins: { enabled; disabled; commands; errors }
  todos: { [agentId: string]: TodoList }
  // ... 40+ 可变字段
}
```

---

### 4.10 UI 渲染层 — ink/ + components/ + screens/

#### Ink 终端渲染器（100 个文件）

Claude Code 内置了一套完整的终端 React 渲染器：

```
ink/
├── reconciler.ts       # 自定义 React Fiber 协调器
├── renderer.ts         # 渲染管道
├── screen.ts           # 屏幕缓冲 (Blit 优化)
├── components/
│   ├── Box.tsx         # Flexbox 布局（支持 onClick/onFocus）
│   ├── Text.tsx        # 文本渲染（颜色/粗体/删除线）
│   ├── Button.tsx      # 交互按钮
│   ├── ScrollBox.tsx   # 滚动容器
│   ├── Link.tsx        # 超链接
│   └── AlternateScreen.tsx  # 全屏模式+鼠标
├── layout/
│   ├── engine.ts       # Yoga Flexbox 布局计算
│   ├── node.ts         # 布局节点
│   └── yoga.ts         # Yoga 封装
├── events/
│   ├── keyboard-event.ts  # 键盘（修饰键）
│   ├── click-event.ts     # 鼠标点击
│   ├── focus-event.ts     # 焦点
│   └── dispatcher.ts      # 事件分发
├── hooks/
│   ├── useInput.ts         # 键盘输入
│   ├── useTerminalSize.ts  # 终端尺寸
│   ├── useAnimationFrame.ts # 动画帧
│   └── useSelection.ts     # 文本选择
└── termio/
    ├── parser.ts       # ANSI 转义解析
    ├── tokenize.ts     # 词法分析
    ├── csi.ts/osc.ts   # 控制序列
    └── sgr.ts          # 颜色样式
```

#### REPL.tsx — 主交互屏幕（5,061 行）

这是整个 UI 的核心，管理：消息历史、输入缓冲、键绑定、权限、MCP 客户端、Agent 状态。

#### 组件分类统计

| 类别       | 文件数 | 关键组件                                                |
| ---------- | ------ | ------------------------------------------------------- |
| 消息渲染   | ~40    | AssistantTextMessage, UserPromptMessage, ToolUseMessage |
| 输入       | ~15    | PromptInput, HistorySearchInput, VimTextInput           |
| 权限对话框 | ~50    | PermissionRequest, BashPermission, FilePermission       |
| 设计系统   | ~13    | ThemedBox, ThemedText, Dialog, Pane, FuzzyPicker        |
| Agent/任务 | ~30    | AgentProgressLine, TeammateView, TaskPanel              |
| 特殊       | ~50    | VirtualMessageList, StatusLine, LogoV2, Spinner         |

#### 性能优化

- **VirtualMessageList**: 仅渲染可见消息（支持 2000+ 消息会话）
- **React Compiler Runtime**: `_c` 变量自动 memo 化
- **Blit 优化**: 增量屏幕更新（避免全屏重绘）
- **文本测量缓存**: 避免重复 Unicode 宽度计算
- **选择器模式**: `useAppState(s => s.messages)` 精确订阅

---

### 4.11 MCP 集成 — services/mcp/（24 个文件）

```
services/mcp/
├── client.ts                    # MCP 客户端
├── config.ts                    # MCP 服务器配置
├── MCPConnectionManager.tsx     # 连接管理 React 组件
├── auth.ts                      # OAuth 认证
├── channelAllowlist.ts          # 频道白名单
├── channelPermissions.ts        # 频道权限
├── claudeai.ts                  # Claude.ai MCP
├── elicitationHandler.ts        # 信息征集
├── envExpansion.ts              # 环境变量展开
├── normalization.ts             # 名称规范化
├── officialRegistry.ts          # 官方注册表
├── types.ts                     # 类型定义
├── InProcessTransport.ts        # 进程内传输
├── SdkControlTransport.ts       # SDK 控制传输
└── vscodeSdkMcp.ts              # VS Code SDK MCP
```

**MCP 作为独立服务器 (entrypoints/mcp.ts)：**

```typescript
async function startMCPServer(cwd, debug, verbose): Promise<void> {
  // 1. 初始化 MCP Server (stdio transport)
  // 2. ListToolsRequest → 转换 Zod Schema 到 JSON Schema
  // 3. CallToolRequest → 创建 ToolUseContext → 执行工具 → 返回结果
}
```

---

### 4.12 Skill 技能系统 — skills/

#### 技能加载器 (loadSkillsDir.ts - 1,086 行)

```typescript
// 技能发现路径:
// 1. ~/.claude/skills/*.md (用户级)
// 2. .claude/skills/*.md   (项目级)
// 3. bundled skills        (内置 TS 注册)
// 4. MCP skills            (MCP 服务器提供)

// 技能文件格式:
// ---
// name: skill-name
// description: what it does
// tags: [tag1, tag2]
// allowed-tools: [BashTool, FileReadTool]
// model: claude-opus-4-7
// ---
// <技能 prompt 内容>

// 去重规则: user > project > bundled (同名覆盖)
```

#### 内置技能列表

| 技能                 | 行数 | 功能                         |
| -------------------- | ---- | ---------------------------- |
| updateConfig         | 475  | 配置管理（JSON Schema 生成） |
| scheduleRemoteAgents | 447  | Cron 后台调度                |
| keybindings          | 339  | 键绑定配置                   |
| claudeApi            | 196  | Claude API 指南              |
| skillify             | 197  | Prompt → Skill 转换          |
| batch                | 124  | 批量 API 编排                |
| debug                | 103  | 调试工具                     |
| loop                 | 92   | 循环调度                     |
| remember             | 82   | 记忆检查                     |
| stuck                | 79   | 故障排查                     |
| verify               | 30   | 内容验证                     |

---

### 4.13 Bridge 桥接系统 — bridge/（33 文件，12,619 行）

这是 Claude Code 中最大的子系统，负责远程会话桥接。

#### 多层 RPC 架构

```
Layer 1: HTTP 客户端 (bridgeApi.ts)
  └── Environments API (轮询工作 + 认证)

Layer 2: 会话执行器 (sessionRunner.ts)
  └── 接收密钥 → 启动 REPL → 消息转发

Layer 3: REPL IPC (replBridge.ts - 2,406 行)
  └── 子进程 stdin/stdout 双向通信

Layer 4: 消息翻译 (bridgeMessaging.ts)
  └── SDK 消息 ↔ 内部消息格式

Layer 5: 权限桥接 (bridgePermissionCallbacks.ts)
  └── 远程 tool_use_confirm 流
```

#### 连接状态机

```
polling → received_secret → spawning_repl → forwarding_messages
    ↑                                           │
    └── timeout / error ←──────────────────────┘
```

---

### 4.14 Remote 远程会话 — remote/（4 文件，1,127 行）

```typescript
class RemoteSessionManager {
  // WebSocket 通信管理
  // 权限请求/响应路由
  // SDK 消息适配
}

class SessionsWebSocket {
  // 浏览器/Node 双兼容 WebSocket
  // 指数退避重连
  // Keep-alive 心跳
  // OAuth 401 刷新
}
```

---

### 4.15 Memory 记忆系统 — memdir/（9 文件，1,737 行）

#### 分层记忆架构

```
CLAUDE.md (项目公开)
├── CLAUDE.local.md (个人本地)
├── .claude/memories/ (自动管理)
│   ├── user_role.md        (type: user)
│   ├── feedback_testing.md (type: feedback)
│   ├── project_auth.md     (type: project)
│   └── reference_linear.md (type: reference)
└── Team Memory (组织级，Git 支持)
```

#### 记忆类型

| 类型      | 作用域    | 说明                        |
| --------- | --------- | --------------------------- |
| user      | 私有      | 用户角色、偏好、知识水平    |
| feedback  | 默认私有  | 工作方式指导（纠正 + 确认） |
| project   | 私有/团队 | 项目进展、目标、截止日期    |
| reference | 私有      | 外部系统指向                |

#### 语义检索

```typescript
async function findRelevantMemories(
  manifest: string,
  query: string,
  alreadySurfaced: Set<string>,
): Promise<RelevantMemory[]> {
  // 使用 Claude Sonnet 语义选择最多 5 个相关记忆
  // 过滤已浮现的文件
  // 记录检索遥测
}
```

---

### 4.16 服务层 — services/ 其他模块

| 模块                   | 文件数 | 功能                                    |
| ---------------------- | ------ | --------------------------------------- |
| analytics/             | 7      | GrowthBook 特性门控 + Datadog + 1P 事件 |
| lsp/                   | 8      | LSP 客户端（诊断、跳转、重命名）        |
| oauth/                 | 6      | OAuth 2.0 认证流程                      |
| tips/                  | 4      | 使用提示调度                            |
| plugins/               | 3      | 插件安装/同步                           |
| policyLimits/          | 2      | 策略限制检查                            |
| contextCollapse/       | 3      | 上下文折叠恢复                          |
| extractMemories/       | 2      | 记忆提取（后台）                        |
| autoDream/             | 4      | 自动梦境（后台整理）                    |
| PromptSuggestion/      | 2      | 提示建议                                |
| SessionMemory/         | 3      | 会话记忆                                |
| MagicDocs/             | 2      | 文档生成                                |
| AgentSummary/          | 1      | Agent 摘要                              |
| teamMemorySync/        | 5      | 团队记忆同步                            |
| settingsSync/          | 2      | 设置同步                                |
| remoteManagedSettings/ | 5      | 远程托管设置                            |
| tokenEstimation        | 1      | Token 估算（~4 字符/token）             |
| preventSleep           | 1      | 防休眠                                  |
| vcr                    | 1      | 录制/回放                               |
| notifier               | 1      | 系统通知                                |
| voice/voiceStreamSTT   | 2      | 语音转文字                              |

---

### 4.17 键绑定系统 — keybindings/（12 文件）

#### 键弦序列支持

```typescript
// 支持 Chord 序列: ctrl+x ctrl+k → killAgents
// 解析流程:
// 1. 第一次按键: ctrl+x → chord_started, pending = [ctrl+x]
// 2. 第二次按键: ctrl+k → 查找 "ctrl+x ctrl+k" → match{action}
// 3. 超时/不匹配 → chord_cancelled

type ResolveResult =
  | { type: 'match'; action: string }
  | { type: 'none' }
  | { type: 'unbound' }
  | { type: 'chord_started'; pending: ParsedKeystroke[] }
  | { type: 'chord_cancelled' }
```

#### 上下文优先级

```
解析优先级: registered contexts > component context > Global
上下文类型: Global, Chat, Autocomplete, Settings, Confirmation, Transcript, Task
```

---

### 4.18 Vim 模式 — vim/（5 文件）

```typescript
type VimState = { mode: 'INSERT'; insertedText: string } | { mode: 'NORMAL'; command: CommandState }

// 支持的操作:
// 动作: h/j/k/l, w/b/e, ^/$, 0, gg, G
// 操作符: d(delete), c(change), y(yank)
// 文本对象: w/W, quotes, parens, brackets, braces
// 命令: .(dot-repeat), /find, x, ~, <<, >>
```

---

### 4.19 Coordinator 多 Agent 编排 — coordinator/

```typescript
// 协调器模式: CLAUDE_CODE_COORDINATOR_MODE=true
// 协调器 → 生成 Worker Agent → Agent 工具调用
// Worker 只能使用受限工具集 (ASYNC_AGENT_ALLOWED_TOOLS)

// 工作流:
// Research → Synthesis → Implementation → Verification
// 关键约束: Worker prompt 必须自包含(看不到协调器对话)
```

---

### 4.20 Buddy 伴侣系统 — buddy/（6 文件，1,298 行）

```typescript
// 确定性角色生成: Hash(username) → Mulberry32 PRNG
// 稀有度: common | uncommon | rare | epic | legendary
// 物种: duck, goose, blob, cat, dragon, octopus, owl, penguin, ...
// SVG 精灵: 514 行程序化生成
// 情绪系统: happy, surprised, sad, thinking, celebrating
```

---

## 五、调用依赖关系

### 5.1 核心调用链

```
用户输入
  │
  ▼
main.tsx
  ├── init() [entrypoints/init.ts]
  │   ├── enableConfigs()
  │   ├── managedEnv.applySafeEnvVars()
  │   ├── OAuth.populateAccountInfo()
  │   └── telemetry.initialize()
  │
  ├── setup() [setup.ts]
  │   ├── bootstrap/state.ts → setProjectRoot/setCwdState
  │   ├── utils/hooks.ts → captureHooksSnapshot
  │   ├── utils/worktree.ts → createWorktree
  │   └── commands.ts → loadAllCommands
  │
  └── launchRepl() [replLauncher.tsx]
      └── REPL.tsx
          ├── useQueueProcessor → onSubmit
          │   └── QueryEngine.submitMessage()
          │       ├── context.ts → getSystemContext/getUserContext
          │       ├── utils/systemPrompt.ts → fetchSystemPromptParts
          │       └── query.ts → query()
          │           ├── deps.callModel() → services/api/claude.ts
          │           │   └── @anthropic-ai/sdk → Claude API
          │           ├── runTools() → services/tools/toolOrchestration.ts
          │           │   ├── partitionToolCalls() → 分区
          │           │   ├── runToolsConcurrently() → 并发只读
          │           │   └── runToolsSerially() → 串行变更
          │           ├── autoCompactIfNeeded() → services/compact/autoCompact.ts
          │           │   └── compactConversation() → services/compact/compact.ts
          │           └── handleStopHooks() → query/stopHooks.ts
          │               ├── executeStopHooks()
          │               ├── extractMemories() [后台]
          │               └── autoDream() [后台]
          │
          ├── useCanUseTool() [hooks/useCanUseTool.tsx]
          │   └── toolPermission/PermissionContext.ts
          │       ├── coordinatorHandler.js
          │       ├── interactiveHandler.js
          │       └── swarmWorkerHandler.js
          │
          ├── useMergedTools() → tools.ts + services/mcp/
          │
          └── useManageMCPConnections() → services/mcp/MCPConnectionManager.tsx
```

### 5.2 模块依赖图

```
                     ┌───────────┐
                     │  main.tsx │
                     └─────┬─────┘
                           │
           ┌───────────────┼───────────────┐
           ▼               ▼               ▼
    ┌──────────┐    ┌───────────┐    ┌──────────┐
    │ init.ts  │    │ setup.ts  │    │ REPL.tsx │
    └────┬─────┘    └─────┬─────┘    └────┬─────┘
         │                │               │
         ▼                ▼               ▼
   ┌───────────┐   ┌───────────┐   ┌──────────────┐
   │bootstrap/ │   │ commands  │   │ QueryEngine  │
   │ state.ts  │   │   .ts     │   │     .ts      │
   └─────┬─────┘   └─────┬─────┘   └──────┬───────┘
         │                │               │
         ▼                ▼               ▼
   ┌───────────┐   ┌───────────┐   ┌──────────────┐
   │  state/   │   │ commands/ │   │  query.ts    │
   │ store.ts  │   │  skills/  │   │  query/      │
   └───────────┘   │  plugins/ │   └──────┬───────┘
                   └───────────┘          │
                                   ┌──────┼──────────┐
                                   ▼      ▼          ▼
                            ┌─────────┐ ┌──────┐ ┌──────────┐
                            │api/     │ │tools/│ │ compact/ │
                            │claude.ts│ │      │ │          │
                            └────┬────┘ └──┬───┘ └──────────┘
                                 │         │
                                 ▼         ▼
                          ┌───────────┐ ┌────────────┐
                          │  Anthropic│ │ 54 工具     │
                          │    SDK    │ │ 实现       │
                          └───────────┘ └────────────┘
```

---

## 六、流程逻辑图

### 6.1 完整查询处理流程

```
┌─────────────────────────────────────────────────────────────────┐
│                     查询处理完整流程                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  User Input                                                     │
│      │                                                          │
│      ▼                                                          │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ QueryEngine.submitMessage()                              │   │
│  │  1. fetchSystemPromptParts()                             │   │
│  │  2. getSystemContext() → git status                      │   │
│  │  3. getUserContext() → CLAUDE.md + date                  │   │
│  │  4. recordTranscript()                                   │   │
│  │  5. wrapCanUseTool() → denial tracking                   │   │
│  └──────────────────────┬───────────────────────────────────┘   │
│                         ▼                                       │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ query()                                                   │   │
│  │  1. buildQueryConfig() → snapshot gates                   │   │
│  │  2. productionDeps() → inject I/O                         │   │
│  │  3. startRelevantMemoryPrefetch()                         │   │
│  │                                                           │   │
│  │  ┌── LOOP ─────────────────────────────────────────────┐ │   │
│  │  │                                                      │ │   │
│  │  │  deps.callModel()                                    │ │   │
│  │  │      │                                               │ │   │
│  │  │      ├── Stream Events → yield to UI                 │ │   │
│  │  │      │                                               │ │   │
│  │  │      ├── Error Recovery                              │ │   │
│  │  │      │   ├── PTL → reactiveCompact                   │ │   │
│  │  │      │   ├── PTL → contextCollapse                   │ │   │
│  │  │      │   ├── Fallback → switch model                 │ │   │
│  │  │      │   └── MaxOutput → truncation retry            │ │   │
│  │  │      │                                               │ │   │
│  │  │      ▼                                               │ │   │
│  │  │  runTools()                                          │ │   │
│  │  │   ├── partitionToolCalls()                           │ │   │
│  │  │   │   ├── 只读批次 → runToolsConcurrently (max 10)  │ │   │
│  │  │   │   └── 变更批次 → runToolsSerially               │ │   │
│  │  │   │                                                  │ │   │
│  │  │   ├── canUseTool() → 权限检查                       │ │   │
│  │  │   │   ├── allow → 执行                              │ │   │
│  │  │   │   ├── deny → 记录 + 拒绝                        │ │   │
│  │  │   │   └── ask → UI 对话框                            │ │   │
│  │  │   │                                                  │ │   │
│  │  │   └── tool.call() → ToolResult                       │ │   │
│  │  │                                                      │ │   │
│  │  │  Auto-Compact Check                                  │ │   │
│  │  │   ├── calculateTokenWarningState()                   │ │   │
│  │  │   ├── autoCompactIfNeeded()                          │ │   │
│  │  │   └── microcompactMessages()                         │ │   │
│  │  │                                                      │ │   │
│  │  │  Token Budget Check                                  │ │   │
│  │  │   └── checkTokenBudget() → continue/stop             │ │   │
│  │  │                                                      │ │   │
│  │  │  Exit Conditions                                     │ │   │
│  │  │   ├── stop_reason === 'end_turn'                     │ │   │
│  │  │   ├── no tool_use                                    │ │   │
│  │  │   ├── turnCount >= maxTurns                          │ │   │
│  │  │   └── cost >= maxBudgetUsd                           │ │   │
│  │  └─────────────────────────────────────────────────────┘ │   │
│  │                                                           │   │
│  │  handleStopHooks()                                        │   │
│  │   ├── executeStopHooks()                                  │   │
│  │   ├── [teammate] executeTaskCompletedHooks()              │   │
│  │   ├── [teammate] executeTeammateIdleHooks()               │   │
│  │   ├── [background] extractMemories()                      │   │
│  │   ├── [background] autoDream()                            │   │
│  │   ├── [background] promptSuggestion()                     │   │
│  │   └── [chicago] cleanupComputerUseAfterTurn()             │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 6.2 工具执行流程

```
┌──────────────────────────────────────────────┐
│                工具执行流程                    │
├──────────────────────────────────────────────┤
│                                              │
│  Assistant Response (含 tool_use blocks)      │
│      │                                       │
│      ▼                                       │
│  partitionToolCalls()                        │
│      │                                       │
│      ├── [ReadOnly: true] ──► 并发批次       │
│      │   ├── FileRead #1  ──┐               │
│      │   ├── FileRead #2  ──┤ max(10)       │
│      │   └── Grep #1     ──┘               │
│      │                                       │
│      ├── [ReadOnly: false] ──► 串行批次      │
│      │   └── FileEdit #1                    │
│      │                                       │
│      ├── [ReadOnly: true] ──► 并发批次       │
│      │   └── FileRead #3                    │
│      │                                       │
│      └── [ReadOnly: false] ──► 串行批次      │
│          └── BashTool #1                    │
│                                              │
│  每个工具执行:                                │
│  ┌──────────────────────────────────┐        │
│  │ 1. validateInput() → Schema 验证 │        │
│  │ 2. canUseTool()    → 权限决策    │        │
│  │ 3. tool.call()     → 执行        │        │
│  │ 4. 结果处理                      │        │
│  │    ├── ToolResult → 成功         │        │
│  │    ├── Error → 错误消息          │        │
│  │    └── Progress → 进度事件       │        │
│  └──────────────────────────────────┘        │
└──────────────────────────────────────────────┘
```

### 6.3 上下文压缩流程

```
┌──────────────────────────────────────────────────┐
│              上下文压缩流程                        │
├──────────────────────────────────────────────────┤
│                                                  │
│  Token 使用量 → 阈值检测                          │
│      │                                           │
│      ├── 主动: autoCompactIfNeeded()             │
│      │   └── 达到阈值 → compactConversation()    │
│      │                                           │
│      ├── 被动: prompt-too-long 错误              │
│      │   └── reactiveCompact → 截断 + 重试       │
│      │                                           │
│      └── 增量: microcompactMessages()            │
│          └── 小量增量压缩                         │
│                                                  │
│  compactConversation():                          │
│  ┌──────────────────────────────────────────┐    │
│  │ 1. executePreCompactHooks()              │    │
│  │ 2. stripImagesFromMessages()             │    │
│  │ 3. stripReinjectedAttachments()          │    │
│  │ 4. streamCompactSummary()                │    │
│  │    ├── Fork Agent (cache 共享) ← 优先    │    │
│  │    └── Regular streaming ← 降级          │    │
│  │ 5. PTL 重试 (最多 3 次)                   │    │
│  │    └── truncateHeadForPTLRetry()         │    │
│  │ 6. 清理状态                               │    │
│  │    ├── readFileState.clear()             │    │
│  │    └── loadedNestedMemoryPaths.clear()   │    │
│  │ 7. 恢复关键状态                           │    │
│  │    ├── 文件附件 (最近 5 个)               │    │
│  │    ├── 异步 Agent 状态                    │    │
│  │    ├── 计划文件                           │    │
│  │    ├── 计划模式指令                       │    │
│  │    ├── 已调用技能                         │    │
│  │    ├── 延迟工具 Delta                     │    │
│  │    ├── Agent 列表 Delta                   │    │
│  │    └── MCP 指令 Delta                     │    │
│  │ 8. processSessionStartHooks('compact')   │    │
│  │ 9. executePostCompactHooks()             │    │
│  │ 10. reAppendSessionMetadata()            │    │
│  └──────────────────────────────────────────┘    │
│                                                  │
│  压缩后 Token 预算:                              │
│  ├── 文件恢复:   50,000 tokens 总预算            │
│  │   └── 每文件: 5,000 tokens 上限               │
│  ├── 技能恢复:   25,000 tokens 总预算            │
│  │   └── 每技能: 5,000 tokens 上限               │
│  └── 输出上限:   COMPACT_MAX_OUTPUT_TOKENS       │
└──────────────────────────────────────────────────┘
```

---

## 七、X-Mars-Coding 借鉴分析

### 7.1 X-Mars-Coding 现有架构概览

```
x-mars-coding/ (26 个包，pnpm monorepo + Nx)
├── @x-mars/agent       # 核心执行引擎 (状态机)
├── @x-mars/ai          # Anthropic API 抽象
├── @x-mars/cli         # CLI 入口
├── @x-mars/coding      # DI 容器 (XMarsApp)
├── @x-mars/hooks       # 31+ 生命周期 Hook
├── @x-mars/tools       # 47 个工具
├── @x-mars/service     # HTTP + WebSocket (Hono)
├── @x-mars/session     # SQLite 会话存储
├── @x-mars/memory      # 上下文压缩
├── @x-mars/skill       # SKILL.md 发现
├── @x-mars/mcp         # MCP 适配
├── @x-mars/orchestrator # 多 Agent 调度
├── @x-mars/swarm       # 多 Agent 协调
├── @x-mars/devtools    # Agent 调试
├── @x-mars/web-ui      # React 19 SPA
└── ... (12+ more)
```

### 7.2 值得借鉴的思路与实现

#### 借鉴 1：上下文压缩系统（最高优先级）

**Claude Code 做法：**

- 多层压缩策略（auto/reactive/micro/partial/snip）
- Fork Agent 共享 prompt cache prefix，压缩 API 调用复用主对话缓存
- 压缩后精确恢复：文件、计划、技能、工具 Schema、MCP 指令
- PTL 重试机制：截断最老的 API-round groups，最多 3 次

**X-Mars 当前状态：** `@x-mars/memory` 有基础压缩，但缺少多策略和状态恢复

**借鉴建议：**

```typescript
// 实现多策略压缩
interface CompactionStrategy {
  autoCompact(threshold: number): Promise<CompactionResult>
  reactiveCompact(error: PromptTooLongError): Promise<CompactionResult>
  microCompact(messages: Message[]): Promise<Message[]>
}

// 压缩后状态恢复
interface PostCompactRestore {
  recentFiles: FileAttachment[] // 最近读取的文件
  activePlan: PlanAttachment | null // 当前计划
  invokedSkills: SkillAttachment[] // 已调用技能
  asyncAgents: AgentStatusAttachment[] // 异步 Agent 状态
}
```

---

#### 借鉴 2：工具编排模式（只读并发 + 变更串行）

**Claude Code 做法：**

```typescript
// partitionToolCalls → 连续只读 = 并发批次, 单个变更 = 串行
function partitionToolCalls(toolUses): Batch[] {
  // 只读工具可 10 并发执行
  // 变更工具逐个串行执行
  // 保持调用顺序的语义正确性
}
```

**X-Mars 当前状态：** `@x-mars/agent` 有 read/mutation 阶段分离，但并发策略可以更精细

**借鉴建议：**

- 在 `@x-mars/tools` 中为每个工具添加 `isConcurrencySafe()` / `isReadOnly()` 方法
- `@x-mars/agent` 的执行引擎使用分区策略替代固定的 parallel-read → serial-mutation

---

#### 借鉴 3：延迟工具加载（ToolSearch + shouldDefer）

**Claude Code 做法：**

- 54 个工具不全部注入初始 prompt（节省 token）
- `shouldDefer: true` 的工具在 ToolSearch 被调用时才加载 Schema
- `alwaysLoad: true` 强制某些关键工具始终可用
- 压缩后自动重新注入已发现的延迟工具

**X-Mars 当前状态：** 所有 47 个工具在会话开始时全量注入

**借鉴建议：**

```typescript
// @x-mars/tools 添加延迟加载能力
interface ToolDefinition {
  // 新增
  deferred?: boolean // 延迟到 ToolSearch 时加载
  alwaysAvailable?: boolean // 始终在初始 prompt
  searchHints?: string[] // 搜索关键词
}
```

---

#### 借鉴 4：极简 Store 实现

**Claude Code 做法（35 行）：**

```typescript
function createStore<T>(initialState, onChange?): Store<T> {
  let state = initialState
  const listeners = new Set<Listener>()
  return {
    getState: () => state,
    setState: (updater) => {
      const prev = state
      const next = updater(prev)
      if (Object.is(next, prev)) return // 引用相等跳过
      state = next
      onChange?.({ newState: next, oldState: prev })
      for (const listener of listeners) listener()
    },
    subscribe: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}
```

**借鉴价值：** 比 Redux/Zustand 更轻量，支持 `Object.is` 快速路径和 onChange 回调。X-Mars 的 `@x-mars/shared` 可以参考此模式。

---

#### 借鉴 5：查询依赖注入模式

**Claude Code 做法：**

```typescript
type QueryDeps = {
  callModel: typeof queryModelWithStreaming
  microcompact: typeof microcompactMessages
  autocompact: typeof autoCompactIfNeeded
  uuid: () => string
}
// 测试时注入 fake，生产用 productionDeps()
```

**借鉴价值：** 只注入 4 个关键 I/O 依赖，不过度设计。X-Mars 的 `@x-mars/agent` 可以参考这种窄依赖注入。

---

#### 借鉴 6：分层记忆系统

**Claude Code 做法：**

- 4 种类型（user/feedback/project/reference）+ 结构化 frontmatter
- MEMORY.md 索引 + 独立记忆文件
- Claude Sonnet 语义检索（最多 5 个相关记忆）
- 团队记忆（Git 支持）

**X-Mars 当前状态：** `@x-mars/memory` 有基础记忆，但类型分类和语义检索不够成熟

**借鉴建议：**

- 引入 `user`/`feedback`/`project`/`reference` 类型分类
- 实现基于 LLM 的语义记忆检索
- 结构化 frontmatter（type + description + scope）

---

#### 借鉴 7：Prompt Cache 优化策略

**Claude Code 做法：**

- 压缩时 Fork Agent 复用主对话的 cache prefix（98% 命中率）
- Global scope cache（`tengu_global_cache_scope`）
- 1 小时 cache allowlist
- 指纹计算优化 cache key
- Prompt Cache Break Detection

**借鉴价值：** `@x-mars/ai` 的 Anthropic 集成应实现 cache scope 和 break detection。

---

#### 借鉴 8：键绑定系统（Chord 序列）

**Claude Code 做法：**

- 支持 Chord 序列（ctrl+x ctrl+k）
- 上下文优先级解析
- 用户可覆盖 (`~/.claude/keybindings.json`)
- 平台自适应（macOS/Linux/Windows）

**借鉴价值：** `@x-mars/cli` 的交互模式可以参考此键绑定架构。

---

#### 借鉴 9：Feature Flag 死代码消除

**Claude Code 做法：**

```typescript
import { feature } from 'bun:bundle'

// 编译时死代码消除
if (feature('VOICE_MODE')) {
  // 这段代码在未启用时完全不存在于 bundle 中
  const voice = require('./voice/...')
}

// 运行时特性门控
const value = getFeatureValue_CACHED_MAY_BE_STALE('gate_name', defaultValue)
```

**借鉴建议：** X-Mars 可以在构建配置中引入类似的编译时特性门控，减小生产 bundle 大小。

---

#### 借鉴 10：停止钩子后的后台任务

**Claude Code 做法：**
每次 Assistant 响应完成后，在后台并行执行：

- `extractMemories()` — 提取值得记忆的信息
- `autoDream()` — 后台整理/巩固知识
- `promptSuggestion()` — 生成下次提示建议
- `jobClassifier()` — 分类任务模板

**借鉴价值：** X-Mars 的 `@x-mars/hooks` 可以在 `onTurnEnd` hook 中注册类似的后台任务。

---

#### 借鉴 11：桥接架构（多层 RPC）

**Claude Code 做法：**

- 5 层 RPC：HTTP 轮询 → 密钥解密 → REPL IPC → 消息翻译 → 权限桥接
- WebSocket 支持浏览器/Node 双兼容
- 指数退避重连 + Keep-alive 心跳
- JWT 会话认证

**借鉴价值：** `@x-mars/service` 的 WebSocket 层可以参考其连接状态机和重连策略。

---

#### 借鉴 12：虚拟列表渲染

**Claude Code 做法：**

- `VirtualMessageList` 仅渲染可见消息
- 支持 2000+ 消息会话不卡顿
- Blit 优化（增量屏幕更新）
- 文本测量缓存

**借鉴价值：** `@x-mars/web-ui` 的聊天界面应实现虚拟滚动。

---

#### 借鉴 13：全局状态单例 + 信号模式

**Claude Code 做法：**

- `bootstrap/state.ts`（1,758 行）作为全局状态单例
- 40+ getter/setter 对
- `createSignal()` 用于响应式状态变更
- OpenTelemetry 集成的计数器/追踪器

**借鉴建议：** X-Mars 的 `@x-mars/coding`（XMarsApp DI 容器）可以参考信号模式和遥测集成。

---

#### 借鉴 14：结构化 I/O 协议

**Claude Code 做法：**

- `StructuredIO` 基类：NDJSON 流式、Schema 验证、状态持久化
- `RemoteIO` 扩展：WebSocket/SSE 传输、CCR v2 协议
- NDJSON 安全序列化（U+2028/U+2029 转义）

**借鉴价值：** `@x-mars/service` 的事件流可以参考此结构化 I/O 模式。

---

### 7.3 架构对比总结

| 维度           | Claude Code              | X-Mars-Coding         | 建议                      |
| -------------- | ------------------------ | --------------------- | ------------------------- |
| **架构风格**   | 单体应用 + 特性门控      | Monorepo + 26 包      | X-Mars 更模块化，保持优势 |
| **状态管理**   | 全局单例 + 极简 Store    | DI 容器 (XMarsApp)    | 借鉴 Store 的极简实现     |
| **工具编排**   | 只读并发/变更串行        | read/mutation 阶段    | 借鉴分区策略              |
| **上下文压缩** | 5 种策略 + 状态恢复      | 基础压缩              | **最高优先级借鉴**        |
| **延迟加载**   | ToolSearch + shouldDefer | 全量注入              | 借鉴延迟加载              |
| **权限系统**   | 多路由处理器             | RBAC + 审计日志       | X-Mars 已较完善           |
| **记忆系统**   | 4 类型 + 语义检索        | 基础记忆              | 借鉴分类 + 语义检索       |
| **UI 渲染**    | Ink (终端 React)         | React 19 + Vite (Web) | 不同场景，各有优势        |
| **远程协作**   | Bridge + Direct Connect  | HTTP + WebSocket      | 借鉴重连策略              |
| **多模型**     | 单模型 (Claude)          | 10+ 提供商            | X-Mars 更灵活             |
| **测试**       | 依赖注入 (QueryDeps)     | vitest + Playwright   | 借鉴窄 DI                 |
| **构建**       | Bun bundler + feature()  | tsdown + Nx           | 借鉴死代码消除            |
| **Hook 系统**  | 77 个 Hook 文件          | 31+ Hook 点           | X-Mars 设计更规范         |
| **开发工具**   | VCR 录制/回放            | Devtools (23 断点)    | X-Mars 调试能力更强       |

### 7.4 优先级排序的行动建议

| 优先级 | 借鉴项                  | 预期收益            | 实施难度 |
| ------ | ----------------------- | ------------------- | -------- |
| **P0** | 多策略上下文压缩        | 长对话体验质变      | 高       |
| **P0** | 工具并发编排优化        | 执行速度 2-3x       | 中       |
| **P1** | 延迟工具加载            | 减少初始 token 消耗 | 中       |
| **P1** | Prompt Cache 优化       | 降低 API 成本 30%+  | 中       |
| **P1** | 分层记忆 + 语义检索     | 跨会话智能大幅提升  | 高       |
| **P2** | 极简 Store 实现         | 代码简洁性          | 低       |
| **P2** | 查询依赖注入            | 测试可维护性        | 低       |
| **P2** | 后台后处理任务          | 用户体验优化        | 中       |
| **P3** | 虚拟列表渲染            | Web UI 性能         | 低       |
| **P3** | Feature Flag 死代码消除 | Bundle 大小优化     | 中       |
| **P3** | 桥接重连策略            | 远程稳定性          | 中       |

---

> **总结**：Claude Code 是一个高度工程化的 AI 编程助手，其核心竞争力在于：(1) 多策略上下文压缩 + Prompt Cache 优化实现的极致成本控制；(2) 只读并发/变更串行的工具编排模式；(3) 延迟加载 + 特性门控的精细化资源管理。X-Mars-Coding 已具备模块化架构优势和多模型灵活性，应优先借鉴 Claude Code 在上下文管理和工具编排方面的深度实现。
