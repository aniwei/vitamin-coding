# DECO AI Coding 架构问题分析与解决方案

> 关于中心化上下文、渐进式披露、人机澄清机制，以及线上/本地双模式共享架构的完整设计

---

## 目录

- [一、问题判断](#一问题判断)
- [二、核心结论：上下文不应落入仓库](#二核心结论上下文不应落入仓库)
- [三、解决方案：Context Hub 架构](#三解决方案context-hub-架构)
- [四、线上 / 本地共享机制](#四线上--本地共享机制)
- [五、改造后的 9-Step 流程](#五改造后的-9-step-流程)
- [六、仓库里到底留什么](#六仓库里到底留什么)
- [七、行业竞品对标](#七行业竞品对标)
- [八、落地迁移路径](#八落地迁移路径)
- [九、总结](#九总结)

---

## 一、问题判断

### 1.1 问题 1：没有中心化上下文存储

**核心痛点**：PDF → 仓库的"一次性翻译"模式

- 需求文档变更（尤其已在开发中）时，没有 diff 机制，只能全量重跑，会造成：
  - 已生成代码与新需求错位
  - 开发者手工改动被覆盖
  - 无法追溯"这段代码来自需求的哪一段"
- **类比**：就像没有 Git 的代码库——每次都是全量快照，无法做增量协作。

### 1.2 问题 2：上下文注入不是渐进式披露（可能）

- 目前一次性把Markdown文档全量塞进 prompt，会导致：
  - Token 浪费 + 噪声干扰，模型注意力被稀释
  - 无法区分"当前任务相关" vs "全局背景"
  - 下游 Step 拿到的都是同一份原始文档，没有按阶段裁剪
- **正确范式**：Progressive Disclosure —— 每个 Step 只拿它需要的上下文切片。

### 1.3 流程缺少澄清/确认关卡

当前链路是**单向流水线**没有：

- **人机澄清点（Human-in-the-loop checkpoint）**：需求歧义时 AI 应主动问，而不是猜
- **前后端接口契约确认**：接口字段、鉴权、错误码必须双方对齐
- **方案评审**：Step 6 方案设计后应有 review 才进入 Step 8/9

**失败模式**：AI 默认"最可能的解释"一路跑到 Step 9，生成了代码才发现理解偏差，返工成本 = 整条链路成本。

---

## 二、核心结论：上下文不应落入仓库

### 2.1 为什么"落入仓库"是错的

把 AI 上下文（需求解析、检索索引、方案文档、决策记录）物理存储在 Git 仓库中，存在根本性矛盾：

| 维度 | 仓库（Git）特性 | 上下文的真实需求 | 冲突 |
|---|---|---|---|
| **变更频率** | 低频、审慎、PR 评审 | 高频、实时、秒级更新 | ❌ Git 不适合高频写 |
| **生命周期** | 与代码版本绑定 | 跨分支、跨版本、长期演进 | ❌ 需求生命周期 ≠ 代码版本 |
| **协作模型** | 异步、分支隔离 | 实时协作、多人共读共写 | ❌ 分支会割裂上下文 |
| **可见性** | 全员可见（或仓库级权限） | 需按角色/任务切片 | ❌ 粒度不匹配 |
| **数据形态** | 文本文件友好 | 图（Graph）、向量、时序 | ❌ Git 无法索引 |
| **跨端共享** | 需 clone 整个仓库 | 线上/本地/IDE 插件即时访问 | ❌ clone 成本高 |
| **删除/遗忘** | 历史永久保留 | GDPR、敏感信息需可删除 | ❌ 合规风险 |
| **多仓场景** | 单仓边界 | 一个需求常跨多仓（前后端） | ❌ 仓库边界割裂上下文 |

### 2.2 更致命的三个问题

1. **"代码仓库"和"知识仓库"是两种物种**
   - 代码是**确定性产物**（deterministic artifact）
   - 上下文是**演进性知识**（evolving knowledge）
   - 混在一起 = 用 Git 当数据库，反模式

2. **线上 / 本地双模式无法共享**
   - 本地写入仓库 → push 才同步 → 线上拿不到最新
   - 线上改上下文 → 必须 commit → 污染 Git 历史
   - 两端永远不一致

3. **污染 PR 和代码评审**
   - AI 生成的中间产物进入 diff，review 负担爆炸
   - `.ai/` 目录成为垃圾场，无人维护

### 2.3 结论

> **上下文必须是线上持久化的一等服务（Context-as-a-Service），仓库只存"产物"和"引用"，不存"过程"和"知识"。**

---

## 三、解决方案：Context Hub 架构

### 3.1 整体架构：三层分离

```
┌───────────────────────────────────────────────────────────┐
│   Layer 3: Artifact Layer（产物层）—— 留在 Git 仓库       │
│   • 最终代码、���终文档（README/ADR 摘要）                 │
│   • 仅保留对 Context Hub 的引用（context-ref）            │
│   • 示例：// @context-ref: ctx://space/abc/req/123@v4     │
└───────────────────────────────────────────────────────────┘
                           ▲  只写最终产物
                           │
┌───────────────────────────────────────────────────────────┐
│   Layer 2: Context Hub（中心化上下文服务，线上持久化）    │
│   • Requirement Graph / Decision Log / API Contract       │
│   • 向量索引、符号索引、版本化、可订阅、可 diff           │
│   • 提供 REST + gRPC + WebSocket + MCP 协议               │
└───────────────────────────────────────────────────────────┘
                           ▲  读写上下文
                           │
┌───────────────────────────────────────────────────────────┐
│   Layer 1: Client Layer（接入层）                         │
│   • Web 控制台（PM / 设计 / 评审）                        │
│   • IDE 插件（VSCode / JetBrains）                        │
│   • CLI / Agent Runtime（本地模式跑 Agent）               │
│   • 本地缓存（只读镜像 + 离线队列）                       │
└───────────────────────────────────────────────────────────┘
```

**核心原则**：

- **Single Source of Truth = Context Hub**（不是 Git）
- **Git 存"是什么"，Hub 存"为什么 + 怎么来的"**
- 本地和线上都是 Hub 的**客户端**，天然共享

### 3.2 分层上下文模型

```
┌─────────────────────────────────────────────────┐
│  L1  Source Layer   —— 原始资产                  │
│      • PRD / PDF / Figma / API Spec / 截图       │
│      • 版本化、可 diff、带来源指纹               │
├─────────────────────────────────────────────────┤
│  L2  Semantic Layer —— 结构化知识                │
│      • Requirement Graph（需求节点 + 依赖）      │
│      • Entity / Component / API 抽取             │
│      • 向量索引 + 符号索引                       │
├────────────────────────────���────────────────────┤
│  L3  Task Layer     —— 当前任务切片              │
│      • 按 Step 动态 materialize 的"任务包"       │
│      • 含澄清记录、决策日志、变更溯源            │
├─────────────────────────────────────────────────┤
│  L4  Agreement Layer —— 契约 / 共识              │
│      • 前后端 API 契约、字段字典                 │
│      • 已确认决策（Decision Log, 类似 ADR）      │
└─────────────────────────────────────────────────┘
```

### 3.3 Context Hub 数据模型

```typescript
// 一切皆节点，节点之间是有向边
type ContextNode =
  | RequirementNode    // 需求片段（PDF 切片后的原子项）
  | EntityNode         // 业务实体
  | ApiContractNode    // 前后端契约
  | DesignNode         // Figma / 截图
  | DecisionNode       // 澄清结果、评审决议（ADR）
  | PlanNode           // Step 6 生成的方案
  | CodeRefNode        // 指向仓库某文件:行
  | ClarificationNode  // 澄清问答对

interface Node {
  id: string              // ctx://space/{spaceId}/{type}/{nodeId}
  version: number         // 单调递增
  contentHash: string     // 内容寻址
  parents: string[]       // 来源节点（溯源）
  subscribers: string[]   // 订阅者（受影响产物）
  acl: AccessPolicy
  createdBy: 'human' | 'agent' | 'import'
  status: 'draft' | 'pending-clarify' | 'confirmed' | 'stale'
  embedding?: Vector
}
```

**关键能力**：

| 能力 | 作用 | 解决的问题 |
|---|---|---|
| **内容寻址** | PDF 变更 → 只有变化的切片 hash 变 | 增量重跑，不全量 |
| **订阅-失效** | 代码产物订阅需求节点，节点变 → 标记 stale | 变更传播可控 |
| **版本 + 分支** | Context 也可以有分支（类比 Git） | 支持实验性方案并存 |
| **双向溯源** | 每行代码能查到来源需求，反之亦然 | 可解释性 |
| **事件流** | 所有变更走 event log（类 Kafka） | 线上/本地订阅同步 |

### 3.4 渐进式披露策略

每个 Step 声明 `context_spec`（类似 GraphQL query），Hub 按需投喂，而非全量灌入：

| Step | 只需要的上下文 | 不需要的 |
|---|---|---|
| 1 需求解析 | L1 原文 + 同类历史需求 | 代码库 |
| 2/5 资源检索 | L2 实体 + 向量���回 | PRD 全文 |
| 3 代码定位 | L2 符号图 + 命中文件 | 设计稿 |
| 4 界面分析 | Figma / 截图 + 组件库 | 后端 API |
| 6 方案设计 | L2 + L4（契约）+ Step1-5 摘要 | L1 原文 |
| 7 文档生成 | Step6 方案 + 模板 | 代码 |
| 8/9 执行 | 方案 + 定位结果 | — |

### 3.5 Gate 机制（人机澄清/确认关卡）

```
Step 1 需求解析
   └─▶ 【Gate A: 需求澄清】AI 主动提问歧义点 → 人工答复 → 写入 L4
Step 2-5 检索 & 分析
   └─▶ 【Gate B: 契约确认】前后端字段、错误码、鉴权 → 双方签字 → L4
Step 6 方案设计
   └─▶ 【Gate C: 方案评审】可视化 diff 预览 → Approve / Reject
Step 7 文档生成
Step 8-9 执行
   └─▶ 【Gate D: 变更确认】代码 diff review
```

**Gate 的技术形态**：

- **结构化问卷**：AI 生成选项，人工点选，降低回答成本
- **置信度阈值**：AI 自评 confidence < 0.8 自动触发 Gate，否则只通知
- **幂等确认**：同一 Gate 可多次触发，以最新决策为准，历史归档

---

## 四、线上 / 本地共享机制

### 4.1 方案：线上权威 + 本地只读镜像 + 离线写队列

```
线上 Hub (Authoritative Source)
    │
    ├─── WebSocket 推送变更事件
    │         ▼
    │    本地 Agent Runtime
    │    ├─ Read Cache（LRU + 按 Space 预拉）
    │    ├─ Offline Write Queue（离线时入队）
    │    └─ CRDT 合并器（重连时 push）
    │
    └─── REST 同步兜底
```

### 4.2 三种运行模式

| 模式 | 读 | 写 | 适用场景 |
|---|---|---|---|
| **纯线上** | Hub | Hub | 浏览器、CI/CD |
| **混合（默认）** | 本地缓存，miss 回源 | 直写 Hub，本地失效 | IDE 日常开发 |
| **离线优先** | 本地缓存 | 写本地 + 入队 | 内网、断网、飞机上 |

### 4.3 冲突解决

- 大部分节点是 **append-only**（澄清记录、决策日志）→ 天然无冲突
- 少数可变节点（方案草稿）→ CRDT（Yjs / Automerge）
- 强冲突 → 自动触发**人工 Gate**

### 4.4 数据本地化合规

```
┌─ Context Hub（线上）─────────────────┐
│ ✓ 语义层 L2（实体/图谱/embedding）   │
│ ✓ 决策层 L4（Decision / Contract）   │
│ ✗ 不存原文（默认）                   │
└──────────────────────────────────────┘
           ▲ 只上传脱敏后的结构化数据
┌─ 本地 Vault ─────────────────────────┐
│ ✓ 原始 PDF / 设计稿 / 代码           │
│ ✓ 客户端加密，密钥不出域             │
└──────────────────────────────────────┘
```

- **默认策略**：语义上云、原文留本地（符合大多数企业红线）
- **高敏客户**：全私有部署，Hub 部署在客户 VPC
- **标准客户**：SaaS + BYOK（客户持密钥）

### 4.5 部署形态对比

| 层级 | 线上模式 | 本地模式 |
|---|---|---|
| **Context Hub** | SaaS 多租户 + 加密存储 | 私有化部署 / 本地 SQLite + LanceDB |
| **LLM 调用** | GPT / Claude 等托管模型 | Ollama / vLLM 本地部署 |
| **检索** | 云端 Elastic + 向量服务 | 本地 embedding + FAISS |
| **同步** | 实时协作（CRDT） | 离线队列 + Git 式 push/pull |
| **权限** | RBAC + 审计日志 | 文件系统 ACL |
| **敏感数据** | 客户端加密后上传（E2EE 可选） | 不出域 |

---

## 五、改造后的 9-Step 流程

```
┌─ Context Hub (线上) ───────────────────────────────────┐
│                                                        │
│  [PDF] ──import──▶ L1 原文切片 ──parse──▶ L2 需求图   │
│                         │                              │
│                         ▼                              │
│                   【Gate A: 澄清】  ◀── Web / IDE 提问 │
│                         │                              │
│                         ▼                              │
│         Step 2/3/4/5: 检索 / 定位 / 界面 / 资源        │
│         （每步只订阅所需切片，Progressive Disclosure） │
│                         │                              │
│                         ▼                              │
│                   【Gate B: 契约确认】前后端签字       │
│                         │                              │
│                         ▼                              │
│              Step 6: 方案设计 → PlanNode              │
│                         │                              │
│                         ▼                              │
│                   【Gate C: 方案评审】                 │
│                         │                              │
└─────────────────────────┼──────────────────────────────��
                          ▼
              Step 7/8/9（可能在本地执行）
                          │
                          ▼
                   代码产物 + context-ref
                          │
                          ▼
                     Git 仓库（PR）
```

**关键变化**：

- Step 1-6 **全部在 Hub 侧**完成，产物都是 Hub 中的节点
- Step 8/9 可以下发到本地 Agent 跑（代码敏感）
- 仓库只在最后一步介入，收到的是"**已澄清、已评审、已签字**"的方案

---

## 六、仓库里到底留什么

只留**三种东西**，总量极少：

### 6.1 Context Reference（上下文引用）—— 代码注释/文件头

```typescript
/**
 * @context-ref ctx://space/deco/plan/abc123@v7
 * @requirement ctx://space/deco/req/login-sso@v2
 */
export function handleSSOLogin() { ... }
```

### 6.2 Decision Snapshot（决策快照）—— 只存最终版摘要

```
docs/adr/
  0007-sso-provider-choice.md   # 从 Hub 导出的最终决定
```

### 6.3 绑定配置 —— 告诉工具链去哪个 Space 取上下文

```yaml
# .deco/context.yaml
hub: https://hub.deco.ai
space: deco-main
bindings:
  - path: src/api/**
    contract: ctx://space/deco/contract/api-v3
```

### 6.4 不再存

- PDF 解析中间产物
- 向量索引
- 方案草稿
- 对话历史
- 检索缓存

**统统去 Hub。**

---

## 七、行业竞品对标

### 7.1 上下文存储位置

| 产品 | 上下文存储位置 | 评价 |
|---|---|---|
| **Cursor** `.cursorrules` | 落仓库 | ❌ 和原方案同病——污染、不共享 |
| **Aider** `.aider.chat.history` | 本地文件 | ❌ 单机，无协作 |
| **Continue.dev** | 本地 + 可选远端 | ⚠️ 折中，但无强一致 |
| **GitHub Copilot Spaces** | **GitHub 云端 Space** | ✅ 正确方向，上下文是独立资源 |
| **Claude Projects** | **Anthropic 云端 Project** | ✅ 独立于代码的知识容器 |
| **Devin** | **云端 Workspace** | ✅ Agent 状态完全托管 |
| **Linear + AI** | **Linear 云端 Issue Graph** | ✅ 需求图谱独立于代码 |
| **Notion AI** | **Notion 云端 Workspace** | ✅ 知识中台 |

**结论**：**领先产品无一例外把上下文做成独立的线上服务**，落仓库是早期工具链的历史包袱。

### 7.2 能力维度借鉴

| 产品 | 可借鉴点 | 对应解决 |
|---|---|---|
| **GitHub Copilot Spaces** | Space 作为任务级上下文容器，显式挑选文件/issue | 渐进披露 + L3 |
| **Cursor / Windsurf** | Memory Bank，项目级长期记忆 | 中心化存储 |
| **Devin / Cognition** | Plan → Approve → Execute 分阶段确认 | Gate 机制 |
| **Claude Projects** | Project Knowledge（稳定底座）+ 会话（临时层） | L1 / L3 分层 |
| **v0 / Bolt** | 方案可视化预览，所见即所得 confirm | Gate C |
| **Linear + AI** | Issue Graph 驱动，需求即节点 | Requirement Graph |
| **Notion AI / Glean** | 企业知识图谱 + 权限切片检索 | L2 + 权限 |
| **Aider** | 本地优先 + Git-native 变更追溯 | 本地模式溯源 |
| **Continue.dev** | 开源、可插拔、配置驱动 | 本地模式架构 |

---

## 八、落地迁移路径

| 阶段 | 动作 | 周期 |
|---|---|---|
| **P0** | 搭建 Context Hub MVP：Node/Edge 存储 + REST API + Web 控制台 | 2-3 周 |
| **P0** | 在 Step 1 后插入**需求澄清 Gate**（最低成本，最高收益） | 并行 |
| **P0** | 把"需求解析 + Decision Log"先搬上 Hub，其他 Step 不动 | 并行 |
| **P1** | 9-Step 流程全部改造为 Hub 读写，仓库只留 context-ref | 1-2 月 |
| **P1** | IDE 插件 + 本地缓存 + 离线队列 | 并行 |
| **P1** | 前后端**契约中心（L4 API Contract）**，自动校验一致性 | 并行 |
| **P2** | 私有部署包（Helm Chart）+ BYOK | 3 月内 |
| **P2** | 订阅-失效 + 增量重跑引擎 | 3 月内 |
| **P3** | 多人协作 CRDT、端到端加密、跨 Space 联邦 | 半年 |

---

## 九、总结

> **代码仓库负责"是什么"，Context Hub 负责"为什么、怎么来、还会变成什么"。**
>
> 上下文是线上的、活的、可订阅的中台服务；仓库只是它的一个下游消费者。
>
> 线上 / 本地模式的本质差异不是"存哪儿"，而是"在哪儿跑 Agent"——**存储永远在 Hub，执行可以在任何地方**。

### 核心设计原则

1. **Context-as-a-Service**：上下文是一等公民，独立于代码仓库
2. **Progressive Disclosure**：每个 Step 只拿自己需要的切片
3. **Human-in-the-Loop Gates**：关键节点必须有人机确认
4. **Content-addressed + Subscribable**：可 diff、可订阅、可失效
5. **Local-first Execution, Cloud-first Storage**：执行就近，存储权威
6. **Artifact vs Knowledge 分离**：Git 存产物，Hub 存知识

---

*文档版本：v1.0 ｜ 最后更新：2026-04-23*