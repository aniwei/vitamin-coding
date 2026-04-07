# @vitamin/env

集中管理环境变量读取与默认常量定义。所有需要读取环境变量或引用全局路径/阈值的包都应通过此模块统一获取。

## 安装

```bash
pnpm add @vitamin/env
```

## 导出分类

### 工具函数

| Export | Description |
|--------|-------------|
| `normalizeEnv(value, default)` | 解析环境变量为正整数，无效时返回默认值 |

### 路径常量

| Export | Description |
|--------|-------------|
| `VITAMIN_USER_AGENT` | User-Agent 标识 |
| `VITAMIN_ROOT` | `.vitamin` |
| `VITAMIN_HOME` | `~/.vitamin` 或 `VITAMIN_HOME` 环境变量 |
| `VITAMIN_USER_CONFIG_DIR` | `~/.config/vitamin` |
| `VITAMIN_PROJECT_DIR` | `{cwd}/.vitamin` |
| `VITAMIN_PROJECT_ROOT` | 项目根目录 |
| `AUTH_PATH` | 认证信息文件路径 |
| `LOG_FILE` | 日志文件路径 |
| `LOG_LEVEL` | 日志级别 |

### 工具限制常量

| Export | Description |
|--------|-------------|
| `TOOLS_SEARCH_MAX_OUTPUT_LINES` | 搜索工具最大输出行数（500） |
| `TOOLS_LS_MAX_ENTRIES` | ls 工具最大条目数（500） |
| `TOOLS_MAX_OUTPUT_LINES` | 工具最大输出行数（2000） |
| `TOOLS_MAX_OUTPUT_BYTES` | 工具最大输出字节数（60KB） |
| `TOOLS_EXECUTE_TIMEOUT_MS` | 工具执行超时（30s） |
| `TOOLS_BINARY_DOWNLOAD_TIMEOUT_MS` | 二进制工具下载超时 |
| `AGENT_TOOLS_MAX_TURNS` | Agent 最大 tool 循环轮次（25） |

### Memory 阈值常量

| Export | Description |
|--------|-------------|
| `MEMORY_COMPACTION_TRIGGER_FRACTION` | Compaction 触发阈值（0.85） |
| `MEMORY_COMPACTION_KEEP_RECENT_FRACTION` | Compaction 保留近期消息比例 |
| `MEMORY_COMPACTION_RESERVE_TOKENS` | Compaction 预留 token 数 |
| `MEMORY_PRUNE_TRIGGER_FRACTION` | Prune 触发阈值（0.70） |
| `MEMORY_PRUNE_PROTECT_FRACTION` | Prune 保护比例 |
| `MEMORY_PRUNE_MINIMUM_TOKENS` | Prune 最小节省 token（20000） |
| `MEMORY_PRUNE_TRUNCATE_MAX_LENGTH` | Prune 截断最大长度 |
| `MEMORY_TOOL_*` | 工具名常量（read/write/edit/grep/find/ls 等） |
| `MEMORY_LEGACY_TOOL_*` | 旧版工具名兼容常量 |
| `MEMORY_ARCHIVE_SNAPSHOT_VERSION` | 归档快照版本号 |

### Setting 常量

| Export | Description |
|--------|-------------|
| `SETTING_OFFLINE_MODE_ENABLED` | 离线模式开关 |

### Session 常量

| Export | Description |
|--------|-------------|
| `SESSION_DIR` | Session 存储目录 |
| `SESSION_REMOTE_URL` | Session 远程 URL |
| `SESSION_IDLE_TIMEOUT_MS` | 会话空闲超时（30分钟） |
| `SESSION_MAX` | 最大会话数（50） |
| `SESSION_PAGE_SIZE` | 分页大小（20） |
| `SESSION_SNAPSHOT_VERSION` | Session 快照版本号 |

### Checkpoint 常量

| Export | Description |
|--------|-------------|
| `CHECKPOINT_DIR` | Checkpoint 存储目录 |
| `CHECKPOINT_SNAPSHOT_VERSION` | Checkpoint 快照版本号 |
