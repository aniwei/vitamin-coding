# @vitamin/skill

Skill 管理包 — 支持 [Agent Skills 开放标准](https://agentskills.io/specification)。

## 概述

`@vitamin/skill` 提供了完整的 skill 生命周期管理：

- **发现** — 自动扫描项目本地和全局 skill 目录
- **解析** — 解析 SKILL.md (YAML frontmatter + Markdown body)
- **注册** — 管理 skill 的注册状态和元数据
- **匹配** — 根据用户意图关键词匹配相关 skill
- **执行** — 加载 skill 内容注入 agent context

## Skill 格式

每个 skill 是一个包含 `SKILL.md` 的目录:

```
.vitamin/skills/
  my-skill/
    SKILL.md           # 主要 skill 文件 (必需)
    supporting-file.ts # 辅助文件 (可选)
```

`SKILL.md` 格式:

```markdown
---
name: my-skill
description: Use when [specific triggering conditions]
tags: [debugging, testing]
trigger: auto
---

# My Skill

## Overview
Core principle...

## When to Use
- Symptom A
- Symptom B
```

## 使用

```typescript
import { createSkillRegistry } from '@vitamin/skill'

const registry = createSkillRegistry({
  workspaceDir: '/path/to/project',
  library: {
    projectDirs: ['.vitamin/skills'],
    globalDirs: ['~/.vitamin/skills'],
  },
})

// 发现所有 skill
await registry.discover()

// 匹配相关 skill
const matches = registry.match('help me debug this flaky test')

// 加载 skill
const result = registry.load('systematic-debugging')
console.log(result.content) // skill body 内容
```

## 目录结构

| 文件 | 说明 |
|------|------|
| `types.ts` | 类型定义 (SkillMetadata, SkillDefinition, etc.) |
| `skill-parser.ts` | SKILL.md 解析器 |
| `skill-discovery.ts` | 文件系统 skill 发现 |
| `skill-matcher.ts` | 关键词匹配引擎 |
| `skill-registry.ts` | SkillRegistry 核心注册表 |

## 主要导出

### 注册表

- `SkillRegistry` — 核心注册表类
- `createSkillRegistry` — 创建注册表实例

### 解析与发现

- `parseSkillContent` — 解析 SKILL.md 文件（YAML frontmatter + Markdown body）
- `discoverSkills` — 扫描目录批量发现 skill
- `getDefaultGlobalSkillDirs` — 获取默认全局 skill 目录列表
- `resolveSourceType` — 解析 skill 来源类型（`local` | `global` | `url`）

### 匹配

- `matchSkills` — 根据查询字符串按关键词匹配 skill 列表

### 类型

- `SkillRegistryOptions`
- `SkillMetadata`, `SkillDefinition`, `RegisteredSkill`
- `SkillStatus`, `SkillSourceType`, `SkillSource`
- `SkillLibraryConfig`, `SkillMatch`
- `SkillExecutionContext`, `SkillExecutionResult`
- `SkillEvents`
