# Hermes Agent 架构分析

> 基于 [hermes-agent.nousresearch.com/docs](https://hermes-agent.nousresearch.com/docs/) 及源码结构的深度分析。

## 1. 系统全景

```
┌─────────────────────────────────────────────────────────────────────┐
│                        入口层                                       │
│  CLI (cli.py)    Gateway (gateway/run.py)    ACP (acp_adapter/)    │
│  Batch Runner    API Server                  Python Library         │
└──────────┬──────────────┬───────────────────────┬───────────────────┘
           │              │                       │
           ▼              ▼                       ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     AIAgent (run_agent.py)  ~9,200行                │
│                                                                     │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐               │
│  │ Prompt       │ │ Provider     │ │ Tool         │               │
│  │ Builder      │ │ Resolution   │ │ Dispatch     │               │
│  └──────┬───────┘ └──────┬───────┘ └──────┬───────┘               │
│  ┌──────┴───────┐ ┌──────┴───────┐ ┌──────┴───────┐               │
│  │ Compression  │ │ 3 API Modes  │ │ Tool Registry│               │
│  │ & Caching    │ │ chat_compl.  │ │ 47 tools     │               │
│  │              │ │ codex_resp.  │ │ 40 toolsets   │               │
│  │              │ │ anthropic    │ │              │               │
│  └──────────────┘ └──────────────┘ └──────────────┘               │
└─────────────────────────────────────────────────────────────────────┘
           │                                    │
           ▼                                    ▼
┌───────────────────┐              ┌──────────────────────┐
│ Session Storage   │              │ Tool Backends         │
│ (SQLite + FTS5)   │              │ Terminal (6 backends) │
│                   │              │ Browser (5 backends)  │
└───────────────────┘              │ MCP (dynamic)         │
                                   └──────────────────────┘
```

## 2. 目录结构

```
hermes-agent/
├── run_agent.py              # AIAgent — 核心对话循环 (~9,200 行)
├── cli.py                    # HermesCLI — 交互式终端 UI (~8,500 行)
├── model_tools.py            # 工具发现、Schema 收集、调度分发
├── toolsets.py               # 工具分组和平台预设
├── hermes_state.py           # SQLite 会话/状态数据库 + FTS5
├── hermes_constants.py       # HERMES_HOME，profile 感知路径
├── batch_runner.py           # 批量轨迹生成
│
├── agent/                    # Agent 内部模块
│   ├── prompt_builder.py     # 系统提示词组装
│   ├── context_engine.py     # ContextEngine ABC (可插拔)
│   ├── context_compressor.py # 默认引擎 — 有损摘要压缩
│   ├── prompt_caching.py     # Anthropic prompt caching
│   ├── auxiliary_client.py   # 辅助 LLM (视觉/摘要)
│   ├── memory_manager.py     # MemoryManager 编排 (内置+插件)
│   ├── memory_provider.py    # MemoryProvider ABC
│   ├── skill_commands.py     # Skill 命令处理
│   └── trajectory.py         # 轨迹保存
│
├── hermes_cli/               # CLI 子命令
│   ├── main.py               # 所有 hermes 子命令 (~5,500 行)
│   ├── config.py             # DEFAULT_CONFIG, 迁移
│   ├── commands.py           # COMMAND_REGISTRY
│   ├── auth.py               # PROVIDER_REGISTRY, 凭据解析
│   ├── runtime_provider.py   # Provider → api_mode + credentials
│   ├── plugins.py            # PluginManager — 发现/加载/Hook
│   └── callbacks.py          # 终端回调 (clarify, sudo, approval)
│
├── tools/                    # 47 个工具实现 (每文件一工具)
│   ├── registry.py           # 中央工具注册表
│   ├── approval.py           # DANGEROUS_PATTERNS 检测
│   ├── terminal_tool.py      # 终端编排
│   ├── file_tools.py         # 文件操作
│   ├── web_tools.py          # 网页搜索/提取
│   ├── browser_tool.py       # 11 个浏览器自动化工具
│   ├── delegate_tool.py      # 子 Agent 委派
│   ├── mcp_tool.py           # MCP 客户端 (~2,200 行)
│   └── environments/         # 终端后端 (local/docker/ssh/modal/daytona/singularity)
│
├── gateway/                  # 消息平台网关
│   ├── run.py                # GatewayRunner — 消息分发 (~7,500 行)
│   ├── session.py            # SessionStore — 会话持久化
│   ├── delivery.py           # 出站消息投递
│   ├── pairing.py            # DM 配对授权
│   └── platforms/            # 15 个适配器 (telegram/discord/slack/whatsapp/
│                             #   signal/matrix/mattermost/email/sms/
│                             #   dingtalk/feishu/wecom/weixin/homeassistant...)
│
├── acp_adapter/              # ACP 服务器 (VS Code / Zed / JetBrains)
├── cron/                     # 调度器 (jobs.py, scheduler.py)
├── plugins/memory/           # 记忆提供者插件
├── plugins/context_engine/   # 上下文引擎插件
├── environments/             # RL 训练环境 (Atropos)
├── skills/                   # 内置 Skills (始终可用)
├── optional-skills/          # 官方可选 Skills
└── tests/                    # Pytest 测试套件 (~3,000+ 测试)
```

## 3. Agent 循环 (AIAgent)

### 3.1 核心职责

- 组装系统提示词和工具 Schema (`prompt_builder.py`)
- 选择 Provider/API 模式 (chat_completions / codex_responses / anthropic_messages)
- 可中断的模型调用 + 取消支持
- 工具调用执行 (顺序或通过线程池并发)
- 维护 OpenAI 格式的对话历史
- 压缩、重试、回退模型切换
- 跨父子 Agent 的迭代预算追踪
- 上下文丢失前刷新持久化记忆

### 3.2 回合生命周期

```
run_conversation()
  1. 生成 task_id (如无)
  2. 追加用户消息到对话历史
  3. 构建或复用缓存的系统提示词 (prompt_builder.py)
  4. 检查是否需要预压缩 (>50% 上下文窗口)
  5. 从对话历史构建 API 消息
     - chat_completions: 原样 OpenAI 格式
     - codex_responses: 转换为 Responses API
     - anthropic_messages: 通过 anthropic_adapter.py 转换
  6. 注入短暂提示层 (预算警告/上下文压力)
  7. 如使用 Anthropic 则应用 prompt caching 标记
  8. 执行可中断 API 调用 (_api_call_with_interrupt)
  9. 解析响应:
     - 有 tool_calls → 执行，追加结果，回到步骤 5
     - 文本响应 → 持久化会话，按需刷新记忆，返回
```

### 3.3 三种 API 模式

| 模式                 | 适用                                  | 客户端                           |
| -------------------- | ------------------------------------- | -------------------------------- |
| `chat_completions`   | OpenAI 兼容端点 (OpenRouter/自定义等) | `openai.OpenAI`                  |
| `codex_responses`    | OpenAI Codex / Responses API          | `openai.OpenAI` (Responses 格式) |
| `anthropic_messages` | 原生 Anthropic Messages API           | `anthropic.Anthropic`            |

**解析优先级**：显式 `api_mode` 参数 > Provider 检测 > Base URL 启发式 > 默认 `chat_completions`

### 3.4 可中断 API 调用

```
┌──────────────────────┐     ┌──────────────┐
│  主线程              │     │  API 线程    │
│  等待:               │────▶│  HTTP POST   │
│  - 响应就绪          │     │  到 Provider  │
│  - 中断事件          │     └──────────────┘
│  - 超时              │
└──────────────────────┘
```

中断时：API 线程被放弃、部分响应不注入历史、Agent 可处理新输入。

### 3.5 工具执行

- **单个工具调用** → 主线程直接执行
- **多个工具调用** → `ThreadPoolExecutor` 并发（交互式工具如 `clarify` 强制串行）
- 结果按原始顺序重新插入

**执行流程**:

```
model 返回 tool_call
  → 从 tools/registry.py 解析 handler
  → pre_tool_call 插件钩子
  → 危险命令检测 (tools/approval.py)
    → 危险: 调用 approval_callback，等待用户
  → 执行 handler
  → post_tool_call 插件钩子
  → 追加 {"role": "tool", "content": result} 到历史
```

**Agent 级工具** (拦截处理，不走 Registry):

- `todo` — Agent 本地任务状态
- `memory` — 持久化记忆写入
- `session_search` — 会话历史查询
- `delegate_task` — 生成子 Agent

### 3.6 迭代预算

- 默认 90 次迭代 (`agent.max_turns`)
- 父子 Agent 共享预算
- 70%+ 追加 `[BUDGET: 开始整合工作]` 提示
- 90%+ 追加 `[BUDGET WARNING: 立即提供最终响应]` 提示
- 100% 停止并返回工作摘要

### 3.7 回退模型

失败时 (429/5xx/401/403) → 遍历 `fallback_providers` 列表 → 401/403 先尝试刷新凭据 → 辅助任务 (视觉/压缩等) 有独立回退链。

### 3.8 回调表面

| 回调                     | 触发时机           | 用途                           |
| ------------------------ | ------------------ | ------------------------------ |
| `tool_progress_callback` | 每次工具执行前后   | CLI spinner / Gateway 进度消息 |
| `thinking_callback`      | 模型开始/停止思考  | CLI "thinking..." 指示器       |
| `reasoning_callback`     | 模型返回推理内容   | CLI 推理显示                   |
| `clarify_callback`       | clarify 工具被调用 | CLI 输入提示                   |
| `step_callback`          | 每回合完成后       | Gateway 步骤追踪               |
| `stream_delta_callback`  | 每个流式 token     | CLI 流式显示                   |
| `status_callback`        | 状态变更           | ACP 状态更新                   |

## 4. 记忆系统

### 4.1 MemoryProvider ABC

```python
class MemoryProvider(ABC):
    name: str

    def initialize(session_id, **kwargs): ...
    def system_prompt_block() -> str: ...
    def prefetch(query, session_id) -> str: ...
    def sync_turn(user_content, assistant_content, session_id): ...
    def get_tool_schemas() -> List[Dict]: ...
    def handle_tool_call(tool_name, args, **kwargs) -> str: ...

    # 生命周期钩子
    def on_turn_start(turn_number, message, **kwargs): ...
    def on_pre_compress(messages) -> str: ...
    def on_session_end(messages): ...
    def on_delegation(task, result, child_session_id): ...
    def on_memory_write(action, target, content): ...
    def shutdown(): ...
```

### 4.2 MemoryManager

- 编排内置 Provider + 至多 **1 个**外部插件 Provider
- 记忆注入系统提示词 (`build_system_prompt()`)
- 预取上下文带 `<memory-context>` 防篱标签
- 每回合结束同步 (`sync_turn`)
- 失败隔离 — 一个 Provider 失败不阻塞另一个

### 4.3 上下文防篱 (Context Fencing)

```python
def build_memory_context_block(raw_context: str) -> str:
    clean = sanitize_context(raw_context)  # 剥离 fence-escape 序列
    return (
        "<memory-context>\n"
        "[System note: Recalled memory context, NOT new user input.]\n"
        f"{clean}\n"
        "</memory-context>"
    )
```

防止模型将记忆召回内容误读为用户新输入。

### 4.4 持久化记忆文件

- `MEMORY.md` — Agent 管理的项目/技术记忆
- `USER.md` — 用户画像和偏好
- `SOUL.md` — 人格文件

### 4.5 记忆 Nudge

Agent 在上下文接近压缩阈值时被提醒主动持久化重要发现。这不是用户触发的，而是系统内置的自我维护机制。

## 5. Skills 系统

### 5.1 闭环学习

```
复杂任务完成 → Agent 判断是否值得提炼
  → skill_create: 创建可复用 Skill (步骤 + 标签 + 描述)
  → 下次遇到相似任务时自动激活
  → 执行中如失败/不完美 → skill_improve: 自动修订
  → Skills Hub (agentskills.io) 社区共享
```

### 5.2 Skill 结构

- Markdown 文件，包含步骤描述、前置条件、标签
- 兼容 agentskills.io 开放标准
- 按 Hub (内置 / 用户创建 / 社区下载) 分层管理
- 集中式 Skills Index — 消除 GitHub API 调用

### 5.3 跨会话搜索

- SQLite FTS5 全文搜索
- LLM 摘要对搜索结果进行精炼（非原文返回）
- 会话血缘追踪（压缩创建子会话）
- `session_search` 作为 Agent 可调用工具暴露

## 6. 工具系统

### 6.1 自注册模型

所有工具模块在导入时调用 `registry.register()`。`model_tools.py` 负责导入/发现工具模块。

```python
registry.register(
    name="terminal",
    toolset="terminal",
    schema={...},
    handler=handle_terminal,
    check_fn=check_terminal,    # 可选: 可用性检查
    requires_env=["SOME_VAR"],  # 可选: 所需环境变量
)
```

### 6.2 47 个工具，20 个 Toolset

| 类别       | 工具                                       |
| ---------- | ------------------------------------------ |
| Terminal   | terminal (6 种后端)                        |
| File       | read_file, write_file, patch, search_files |
| Web        | web_search, web_extract                    |
| Browser    | 11 个浏览器自动化工具                      |
| Code       | execute_code sandbox                       |
| Delegation | delegate_task (子 Agent)                   |
| Memory     | memory (持久化)                            |
| Skills     | skill_create, skill_improve, skill_search  |
| Session    | session_search                             |
| MCP        | 动态 MCP 服务工具                          |
| Cron       | 定时任务管理                               |
| Vision     | 图像分析                                   |
| TTS        | 文本转语音                                 |

### 6.3 DANGEROUS_PATTERNS 审批

正则检测破坏性操作：`rm -rf` / `mkfs` / `DROP TABLE` / `curl | sh` / fork bomb...

审批分级：交互式提示 → 智能审批 (LLM 判断低风险) → 会话级记忆 → 永久白名单。

### 6.4 6 种终端后端

| 后端        | 特性                      |
| ----------- | ------------------------- |
| local       | 本地进程                  |
| docker      | 容器隔离                  |
| ssh         | 远程机器                  |
| daytona     | 无服务器持久化 (空闲休眠) |
| modal       | GPU 集群 + 无服务器       |
| singularity | HPC 容器                  |

## 7. 多平台 Gateway

### 7.1 架构

```
Platform event → Adapter.on_message() → MessageEvent
  → GatewayRunner._handle_message()
    → 用户授权
    → 解析会话 Key
    → 创建 AIAgent (带会话历史)
    → AIAgent.run_conversation()
    → 通过 Adapter 投递响应
```

### 7.2 15+ 平台适配器

Telegram / Discord / Slack / WhatsApp / Signal / Matrix / Mattermost / Email / SMS / DingTalk / Feishu / WeCom / WeiXin / BlueBubbles / Home Assistant / Webhook

### 7.3 特性

- 单一 Gateway 进程服务所有平台
- 语音备忘转写
- 跨平台会话上下文延续
- DM Pairing 授权
- Hook 系统集成

## 8. Cron 调度

- **Agent 任务，非 Shell 任务** — 用 Agent 执行自然语言提示词
- 支持附加 Skills 和脚本
- 投递到任何平台 (Telegram 里收日报，Slack 里推审计)
- JSON 存储任务状态和下次运行时间

## 9. RL / 训练

- 批量轨迹生成 (`batch_runner.py`)
- Atropos RL 环境集成 (`tinker-atropos` 子模块)
- ShareGPT 格式轨迹导出
- 轨迹压缩 → 训练下一代工具调用模型

## 10. 设计原则

| 原则          | 说明                                          |
| ------------- | --------------------------------------------- |
| Prompt 稳定性 | 系统提示词不在对话中途变化                    |
| 可观察执行    | 每个工具调用通过回调对用户可见                |
| 可中断        | API 调用和工具执行支持中途取消                |
| 平台无关核心  | 一个 AIAgent 类服务 CLI/Gateway/ACP/Batch/API |
| 松耦合        | 可选子系统 (MCP/插件/RL) 使用注册表模式       |
| Profile 隔离  | 每个 Profile 独立 HOME/Config/记忆/会话       |
