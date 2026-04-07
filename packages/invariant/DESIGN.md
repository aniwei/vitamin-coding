# @vitamin/invariant 设计说明

## 设计目标

- 提供断言工具与构建期 invariant 清理能力。
- 支持开发期精确断言 + 生产构建自动剥离，实现零运行时开销。

## 非目标

- 不在本包内实现业务逻辑。
- 不做运行时日志采集（仅条件输出到 console）。

## 实现原理

### 断言函数（invariant.ts）

`invariant(condition, message?)` 提供带 TypeScript `asserts` 子句的运行时断言：
- 条件为 falsy 时抛出 `InvariantError`（携带 `framesToPop = 1` 用于栈清理）。
- 支持布尔值或函数型条件、字符串或数字消息。

命名空间方法 `invariant.debug()` / `.log()` / `.warn()` / `.error()` 根据当前 verbosity 级别条件输出到 console。`setVerbosity(level)` 动态切换级别，返回旧值以便测试恢复。

### 构建期剥离插件（tsup-strip-invariant-plugin.ts）

`createStripInvariantInProductionPlugin(options)` 是 tsup/esbuild 插件，在构建阶段自动移除开发断言代码：
1. 检测 `if (process.env.NODE_ENV !== 'production') { ... }` 守卫块。
2. 扫描块内是否包含 `invariant()` 调用（支持 import alias）。
3. 有 invariant 调用则移除整个 if 块，保留 else 分支。
4. 若 import 语句中 invariant 已无引用，移除该 import。

基于 TypeScript AST 实现精确变换，不依赖正则。

## 实现流程

```
开发时：
  invariant(condition, message) --> 条件检查 --> 失败抛出 InvariantError

生产构建：
  tsup 加载 stripInvariantPlugin
       |
  扫描 process.env.NODE_ENV 守卫块
       |
  检测 invariant() 调用 --> 移除守卫块 + 清理未用 import
       |
  产物中不含断言代码
```

## 模块分层

| 文件 | 职责 |
|------|------|
| `src/invariant.ts` | invariant 断言函数 + InvariantError + verbosity 控制 |
| `src/tsup-strip-invariant-plugin.ts` | 构建期 AST 剥离插件 |
| `src/index.ts` | barrel 导出 |

## 入口与依赖

- **入口**：`src/index.ts`
- **内部依赖**：无
- **外部依赖**：`typescript`（用于 AST 解析）

## 测试策略

- 测试文件数：2
- `invariant.test.ts`：断言行为、错误类型、verbosity 控制
- `tsup-strip-invariant-plugin.test.ts`：9 种 AST 变换场景
