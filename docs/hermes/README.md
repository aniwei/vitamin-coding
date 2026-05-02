# Hermes Agent 整合分析

> 基于 [NousResearch/hermes-agent](https://github.com/nousresearch/hermes-agent) v0.8.0 (2026-04-08) 的深度分析，以及将其核心优势整合到 X-Mars 的设计方案。

## 文档索引

| 文档                                             | 说明                                  |
| ------------------------------------------------ | ------------------------------------- |
| [architecture.md](./architecture.md)             | Hermes Agent 架构全景与核心子系统分析 |
| [advantages.md](./advantages.md)                 | Hermes 核心优势清单及与 X-Mars 对比   |
| [integration-design.md](./integration-design.md) | 整合设计方案 — 新增/增强的包与接口    |
| [roadmap.md](./roadmap.md)                       | 分阶段实施路线图与关键设计决策        |

## 核心结论

1. **Hermes 最核心的差异化** — 闭环学习系统（自主创建 Skill → 使用中自改进 → 跨会话记忆检索 → 用户建模），X-Mars 当前缺失
2. **X-Mars 已有优势** — 类型安全模块化体系、31+ Hook 拦截点、5 种 Swarm 协作模式、LLM 驱动编排器，均远超 Hermes
3. **整合策略** — 不移植 Python 代码，而是参考 Hermes 设计，在 X-Mars 的 TypeScript 模块化体系中重新实现
4. **最高优先级** — Phase 1 闭环学习系统（MemoryProvider + Skill 自创建 + 跨会话搜索）

## 技术栈差异

| 维度   | X-Mars                | Hermes                        |
| ------ | --------------------- | ----------------------------- |
| 语言   | TypeScript (严格 ESM) | Python 93.3%                  |
| 架构   | 20+ 独立包分层模块化  | 单体 (run_agent.py ~9,200 行) |
| Stars  | —                     | 72.3k                         |
| 贡献者 | —                     | 403                           |
| 许可证 | —                     | MIT                           |
