# @vitamin/prompt

## 模块定位

管理系统提示模板的加载、缓存与组装。支持本地/HTTP 双提示源，以及环境上下文、记忆、技能、经验的多段注入。

## 核心功能

| 模块 | 功能 |
|------|------|
| PromptManager | 系统提示组装与缓存 |
| LocalPromptProvider | 文件系统模板加载 |
| HttpPromptProvider | HTTP 远程模板加载 |
| ProfileResolver | Agent Profile 精确/模糊解析 |
| EnvironmentContext | 工作空间 + Git + OS 信息收集 |
| LessonInjector | 经验格式化与注入 |
| PhaseContext | 阶段标记注入/提取 |

## 目录概览

```
src/
  types.ts                  # 核心类型
  prompt-manager.ts         # 核心协调器
  prompt-cache.ts           # 模板缓存
  local-prompt-provider.ts  # 文件系统源
  http-prompt-provider.ts   # HTTP 源
  profile-resolver.ts       # Profile 解析
  environment-context.ts    # 环境上下文
  phase-context.ts          # Phase 标记
  lesson-injector.ts        # 经验注入
  index.ts
prompts/                    # 内置模板
tests/                      # 6 个测试文件
```

## 开发命令

```bash
pnpm --filter @vitamin/prompt build
pnpm --filter @vitamin/prompt typecheck
pnpm --filter @vitamin/prompt clean
```

## 关联包

`@vitamin/setting`、`@vitamin/shared`、`@vitamin/env`、`@vitamin/invariant`
