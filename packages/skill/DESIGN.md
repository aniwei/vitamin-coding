# @x-mars/skill 设计说明

## 设计目标

- 管理 SKILL.md 技能文件的发现、解析、匹配与注册。
- 支持本地（项目级 + 用户级）技能自动发现。
- 提供多因子评分的技能匹配算法。

## 非目标

- 不直接影响模型输出（仅提供技能内容注入到系统提示）。
- 不实现技能的执行逻辑。

## 实现原理

### SkillRegistry（skill-registry.ts）

技能的注册与生命周期管理：

- `register(skill)` / `unregister(name)` / `get(name)` / `list()`
- `discover()` → 扫描目录自动发现并注册
- `match(query)` → 根据查询匹配最佳技能
- `buildCatalog()` → 生成 system prompt 用的技能目录文本（格式：`- name: description`，供 Agent 感知可用技能）
- `execute(name, context)` → 加载技能内容并注入上下文
- 事件发射：`skill_discovered` / `skill_loaded` / `skill_unloaded` / `skill_error` / `skill_executed`

**触发模式**：

| 模式     | 触发方式                                              |
| -------- | ----------------------------------------------------- |
| `auto`   | Agent 在 LLM 选择后自动执行（通过 `load_skill` 工具） |
| `manual` | 仅在用户明确请求时执行                                |

### 技能发现（skill-discovery.ts）

自动扫描技能文件：

- 项目级：`.x-mars/skills/` 目录
- 用户级：`~/.x-mars/skills/` 目录
- 递归扫描 `*.md` 文件
- 返回 `DiscoveredSkill[]`（路径 + 元信息）

### 技能解析器（skill-parser.ts）

解析 SKILL.md 文件结构：

- YAML frontmatter 提取：`name`、`description`、`tags`、`version`、`applyTo` 等
- Markdown body 提取：技能指令内容
- 校验必要字段

### 技能匹配器（skill-matcher.ts）

多因子评分匹配算法：

- **名称匹配**（权重 0.3）：精确 / 前缀 / 包含
- **描述匹配**（权重 0.5）：关键词命中率
- **标签匹配**（权重 0.2）：标签交集
- 阈值过滤：评分低于阈值的排除
- 返回排序后的匹配结果

### 执行上下文（skill-context.ts）

为技能执行提供上下文注入：

- 当前文件路径、语言
- 工作空间信息
- 用户消息摘要

## 实现流程

```
XMarsApp.init()
       |
  SkillRegistry.discover()
       |
  扫描 .x-mars/skills/ + ~/.x-mars/skills/
       |
  遍历 *.md → SkillParser.parse() → Skill 对象
       |
  SkillRegistry.register(skill)
       |
  Agent 运行时 → SkillRegistry.match(userMessage)
       |
  SkillMatcher 多因子评分 → 排序
       |
  匹配技能的内容注入系统提示
```

## 模块分层

| 文件                     | 职责                                      |
| ------------------------ | ----------------------------------------- |
| `src/types.ts`           | Skill / DiscoveredSkill / SkillMatch 类型 |
| `src/skill-registry.ts`  | 注册 + 发现 + 事件                        |
| `src/skill-discovery.ts` | 目录扫描                                  |
| `src/skill-parser.ts`    | SKILL.md 解析                             |
| `src/skill-matcher.ts`   | 多因子匹配                                |
| `src/skill-context.ts`   | 执行上下文                                |
| `src/index.ts`           | barrel 导出                               |

## 入口与依赖

- **入口**：`src/index.ts`
- **内部依赖**：`@x-mars/shared`、`@x-mars/env`、`@x-mars/invariant`
- **外部依赖**：无

## 测试策略

- 测试文件数：5
- 覆盖：技能发现、YAML 解析、名称/描述/标签匹配、注册生命周期
