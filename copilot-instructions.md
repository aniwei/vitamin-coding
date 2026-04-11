# Copilot Instructions

## 依赖管理

- 安装依赖时必须使用精确版本号，禁止使用 `^` 或 `~` 前缀。
  ```bash
  # 正确
  pnpm add some-pkg@1.2.3 --save-exact
  # 错误
  pnpm add some-pkg  # 会写入 ^1.2.3
  ```
- 添加依赖前先确认其功能是否已被现有依赖覆盖，不引入冗余依赖。
- 区分 `dependencies` 与 `devDependencies`：仅运行时需要的包放 `dependencies`，构建/测试/类型等放 `devDependencies`。
- 引用 monorepo 内部包统一使用 `workspace:*`：
  ```json
  { "dependencies": { "@vitamin/shared": "workspace:*" } }
  ```

## 工具链

本项目强制使用以下工具链，不得引入替代品：

| 职责              | 工具       | 禁止替代                 |
| ----------------- | ---------- | ------------------------ |
| Monorepo 任务编排 | **Nx**     | Turborepo、Lerna         |
| Lint              | **oxlint** | ESLint                   |
| 格式化            | **oxfmt**  | Prettier                 |
| 打包（库）        | **tsup**   | rollup、esbuild 直接调用 |
| 前端打包          | **Vite**   | webpack、Parcel          |
| 测试              | **vitest** | Jest                     |

### Nx 使用规范

- 所有跨包任务通过 Nx 执行，不要直接 `cd packages/xxx && pnpm build`。
  ```bash
  pnpm build                         # 构建所有包
  npx nx build @vitamin/agent        # 构建单个包
  npx nx run-many -t build --affected  # 仅构建受变更影响的包
  ```
- 每个包的 `scripts` 须与 `nx.json` 中定义的 target 保持一致。
- Nx 缓存已启用（`build`、`typecheck`、`test`、`lint`），不要手动绕过缓存。

### oxlint 使用规范

- 配置文件：`.oxlintrc.json`，已启用 `typescript`、`react`、`unicorn` 插件。
- 运行检查：`pnpm lint`；自动修复：`pnpm lint:fix`。
- 以下规则不得关闭：
  - `typescript/no-unused-vars`、`typescript/no-explicit-any`、`prefer-const`

### oxfmt 使用规范

- 配置文件：`.oxfmtrc.json`，格式约定：2 空格缩进、单引号、无分号、尾逗号、最大行宽 100。
- 运行格式化：`pnpm format`；检查格式：`pnpm lint`（含 `oxfmt --check`）。

## 新增包规范

新包必须遵循以下 `package.json` 结构：

```json
{
  "name": "@vitamin/<name>",
  "version": "0.0.1",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "files": ["dist"],
  "scripts": {
    "build": "tsup",
    "typecheck": "tsc --noEmit",
    "clean": "rm -rf dist"
  },
  "publishConfig": {
    "access": "public",
    "registry": "https://registry.npmjs.org"
  }
}
```

## 包架构与分层

包之间存在明确的依赖层次，不得产生循环依赖：

```
env                         ← 最底层，无内部依赖
  └─ persistence            ← 存储抽象
       ├─ session           ← 会话管理
       └─ memory            ← 上下文记忆与压缩
shared / invariant          ← 基础工具，供所有包使用
ai                          ← Anthropic API 封装
setting                     ← 配置加载（依赖 shared）
agent                       ← 核心执行引擎（依赖 ai、setting、shared）
hooks                       ← 生命周期钩子与权限系统（依赖 agent）
orchestrator                ← 任务编排（依赖 agent、hooks）
prompt / resources          ← 提示词与资源管理
tools / coding / skill      ← 工具实现
devtools / mcp / swarm      ← 上层扩展
service / cli               ← 入口层，依赖最广
web-ui                      ← 前端，仅通过 WebSocket 与 service 通信
```

### 环境变量与常量

**所有**环境变量读取和全局常量必须定义在 `@vitamin/env`，其他包从中导入，不得在各自包内重复读取 `process.env`：

```ts
// 正确
import { TOOLS_EXECUTE_TIMEOUT_MS, VITAMIN_HOME } from '@vitamin/env'

// 错误
const timeout = parseInt(process.env['TOOLS_EXECUTE_TIMEOUT_MS'] ?? '30000', 10)
```

### Hook 系统

需要在 agent 生命周期中注入逻辑时，使用 `@vitamin/hooks` 提供的 `HookRegistry`，不要在 agent 核心代码中直接硬编码副作用：

```ts
import { createHookRegistry } from '@vitamin/hooks'
```

## TypeScript 规范

`tsconfig.base.json` 已开启极严格模式，编写代码时须注意：

- **`verbatimModuleSyntax`**：类型导入必须使用 `import type`，不得与值导入混写。

  ```ts
  // 正确
  import { foo } from './foo'
  import type { FooType } from './foo'

  // 错误
  import { foo, type FooType } from './foo' // 部分类型导入
  ```

- **`noUncheckedIndexedAccess`**：数组/对象索引访问结果为 `T | undefined`，必须做判断。
- **`noUnusedLocals` / `noUnusedParameters`**：不得存在未使用的变量或参数。
- **`noImplicitReturns`**：所有分支必须有明确返回值。
- 禁止使用 `any`（`typescript/no-explicit-any` 为 error 级别）。

## 提交前检查

```bash
pnpm lint && pnpm typecheck && pnpm test
```

## 通用规范

- 所有包均为 ESM-only（`"type": "module"`），不使用 CommonJS。
- TypeScript target 为 ES2024，不降级。
- 不在代码中保留已删除逻辑的注释占位符（如 `// removed`、`// TODO: delete`）。
