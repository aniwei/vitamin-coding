# @vitamin/shared 设计说明

## 设计目标

- 提供跨包共享的通用基础设施能力：日志、事件、错误体系、文件系统、HTTP、序列化等。
- 保持包边界清晰，避免跨包耦合回流。
- 通过稳定入口与类型导出，支持 monorepo 内部复用。

## 非目标

- 不在本包内实现业务编排层之外的跨域职责。
- 不承担与其职责无关的运行时装配。

## 实现原理

### 错误体系（error.ts）

采用继承自 `Error` 的分域错误类层级，每个错误类携带 `code` 标识和可选 `cause` 链。涵盖 Config / Provider / OAuth / Stream / Agent / Tool / Hook / Session / Extension / Mcp 共 10 个域，通过结构化 `code` 支持上层精准 catch。

### 类型工具（types.ts）

提供品牌类型 `Brand<T, B>`（名义类型区分），`DeepPartial<T>` / `DeepReadonly<T>` 递归类型变换，以及 `Awaitable<T>` 等函数签名辅助类型。

### 事件系统（event-emitter.ts / subscrption.ts / bus-subscrption.ts）

- `TypedEventEmitter<T>`：基于 Map 实现的类型安全事件发射器，支持 `on / off / once / emit / removeAllListeners / listenerCount`。
- `Subscription<T>`：扩展 TypedEventEmitter，增加 `publish()` 批量发射和通配符事件 `*`，以及具名 `subscribe()` / `subscribeAll()` 接口。
- `BusSubscription`：继承 Subscription，用于消息总线风格的跨模块事件传播。

### 可释放资源（disposable.ts）

实现 `Symbol.dispose` / `Symbol.asyncDispose` 协议的资源释放栈。`DisposableStack` 和 `AsyncDisposableStack` 以 LIFO 顺序自动回收资源，支持混合同步/异步资源，并在多个清理失败时聚合错误。

### 日志（logger.ts）

基于 pino 的结构化日志系统。`createLogger(name)` 创建具名子日志器；`getRootLogger()` 获取全局实例；`attachLogListener()` 订阅所有日志消息，用于实时监控。支持多目标输出（文件 + 终端 pretty-print）和环境变量级别配置。

### 文件系统工具（fs-extra.ts）

封装常用文件操作：`mkdirp`（递归创建目录）、`rimraf`（递归删除）、`exists` / `isFile` / `isDirectory`（存在性检查）、`mime`（MIME 类型推断）。

### 路径工具（path.ts）

统一路径规范化（正斜杠），提供 Vitamin 约定目录解析：`getVitaminHomeDir()` / `getVitaminProjectDir()` / `getThirdPartyToolDir()` / `getThirdPartyToolBinaryDir()` 等。

### HTTP 客户端（http.ts）

- `request()`：基于 Fetch API 的 HTTP 请求，支持 AbortSignal / 超时 / 代理。
- `stream()`：SSE 流式读取，返回 `AsyncIterable<SseEvent>`，自动处理 429/529 限流和服务端错误。默认流超时 300 秒。

### JSONC 解析（jsonc.ts）

- `parseJsonc<T>()`：解析带注释和尾逗号的 JSON（基于 jsonc-parser）。
- `safeStringify()`：稳定序列化（基于 safe-stable-stringify），确保相同输入产生相同输出。

### Markdown 处理（markdown.ts）

基于 unified / remark 系列插件的 AST 处理套件：
- `createMarkdownProcessor()` / `createGfmProcessor()` / `createFrontmatterProcessor()`：按需创建解析器。
- AST 工具：`getNodeText()`、`extractBoldLabels()`、`extractInlineCodes()`、`countChecks()`、`extractFrontmatter()`、`extractBodyFromAst()`。

### 文本截断（truncate.ts）

- `truncateHead()` / `truncateTail()`：按行/字节上限截断文本，返回携带截断元信息的 `TruncatedResult`。
- `truncateLine()`：单行截断；`formatBytes()`：人类可读字节格式化。

## 实现流程

```
调用方 --import--> @vitamin/shared
                      |
               src/index.ts (barrel 导出)
                      |
         对应模块文件 (error / logger / http / ...)
                      |
            模块内完成处理并返回结构化结果
```

所有公共 API 通过 `src/index.ts` 统一导出，消费方无需感知内部目录结构。

## 模块分层

| 文件 | 职责 |
|------|------|
| `src/error.ts` | 10 个分域错误类 |
| `src/types.ts` | Brand / DeepPartial / DeepReadonly 等类型工具 |
| `src/event-emitter.ts` | TypedEventEmitter 类型安全事件发射器 |
| `src/subscrption.ts` | Subscription 带通配符的具名订阅 |
| `src/bus-subscrption.ts` | BusSubscription 总线式事件订阅 |
| `src/disposable.ts` | 可释放资源栈（sync + async） |
| `src/logger.ts` | pino 日志器 + listener 订阅 |
| `src/fs-extra.ts` | mkdirp / rimraf / exists / mime 文件工具 |
| `src/path.ts` | 路径规范化 + Vitamin 约定目录 |
| `src/string.ts` | slugify 字符串工具 |
| `src/jsonc.ts` | JSONC 解析 + 稳定序列化 |
| `src/http.ts` | HTTP 请求 + SSE 流式读取 |
| `src/markdown.ts` | unified/remark Markdown AST 处理 |
| `src/truncate.ts` | 文本截断 + 字节格式化 |
| `src/index.ts` | barrel 导出入口 |

## 入口与依赖

- **入口**：`src/index.ts`
- **内部依赖**：`@vitamin/env`、`@vitamin/invariant`
- **外部依赖**：`pino`、`eventsource-parser`、`jsonc-parser`、`mime-types`、`safe-stable-stringify`、`unified` / `remark-*`、`uuid`

## 测试策略

- 测试文件数：11
- 测试以行为断言为主，覆盖公开接口与关键分支，无 mock/spy。
