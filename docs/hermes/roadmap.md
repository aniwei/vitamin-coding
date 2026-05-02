# 实施路线图

## 分阶段计划

```
Phase 1 ─ 闭环学习系统 (高价值 + 低耦合)
  │  估计影响包: @vitamin/memory, @vitamin/skill, @vitamin/session
  │
  ├─ 1.1 MemoryProvider ABC + MemoryManager
  │   ├─ 定义 MemoryProvider 接口
  │   ├─ 实现 MemoryManager (Provider 注册/路由/生命周期)
  │   ├─ 实现 BuiltinMemoryProvider (MEMORY.md / USER.md 读写)
  │   ├─ 实现 <memory-context> 防篱
  │   ├─ 通过 turn:before / turn:after Hook 集成到 Agent
  │   └─ 测试: Provider 注册/拒绝、prefetch、syncTurn、防篱
  │
  ├─ 1.2 Skill 自创建 + 自改进
  │   ├─ 定义 SkillStore 接口
  │   ├─ 实现 FileSystemSkillStore (Markdown 持久化)
  │   ├─ 实现 skill_create / skill_improve / skill_search 工具
  │   ├─ 通过 prompt:transform Hook 注入相关 Skill
  │   ├─ 通过 tool:after Hook 实现自改进触发
  │   └─ 测试: Skill CRUD、搜索、改进流程
  │
  └─ 1.3 FTS5 跨会话搜索
      ├─ 扩展 SessionStore: fts5Search() + getLineage()
      ├─ 实现 session_search Agent 工具
      ├─ 实现 LLM 摘要精炼 (非原文返回)
      └─ 测试: FTS5 索引、搜索排序、血缘追踪

Phase 2 ─ Agent 循环增强 (中等价值 + 增强现有)
  │  估计影响包: @vitamin/agent, @vitamin/ai, @vitamin/hooks
  │
  ├─ 2.1 Iteration Budget
  │   ├─ 定义 IterationBudget 接口
  │   ├─ 集成到 Agent Work-Loop (与 steering/followUp 同级)
  │   ├─ 实现父子 Agent 预算共享
  │   ├─ 实现 70%/90% 预算警告注入
  │   └─ 测试: 预算消耗、共享、警告、耗尽处理
  │
  ├─ 2.2 Provider Fallback
  │   ├─ 定义 FallbackConfig 接口
  │   ├─ 实现 ResilientModel 包装器
  │   ├─ 实现 429/5xx 回退 + 401/403 凭据刷新
  │   └─ 测试: 回退链遍历、凭据刷新、全部耗尽
  │
  └─ 2.3 Smart Approval
      ├─ 实现 SMART_APPROVAL_POLICY
      ├─ 实现 KNOWN_SAFE_PATTERNS 匹配
      ├─ 实现会话级审批记忆
      └─ 测试: 安全模式放行、危险命令升级、会话记忆

Phase 3 ─ 多平台 Gateway (高价值 + 新包)
  │  依赖: Phase 1 (Agent 需要记忆能力)
  │  新增包: @vitamin/gateway, @vitamin/cron
  │
  ├─ 3.1 Gateway Runner
  │   ├─ 定义 PlatformAdapter / GatewayMessageEvent 接口
  │   ├─ 实现 GatewayRunner (消息路由 + Agent 池)
  │   ├─ 实现 SessionRouter (会话 Key 解析)
  │   ├─ 实现 TelegramAdapter
  │   ├─ 实现 DiscordAdapter
  │   ├─ DM Pairing 授权
  │   └─ 测试: 消息路由、会话持续、授权
  │
  └─ 3.2 Cron Scheduler
      ├─ 定义 CronJob / CronJobStore 接口
      ├─ 实现 CronScheduler (tick + 任务执行 + 投递)
      ├─ 实现 FileSystemCronJobStore (JSON 持久化)
      └─ 测试: 调度触发、任务执行、结果投递

Phase 4 ─ 运行时环境扩展 (扩展能力)
  │  依赖: Phase 2 (安全审批保护远程执行)
  │  估计影响包: @vitamin/tools
  │
  └─ 4.1 多终端后端
      ├─ 定义 TerminalBackend 接口
      ├─ 重构现有本地执行为 LocalBackend
      ├─ 实现 DockerBackend
      ├─ 实现 SSHBackend
      ├─ (后续) DaytonaBackend / ModalBackend
      └─ 测试: 后端可用性检查、命令执行、清理
```

## 依赖图

```
Phase 1 (独立)
  ├── 1.1 MemoryProvider ←── 无外部依赖
  ├── 1.2 Skill 自创建   ←── 依赖 1.1 (Skill 执行记录同步到记忆)
  └── 1.3 FTS5 搜索      ←── 无外部依赖

Phase 2 (独立，可与 Phase 1 并行)
  ├── 2.1 Budget         ←── 无外部依赖
  ├── 2.2 Fallback       ←── 无外部依赖
  └── 2.3 Smart Approval ←── 无外部依赖

Phase 3 (依赖 Phase 1)
  ├── 3.1 Gateway        ←── 依赖 1.1 (Agent 需记忆), 依赖 @vitamin/agent
  └── 3.2 Cron           ←── 依赖 3.1 (需 Gateway 投递)

Phase 4 (依赖 Phase 2)
  └── 4.1 终端后端        ←── 依赖 2.3 (远程执行需安全审批)
```

## 关键设计决策

| #   | 决策                    | 选择                          | 理由                                                                   |
| --- | ----------------------- | ----------------------------- | ---------------------------------------------------------------------- |
| D1  | 代码复用方式            | 参考设计，TypeScript 全新实现 | Vitamin 严格 ESM + TS 规范不允许 Python 混合；模块化远优于 Hermes 单体 |
| D2  | MemoryProvider 外部数量 | 至多 1 个                     | 照搬 Hermes 设计 — 防止工具 schema 膨胀和后端冲突                      |
| D3  | 闭环学习实现方式        | 通过 Hook 系统                | Vitamin 31+ Hook 点远强于 Hermes 插件 hook，不必硬编码到 Agent 核心    |
| D4  | Gateway 放置            | 新建 `@vitamin/gateway` 包    | 遵循分层原则，不污染 `@vitamin/service`                                |
| D5  | Swarm 是否整合          | 保持不变                      | Vitamin 5 种协作模式已远超 Hermes `delegate_task`                      |
| D6  | Budget 集成位置         | Agent Work-Loop 内部          | 与 steering/followUp 同级，自然位置                                    |
| D7  | 编排器是否整合          | 保持不变                      | Vitamin 的 LLM 驱动编排器 Hermes 完全没有                              |
| D8  | Skill 存储格式          | Markdown 文件                 | 兼容 Hermes agentskills.io 标准，便于人类阅读/编辑                     |
| D9  | FTS5 实现               | better-sqlite3 + FTS5 扩展    | 成熟方案，与 Hermes hermes_state.py 一致                               |
| D10 | RL 训练能力             | 暂不引入                      | 非 Vitamin 当前阶段需求，可后续评估                                    |

## 风险评估

| 风险                     | 影响            | 概率 | 缓解                       |
| ------------------------ | --------------- | ---- | -------------------------- |
| FTS5 搜索性能 (大量会话) | 搜索延迟        | 中   | 增量索引 + 分区策略        |
| Skill 自改进死循环       | 无限修订        | 低   | 改进次数上限 + 版本回退    |
| Gateway 平台 API 变更    | 适配器失效      | 中   | 独立包隔离，最小化核心影响 |
| 记忆 Nudge 过于频繁      | 干扰 Agent 执行 | 中   | 可配置频率 + 冷却期        |
| Provider 回退链延迟      | 用户感知变慢    | 低   | 并行探测 + 超时控制        |

## 成功度量

| 指标                 | Phase 1 目标                        | Phase 2 目标                     |
| -------------------- | ----------------------------------- | -------------------------------- |
| Skill 创建率         | 复杂任务后 40%+ 自主创建 Skill      | —                                |
| Skill 复用率         | 相似任务命中率 60%+                 | —                                |
| 跨会话召回准确率     | 相关结果 Top-5 准确率 70%+          | —                                |
| Budget 警告遵从率    | Agent 在 90% 警告后 2 轮内结束 80%+ | —                                |
| Provider 回退成功率  | —                                   | 首 Provider 失败后 90%+ 成功回退 |
| Gateway 消息延迟 P99 | —                                   | < 3s (不含 LLM 推理)             |

## 不整合的部分

以下 Hermes 功能不在整合范围内，附理由：

| 功能               | 理由                                               |
| ------------------ | -------------------------------------------------- |
| RL 训练 / Atropos  | 非 Vitamin 当前阶段需求                            |
| 批量轨迹生成       | 同上                                               |
| OpenClaw 迁移      | Hermes 特有的历史包袱                              |
| Singularity 后端   | HPC 场景极少，优先级最低                           |
| 语音模式 (TTS/STT) | 独立能力域，可后续评估                             |
| ACP IDE 集成       | Vitamin 已有 `@vitamin/service` + VS Code 扩展路线 |
| 主题/皮肤引擎      | UI 层面，与核心能力无关                            |
| Profile 多实例     | Vitamin 架构天然支持多实例                         |
