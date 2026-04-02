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
| `VITAMIN_HOME` | `~/.vitamin` 或 `VITAMIN_HOME` 环境变量 |
| `VITAMIN_USER_CONFIG_DIR` | `~/.config/vitamin` |
| `VITAMIN_PROJECT_DIR` | `{cwd}/.vitamin` |
| `VITAMIN_ROOT` | `.vitamin` |
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
| `AGENT_TOOLS_MAX_TURNS` | Agent 最大 tool 循环轮次（25） |

### Memory 阈值常量

| Export | Description |
|--------|-------------|
| `MEMORY_COMPACTION_TRIGGER_FRACTION` | Compaction 触发阈值（0.85） |
| `MEMORY_PRUNE_TRIGGER_FRACTION` | Prune 触发阈值（0.70） |
| `MEMORY_PRUNE_MINIMUM_TOKENS` | Prune 最小节省 token（20000） |
| `MEMORY_TOOL_*` | 工具名常量（read/write/edit 等） |

### Session 常量

| Export | Description |
|--------|-------------|
| `SESSION_IDLE_TIMEOUT_MS` | 会话空闲超时（30分钟） |
| `SESSION_MAX` | 最大会话数（50） |
| `SESSION_PAGE_SIZE` | 分页大小（20） |
