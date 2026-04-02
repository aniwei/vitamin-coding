# Vitamin Agent 方法论可移植设计（中文版）

最后更新：2026-04-02  
状态：Proposed  
范围：@vitamin/coding + @vitamin/orchestrator + @vitamin/tools + @vitamin/prompt

---

## 阅读定位

这是一份“方法论迁移与演进提案”，不是当前 runtime 的权威设计说明。

- 当前实现事实以 [DESIGN.md](./DESIGN.md)、[../README.md](../README.md)为准。
- 本文允许讨论缺口、优先级、分阶段落地路线和未来模块，不应把这些内容直接视为“已经接入 runtime”。
- 文中凡标注“当前已具备能力”的部分，只用于说明提案基线，不替代当前运行时设计文档。

---

## 0. 文档目标与阅读方式

### 0.1 目标

基于 Vitamin 当前已落地架构，对比 7 个主流 Agent 框架的方法论，设计一套可内置、可迁移、可配置的 Vitamin 方法论内核。

### 0.2 你能从本文拿到什么

1. 各框架的端到端流程（不是只看概念）。
2. Vitamin 当前“真实可用能力”与“方法论缺口”。
3. Vitamin 可优化的流程与模块清单（含优先级与验收标准）。
4. 可直接进入研发排期的分阶段落地路线。

---

## 1. Vitamin 当前实线能力（基于代码验证）

> 说明：本节只记录当前代码里已存在并可调用的能力，不写目标态。

### 1.1 已具备能力

#### A. 编排与任务执行（@vitamin/orchestrator）

- 已有核心对象：TaskStore、TaskExecutor、BackgroundManager、RetryPolicy、CircuitBreaker。
- 已有回调链：dispatchTask、callAgent、create/get/list/update task、background output/cancel、clarifyRequest。
- 支持 sync/background 两种任务模式。
- 支持 maxActiveTasks 并发上限与熔断保护。

#### B. 编排工具面（@vitamin/tools）

- 已有编排工具：task_delegate、agent_task、review_call（兼容别名 agent_call）、task_create/task_get/task_list/task_update、background_output/background_cancel、clarify_request。
- 已有方法论工具：write_todos、capture_file_state、learn。
- 已有会话工具：session_manager。

#### C. Agent 执行循环（@vitamin/agent）

- 已支持“只读工具并行 + 写工具串行”执行语义。
- 支持 steering/followUp 注入。
- 支持工具前后 hook 管线。

#### D. Prompt 方法论承载面（@vitamin/prompt）

- PromptManager 加载单文件 lead-guidance.md（内含 10 个 section：身份与环境、安全与边界、输出与沟通、工具使用指引、工作流程引导、阶段纪律、复杂度路由、审查指引、模型槽位指引、文件状态刷新）。
- 已支持 phase 提取与 phase 上下文回注。
- 已支持会话末学习提示与 lessons 注入。
- 子代理 prompt 通过 AgentProfile 模板 + SubAgentPromptContext（taskTitle/taskDescription/taskFiles）占位符替换组装。

#### E. 配置面（@vitamin/setting）

- workflow: review/retry/circuitBreaker/routing。
- agents: default_workflow_slot、tools、max_tool_turns。
- model_slots: slot 到 model 映射。
- categories: category 到模型偏好映射。

### 1.2 关键缺口

1. Review 仍偏“Prompt 约束”，缺少统一 runtime 级 ReviewCoordinator。
2. 当前采用 Claude Code 模式：write_todos 是纯 UI/记忆工具，task_delegate 直接 prompt-based 分发，不经过结构化 plan 状态链路（PlanStore 曾实现后移除）。
3. TaskStore 当前以内存为主，缺少持久化适配（重启恢复能力有限）。
4. 缺少方法论 Profile（严格/平衡/极速/长任务）配置抽象。
5. 缺少 Fleet 级 fan-out/fan-in 统一执行器（虽有基础并行能力）。
6. 权限控制仍偏 hook 化，缺少分层策略管线（policy mode）。

---

## 2. 对比框架与分析边界

分析对象：

- obra/superpowers
- langchain-ai/deepagents
- badlogic/pi-mono
- opendev-to/opendev
- garrytan/gstack
- polyuiislab/infiAgent
- shipany-ai/open-agent-sdk（当前重定向到 codeany-ai/open-agent-sdk-typescript）

统一对比维度：

1. 规划流（Plan）
2. 执行流（Act）
3. 审查流（Review）
4. 上下文流（Context）
5. 模型路由（Model Routing）
6. 可恢复性（Recovery）
7. 可移植性（Portability）

---

## 3. 各框架流程细化（端到端）

## 3.1 Superpowers 流程（方法纪律最强）

### 典型链路

需求输入  
-> brainstorming（问题澄清 + 方案分歧）  
-> 设计文档落地（spec）  
-> writing-plans（拆成小任务）  
-> subagent-driven-development（每任务 fresh subagent）  
-> spec review  
-> quality review  
-> 不通过则回实现修复并复审  
-> finishing development branch

### 流程特征

- 显式阶段纪律（先脑暴、后计划、再实现）。
- 每任务两阶段审查（先符合需求，再看代码质量）。
- 控制器负责“提取完整任务上下文”再下发，避免子代理读错计划。

### 对 Vitamin 的迁移价值

- 非常高：可直接映射为 task_delegate/agent_task + review_call(reviewer) 循环。

### 不建议直接照搬

- 全流程强制 gate 对简单任务成本过高，应采用自适应启用。

---

## 3.2 DeepAgents 流程（Harness 默认能力最完整）

### 典型链路

用户任务  
-> write_todos（复杂任务拆分）  
-> 主 Agent 选择直接工具执行或 task 子代理  
-> 子代理在隔离上下文执行  
-> 主代理汇总  
-> 对话过长时 SummarizationMiddleware 自动压缩  
-> 持久化/检查点（LangGraph）

### 流程特征

- write_todos 是轻量计划主入口。
- task 工具天然上下文隔离。
- 总结中间件与工具参数截断是“默认基础设施”。

### 对 Vitamin 的迁移价值

- 高：Vitamin 已有 write_todos、task_delegate，可增强中间状态与自动压缩联动。

### 不建议直接照搬

- “信任模型自控”策略需结合 Vitamin 安全策略分层，不建议裸迁移。

---

## 3.3 Pi-mono 流程（扩展系统导向）

### 典型链路

创建 AgentSession  
-> 加载扩展（extensions）  
-> 扩展注入 tool_call/tool_result/lifecycle hooks  
-> 可切 plan mode（读多写少）  
-> 可启 subagent chain（scout -> planner -> worker）  
-> 自动 compaction  
-> session 分支/恢复/导出

### 流程特征

- “流程能力”多由扩展提供，不强耦合核心 runtime。
- 会话分支、扩展工具、命令模式组合灵活。

### 对 Vitamin 的迁移价值

- 高：Vitamin 可把方法论实现成 profile + hook + tool 组合包。

### 不建议直接照搬

- 扩展自由度极高时，治理复杂度会增大；Vitamin 需要中心化 policy。

---

## 3.4 OpenDev 流程（复合模型路由最系统）

### 典型链路

query 输入  
-> runtime 增强与消息准备  
-> ReactLoop  
-> workflow slot 自动路由（normal/thinking/compact/critique/vlm）  
-> 工具调度（只读批并行 + 串行写）  
-> 可触发 subagent fleet 并行  
-> staged compaction  
-> session 持久化

### 流程特征

- workflow slot 是架构核心，不是可有可无配置。
- 高性能并行与上下文压缩做得很“runtime-first”。

### 对 Vitamin 的迁移价值

- 非常高：Vitamin 已有 slot 雏形，差在策略解释与执行器完善。

### 不建议直接照搬

- Rust 性能范式不可直接复制，Vitamin 应聚焦策略层与接口层收益。

---

## 3.5 gstack 流程（流程产品化与治理最强）

### 典型链路

Think  
-> Plan（CEO/Design/Eng review）  
-> 可走 autoplan（自动跑完整评审链）  
-> Build  
-> Review（含 adversarial/outside voice）  
-> QA  
-> Ship  
-> Retro/Learn

### 流程特征

- 有完整“审查就绪看板”“决策审计轨迹”。
- 自动化评审流程中只把“品味决策”留给人。

### 对 Vitamin 的迁移价值

- 非常高：适合补齐 Vitamin 的治理闭环（review logs、decision logs、readiness）。

### 不建议直接照搬

- 全流程技能化命令体系对 SDK 场景偏重，Vitamin 应抽象为 runtime/policy 能力。

---

## 3.6 InfiAgent 流程（长时任务和状态恢复最强）

### 典型链路

task_id 作为工作目录根  
-> 层级 agent（L3->L2->L1...）串行协作  
-> thinking cadence 周期刷新“文件状态”  
-> 只保留最近动作 + 文件状态锚点  
-> call graph 注入共享上下文  
-> fresh/resume/reset 继续执行

### 流程特征

- 文件系统状态优先于对话历史。
- task_id 即长期记忆与恢复主键。

### 对 Vitamin 的迁移价值

- 高：capture_file_state + session 体系可以快速接入“文件状态锚点”方法论。

### 不建议直接照搬

- 严格串行层级在通用编码任务中可能吞吐不足，需要与并行策略混合。

---

## 3.7 Open Agent SDK 流程（SDK 内嵌引擎能力丰富）

### 典型链路

createAgent/query  
-> permission mode 决策  
-> agentic loop（tools/mcp/agents/team/task）  
-> hooks（PreToolUse/PostToolUse 等）  
-> auto compact/micro compact  
-> persist/resume/fork session

### 流程特征

- in-process 引擎，适合产品内嵌。
- 工具、任务、团队、会话能力统一 API 暴露。

### 对 Vitamin 的迁移价值

- 非常高：可借鉴其“能力统一接口 + 权限模式 + 会话分叉”设计。

### 不建议直接照搬

- 超大工具面会增加治理负担，Vitamin 应先定义“核心工具核”。

---

## 4. 跨框架共同方法论抽象

把 7 个框架汇总后，能沉淀为 6 个可移植原语：

1. 规划原语：轻计划（todos）+ 重计划（plan artifact）双轨。
2. 分发原语：主控与执行分离，任务上下文明确裁剪。
3. 审查原语：需求一致性优先于代码优雅性。
4. 上下文原语：长任务时文件状态优先于历史聊天。
5. 路由原语：模型按 workflow slot 分工，不按全局单模型。
6. 治理原语：每个关键决策必须可追踪（日志/状态/结果）。

---

## 5. Vitamin 可优化的流程（流程级）

## 5.1 流程 A：复杂需求交付流

### 当前实线

用户请求 -> LLM 自主调用工具 -> task_delegate/agent_task/review_call 可用，但“计划/审查何时触发”主要依赖 prompt。

### 优化目标

构建“自适应复杂任务流”：

用户请求  
-> 复杂度判定  
-> 轻计划或重计划  
-> 执行分发  
-> 自适应审查  
-> 结论与审计

### 落地动作

1. 增加 complexity classifier（规则+模型混合）。
2. 中等复杂度默认 write_todos，高复杂度要求 plan artifact。
3. 每轮执行回写 decision log。

### 涉及模块

- @vitamin/prompt
- @vitamin/orchestrator
- @vitamin/tools（write_todos/task_delegate）
- @vitamin/coding

---

## 5.2 流程 B：审查闭环流

### 当前实线

可调用 reviewer，但无统一“必须复审直到通过”的 runtime 协调器。

### 优化目标

实现 ReviewCoordinator：

实现结果  
-> spec review  
-> quality review  
-> 失败则自动回实现者修复  
-> 再次 review  
-> 通过后进入下一任务

### 落地动作

1. 增加 review stage 配置（必选/可选）。
2. 增加 review failure action（retry/cancel/escalate）。
3. 将 review event 结构化写入 task metadata。

### 涉及模块

- @vitamin/orchestrator
- @vitamin/setting（workflow.review）
- @vitamin/hooks（review.* events）

---

## 5.3 流程 C：长任务恢复流

### 当前实线

session 有持久化能力，但 orchestrator 任务状态仍以内存为主。

### 优化目标

统一“任务恢复主线”：

task 执行中断  
-> 读取 task 持久状态 + file-state checkpoint  
-> 恢复任务上下文  
-> 继续执行

### 落地动作

1. TaskStore 增加 persistence adapter（disk/remote）。
2. capture_file_state 在关键节点自动触发。
3. 恢复时优先加载 file-state summary，再补近期对话。

### 涉及模块

- @vitamin/orchestrator
- @vitamin/memory
- @vitamin/tools（capture_file_state）

---

## 5.4 流程 D：并行协作流

### 当前实线

Agent 层有只读并行能力；orchestrator 层尚缺 fleet 级聚合策略。

### 优化目标

实现 fleet 模式：

主任务  
-> fan-out 子任务（并发上限控制）  
-> 子任务独立 session/slot  
-> fan-in 聚合（merge/rank/select）

### 落地动作

1. 新增 FleetCoordinator（fan_out_fan_in/race）。
2. 聚合策略支持：best_of_n、merge_summary、first_success。
3. 引入 per-member timeout 与失败策略。

### 涉及模块

- @vitamin/orchestrator
- @vitamin/tools（task_delegate 扩展参数）
- @vitamin/setting（workflow.routing/fleet）

---

## 5.5 流程 E：学习反馈流

### 当前实线

已有 learn 工具和 session.idle 提示，但还不够“治理级”。

### 优化目标

决策与经验形成闭环：

每次关键流程动作  
-> 记录 decision/review/task outcome  
-> 会话末提炼 learn  
-> 下次 prompt 注入高相关经验

### 落地动作

1. 增加 decision audit store。
2. 增加 review 与 outcome 的关联查询。
3. lesson 注入按 tags/trigger 做相关性排序。

### 涉及模块

- @vitamin/memory
- @vitamin/prompt
- @vitamin/orchestrator

---

## 6. Vitamin 可优化模块（模块级清单）

| 模块 | 当前状态 | 优化建议 | 优先级 | 验收标准 |
|---|---|---|---|---|
| @vitamin/setting | 有 workflow/model_slots，无 methodology profile | 新增 MethodProfile schema（strict/balanced/fast/research） | P0 | profile 可切换并影响 prompt+runtime 策略 |
| @vitamin/prompt | section 化已完成 | 增加 profile 到 section 的投影规则与动态裁剪 | P0 | 同一任务在不同 profile 的 system prompt 可观测差异 |
| @vitamin/orchestrator.TaskStore | 以内存为主 | 增加 disk/remote persistence adapter | P1 | 进程重启后 task 状态可恢复 |
| @vitamin/orchestrator | 有 executor/retry/cb，无审查协调器 | 增加 ReviewCoordinator（spec->quality->optional） | P0 | 跨模块任务可自动进入审查闭环 |
| @vitamin/orchestrator | write_todos 是纯 UI/记忆，无 plan 状态链路 | 如需重新引入 plan 工件状态，可增加 PlanStateManager（曾实现后移除） | P1 | 任务与计划步骤状态一一对应 |
| @vitamin/orchestrator | 有基础并发，无 fleet 聚合执行器 | 增加 FleetCoordinator（fan-out/fan-in/race） | P2 | 可配置并发上限、超时、聚合策略 |
| @vitamin/hooks | 拦截能力强，策略松散 | 增加 policy priority 与冲突仲裁顺序 | P1 | 同时命中多策略时结果确定且可解释 |
| @vitamin/tools | 编排工具齐全 | 扩展 task_delegate 元数据（risk/priority/reviewRequired） | P2 | LLM 分发可携带治理信息 |
| @vitamin/memory | 有 lesson 与 file-state 能力 | 增加 file-state checkpoint 自动化触发策略 | P1 | 长会话上下文丢失率下降 |
| @vitamin/coding.VitaminApp | 已组装主链路 | 增加 MethodRuntime 装配器，统一注入 profile/policy | P0 | start 后可输出当前方法论配置快照 |
| @vitamin/devtools | 有调试能力 | 增加 methodology 面板（phase/review/decision） | P2 | 可视化跟踪每轮流程决策 |

---

## 7. Vitamin 目标方法论内核（VMK）

## 7.1 分层职责

### Layer A：MethodProfile（配置层）

定义“这次任务的工程方法”而不是“仅模型参数”。

### Layer B：Policy Runtime（编排层）

保证关键流程可测、可控、可恢复：

- planning policy
- review policy
- routing policy
- safety policy
- persistence policy

### Layer C：Prompt Projection（引导层）

把 profile 映射成 prompt section 的组合与强弱。

### Layer D：Evidence & Learning（反馈层）

把流程结果沉淀为可复用证据：

- decision log
- review log
- task outcome log
- lesson log

## 7.2 硬约束与软约束边界

硬约束（runtime）：

- 只读并行、写入串行。
- 并发上限与超时。
- 重试与熔断。
- 持久化与恢复。

软约束（prompt）：

- 阶段纪律。
- 复杂度路由建议。
- 审查建议。
- 模型 slot 使用建议。

LLM 决策域：

- 是否分发与分发给谁。
- 何时发起审查（在策略许可范围内）。
- 如何构造上下文与工具参数。

---

## 8. 配置与接口草案

## 8.1 YAML 草案

```yaml
workflow:
  enabled: true
  methodology:
    profile: balanced_delivery
    planning:
      mode: adaptive
      full_plan_threshold: medium
    review:
      mode: adaptive
      required_on:
        - cross_module
        - api_contract
        - security_sensitive
      stages:
        - spec
        - quality
    routing:
      slot_policy: adaptive
      allow_agent_override: true
    context:
      prefer_file_state_snapshot: true
      compact_when_token_ratio_over: 0.85
    safety:
      permission_mode: policy
      read_only_parallel: true
      mutation_serial: true
```

## 8.2 TypeScript 接口草案

```ts
export interface MethodProfile {
  name: 'strict_engineering' | 'balanced_delivery' | 'fast_iteration' | 'long_horizon_research'
  planning: {
    mode: 'direct' | 'adaptive' | 'always_plan'
    fullPlanThreshold: 'low' | 'medium' | 'high'
  }
  review: {
    mode: 'off' | 'adaptive' | 'strict'
    requiredOn: Array<'cross_module' | 'api_contract' | 'security_sensitive' | 'data_model_change'>
    stages: Array<'spec' | 'quality' | 'test' | 'security'>
  }
  routing: {
    slotPolicy: 'fixed' | 'adaptive'
    allowAgentOverride: boolean
  }
  context: {
    preferFileStateSnapshot: boolean
    compactTokenRatio: number
  }
}
```

---

## 9. 分阶段落地计划（可执行）

## Phase 0：方法论配置化（P0）

目标：让方法论可配置、可切换、可观测。

工作项：

1. setting 增加 MethodProfile schema。
2. prompt 增加 profile 投影。
3. coding 装配 MethodRuntime snapshot。

验收：

- 切 profile 不改代码。
- system prompt 内容与行为差异可见。

## Phase 1：计划与决策审计（P1）

目标：让“为什么这么做”可追踪。

工作项：

1. 增加 complexity classifier。
2. 增加 decision audit store。
3. write_todos 与 task_delegate 建立关联元数据。

验收：

- 每次计划路径选择都有结构化记录。

## Phase 2：审查协调器（P0）

目标：建立可重试的审查闭环。

工作项：

1. 实现 ReviewCoordinator。
2. 支持 stage 失败后的修复与复审循环。
3. 结构化 review 结果落库。

验收：

- 跨模块任务默认触发 spec+quality 并可循环直到通过。

## Phase 3：持久化与恢复（P1）

目标：任务跨进程可恢复。

工作项：

1. TaskStore persistence adapter。
2. file-state checkpoint 自动触发点。
3. orchestrator resume 接口。

验收：

- 重启后可恢复 task 状态和关键上下文。

## Phase 4：Fleet 与高吞吐协作（P2）

目标：提高复杂任务并行吞吐。

工作项：

1. FleetCoordinator。
2. fan-out/fan-in/race 聚合策略。
3. 并行风险控制（上限、超时、失败策略）。

验收：

- 多子任务并发执行稳定，结果聚合可控。

---

## 10. 成效指标（建议纳入 Devtools 与埋点）

### 10.1 质量指标

- 复杂任务遗漏步骤率。
- review 后回归缺陷率。
- 审查通过前平均循环次数。

### 10.2 效率指标

- 任务完成时长（按复杂度分层）。
- 并行任务吞吐提升率。
- 背景任务成功率与取消率。

### 10.3 成本指标

- 各 slot token 成本分布。
- compaction 触发频率与收益。
- 审查阶段额外成本与缺陷下降比。

### 10.4 可恢复性指标

- 任务恢复成功率。
- 恢复后首次成功执行率。

---

## 11. 风险与缓解

风险 1：流程过重导致简单任务变慢。  
缓解：自适应策略，简单任务直达。

风险 2：审查闭环过严影响吞吐。  
缓解：按风险条件启用 stage，允许 profile 降级。

风险 3：策略冲突（hook 与 policy 同时生效）。  
缓解：定义优先级顺序并输出冲突解释日志。

风险 4：并行执行引入不一致。  
缓解：只读并行、写串行、共享资源冲突检测。

---

## 12. 推荐首发切片（MVP）

建议第一批上线只做 4 件事：

1. MethodProfile schema + profile 切换。
2. Prompt profile 投影（phase/routing/review section）。
3. ReviewCoordinator（spec + quality）。
4. decision/review 结构化日志。

原因：

- 对现有架构侵入小。
- 用户可感知提升明显。
- 为后续持久化与 fleet 留出稳定接口。

---

## 13. 备注

1. shipany-ai/open-agent-sdk 链接当前重定向到 codeany-ai/open-agent-sdk-typescript，本文对该项分析基于重定向后的仓库内容。
2. 本方案坚持“能力由 runtime 提供，流程由 profile+prompt 引导，具体编排由 LLM 决策”的边界，不把任务编排硬编码成刚性状态机。
