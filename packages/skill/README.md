# @x-mars/skill

## 模块定位

管理 SKILL.md 技能文件的发现、解析、匹配与注册。支持项目级和用户级技能自动发现。

## 核心功能

| 模块           | 功能                                         |
| -------------- | -------------------------------------------- |
| SkillRegistry  | 技能注册/发现/生命周期事件                   |
| SkillDiscovery | .x-mars/skills/ + ~/.x-mars/skills/ 扫描     |
| SkillParser    | SKILL.md YAML frontmatter + Markdown 解析    |
| SkillMatcher   | 多因子评分（名称 0.3 + 描述 0.5 + 标签 0.2） |

## 目录概览

```
src/
  types.ts           # 核心类型
  skill-registry.ts  # 注册表
  skill-discovery.ts # 自动发现
  skill-parser.ts    # 解析器
  skill-matcher.ts   # 匹配器
  skill-context.ts   # 执行上下文
  index.ts
tests/
```

## 开发命令

```bash
pnpm --filter @x-mars/skill build
pnpm --filter @x-mars/skill typecheck
pnpm --filter @x-mars/skill clean
```

## 关联包

`@x-mars/shared`、`@x-mars/env`、`@x-mars/invariant`
