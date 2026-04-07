# @vitamin/ai 设计说明

## 设计目标
- 提供模型抽象、Provider 适配、流事件与 Token 统计等 AI 基础能力。
- 保持包边界清晰，避免跨包耦合回流。
- 通过稳定入口与类型导出，支持 monorepo 内部复用。

## 非目标
- 不在本包内实现业务编排层之外的跨域职责。
- 不在该包内承担与其职责无关的运行时装配。

## 模块分层
- `src/auth-store.ts`：auth-store.ts 模块实现。
- `src/cost.ts`：cost.ts 模块实现。
- `src/event-stream.ts`：event-stream.ts 模块实现。
- `src/index.ts`：index.ts 模块实现。
- `src/model-registry.ts`：model-registry.ts 模块实现。
- `src/model-slot-resolver.ts`：model-slot-resolver.ts 模块实现。
- `src/models/`：models 相关实现。
- `src/oauth/`：oauth 相关实现。
- `src/oauth-registry.ts`：oauth-registry.ts 模块实现。
- `src/provider/`：provider 相关实现。
- `src/provider-registry.ts`：provider-registry.ts 模块实现。
- `src/stream.ts`：stream.ts 模块实现。

## 入口与依赖
- 入口：`src/index.ts`
- 内部依赖：
  - `@vitamin/env`
  - `@vitamin/setting`
  - `@vitamin/shared`

## 执行流程（抽象）
- 调用方通过包入口导入能力。
- 入口将调用分发到 `src/` 下具体模块。
- 模块内按职责完成处理并返回结构化结果。
- 若存在 Hook/事件机制，则通过回调实现扩展。

## 测试策略
- 当前测试文件数：13。
- 测试以行为断言为主，优先覆盖公开接口与关键分支。

## 文档维护约定
- 每次新增/删除公开导出时，同步更新 README 的“公开导出”章节。
- 每次目录结构调整时，同步更新本设计文档“模块分层”章节。
- 同步日期：2026-04-07
