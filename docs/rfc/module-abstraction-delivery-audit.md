# Vitamin 全仓公共模块抽象交付审计

> 审计时间：2026-05-02
> 对应账本：[`module-abstraction-implementation-todos.md`](./module-abstraction-implementation-todos.md)

## 审计结论

MA 阶段实现账本已完成：9 项 TODO 全部为 `Done / 100% / Pass`，阶段总进度为 100%。

进度复核：

```text
MA-01 Done 100 Pass
MA-02 Done 100 Pass
MA-03 Done 100 Pass
MA-04 Done 100 Pass
MA-05 Done 100 Pass
MA-06 Done 100 Pass
MA-07 Done 100 Pass
MA-08 Done 100 Pass
MA-09 Done 100 Pass
count=9 sum=900 average=100.00 rounded=100
```

最新验证记录：

- `pnpm vitest run packages/shared/tests/runtime.test.ts packages/agent/tests/concurrency.test.ts packages/orchestrator/tests/executor.test.ts`
- `pnpm --filter @vitamin/shared typecheck`
- `pnpm --filter @vitamin/shared build`
- `pnpm --filter @vitamin/agent typecheck`
- `pnpm --filter @vitamin/orchestrator typecheck`
- `pnpm --filter @vitamin/agent build`
- `pnpm --filter @vitamin/orchestrator build`
- `pnpm typecheck`

结果：Pass。目标 vitest 3 个文件 32 项通过；全仓 typecheck 通过。

## 可纳入 MA 交付的新增文件

这些文件是 MA 实施中的新增公共模块、测试或兼容入口，可作为 MA 交付候选：

```text
docs/rfc/module-abstraction-audit.md
docs/rfc/module-abstraction-implementation-todos.md
docs/rfc/module-abstraction-delivery-audit.md
packages/protocol/
packages/schema/
packages/manifest/
packages/shared/src/browser/data.ts
packages/shared/src/runtime.ts
packages/shared/tests/data.test.ts
packages/shared/tests/runtime.test.ts
packages/opendev-ui/src/api/core.ts
packages/service/src/ws-protocol.ts
packages/memory/src/layered-memory.ts
packages/memory/tests/layered-memory.test.ts
packages/skill/tests/skill-parser.test.ts
packages/agent/src/concurrency.ts
packages/agent/tests/concurrency.test.ts
packages/tools/src/mcp/mcp-client.ts
packages/tools/src/mcp/mcp-manager.ts
packages/tools/src/mcp/mcp-tool-adapter.ts
packages/tools/src/mcp/transport.ts
packages/tools/src/mcp/types.ts
packages/tools/tests/mcp-agent-tools.test.ts
packages/tools/tests/mcp-compatibility.test.ts
```

## 需要逐块审查的既有文件

这些文件有 MA 相关改动，但也可能包含此前其他任务的历史改动。提交前不应整文件盲目纳入，应逐文件审查 diff：

```text
packages/mcp/package.json
packages/mcp/src/mcp-tool-adapter.ts
packages/memory/package.json
packages/opendev-ui/package.json
packages/opendev-ui/src/api/client.ts
packages/opendev-ui/src/api/devtools.ts
packages/opendev-ui/src/api/logs.ts
packages/opendev-ui/src/api/mcp.ts
packages/opendev-ui/src/api/traces.ts
packages/opendev-ui/src/api/websocket.ts
packages/opendev-ui/src/stores/status.ts
packages/opendev-ui/src/stores/subagents.ts
packages/opendev-ui/src/stores/todo.ts
packages/opendev-ui/src/types/index.ts
packages/orchestrator/src/executor.ts
packages/orchestrator/tests/executor.test.ts
packages/service/package.json
packages/service/src/inbound-router.ts
packages/service/src/types.ts
packages/shared/package.json
packages/shared/src/error.ts
packages/shared/src/index.ts
packages/shared/tsdown.config.ts
packages/skill/package.json
packages/skill/src/skill-parser.ts
packages/tools/package.json
packages/tools/src/mcp/index.ts
packages/tools/src/tool-validator.ts
packages/tools/src/web/url-validator.ts
packages/tools/tests/mcp-client.test.ts
packages/tools/tests/mcp-manager.test.ts
packages/tools/tests/mcp-tool-adapter.test.ts
packages/tools/tests/mcp-transport.test.ts
packages/tools/tests/web-tools.test.ts
vitest.config.ts
```

## 高风险文件

`pnpm-lock.yaml` 当前 diff 很大：

```text
pnpm-lock.yaml | 2325 insertions, 13760 deletions
```

风险判断：

- 该 diff 远大于 MA 新增 workspace package 的常规锁文件刷新规模。
- 不能直接视为低风险 lockfile 更新。
- 提交前应单独审查 lockfile 是否包含无关依赖图收缩、历史 package 删除或 install 版本差异。

已定位的主要原因：

- MA 相关 importer 增加符合预期：
  - `packages/protocol`
  - `packages/schema`
  - `packages/manifest`
  - `@vitamin/protocol` 被 service/UI 引入
  - `@vitamin/schema` 被 mcp/tools 引入
  - `@vitamin/manifest` 被 skill/memory 引入
  - `@vitamin/shared` 被 session 等边界引入
- `packages/web-ui` importer 从 lockfile 中删除，并连带删除大量依赖条目。
- 当前 `pnpm-workspace.yaml` 为 `packages/*`，但工作区里没有 `packages/web-ui` 目录，`git ls-files packages/web-ui` 也为空。
- 因此，`packages/web-ui` 删除属于清理陈旧 lockfile 状态，不是 MA 抽象本身的直接实现内容。

建议处理：

1. 不要把 `pnpm-lock.yaml` 与 MA 代码迁移混在同一个提交里。
2. 先提交 MA 文档、包和迁移代码，验证缺失 lockfile 是否影响 CI 策略。
3. 如必须提交 lockfile，则使用独立提交，提交说明中明确包含“新增 MA workspace importer”和“移除陈旧 `packages/web-ui` importer”两类变化。
4. 若不希望本阶段承载 `packages/web-ui` lockfile 清理，需要基于干净 lockfile 重新生成只包含 MA importer 变化的锁文件；当前工作区状态无法自动区分二者。

## 明确排除当前 MA 提交的文件

`docs/rfc/` 下还有其他未跟踪 RFC 文档，来源属于前序 Claude Code/Vitamin 对比任务，不应混入 MA 抽象交付提交：

```text
docs/rfc/claude-code-agent-framework-todos.md
docs/rfc/claude-code-source-analysis.md
docs/rfc/vitamin-vs-claude-code-implementation-todos.md
docs/rfc/vitamin-vs-claude-code-min-granularity.md
```

工作区还有大量非 MA 文件变更。当前 `git status --short | wc -l` 为 296 行，不能用全量 add/commit。

## 建议提交策略

建议按以下顺序拆分提交，而不是一次性提交全部工作区：

1. `MA docs`：`module-abstraction-audit.md`、`module-abstraction-implementation-todos.md`、本审计文档。
2. `MA low-level shared/protocol/schema/manifest`：`@vitamin/protocol`、`@vitamin/schema`、`@vitamin/manifest`、shared data/runtime/error。
3. `MA migrations`：UI/service/tools/mcp/skill/memory/session/agent/orchestrator 的调用方迁移。
4. `MA lockfile`：单独审查并提交 `pnpm-lock.yaml`；该提交应明确包含陈旧 `packages/web-ui` importer 清理，或重新生成只含 MA importer 的锁文件。

每个提交前至少执行：

```sh
pnpm typecheck
```

涉及目标包时补跑对应目标测试。

## 精确 staging 清单

不要使用 `git add .`。建议按下列清单分组 staging。

### 1. MA docs

```sh
git add \
  docs/rfc/module-abstraction-audit.md \
  docs/rfc/module-abstraction-implementation-todos.md \
  docs/rfc/module-abstraction-delivery-audit.md
```

### 2. MA low-level packages

```sh
git add \
  packages/protocol \
  packages/schema \
  packages/manifest \
  packages/shared/src/browser/data.ts \
  packages/shared/src/runtime.ts \
  packages/shared/tests/data.test.ts \
  packages/shared/tests/runtime.test.ts \
  packages/shared/src/error.ts \
  packages/shared/src/index.ts \
  packages/shared/package.json \
  packages/shared/tsdown.config.ts \
  vitest.config.ts
```

### 3. MA migrations

```sh
git add \
  packages/opendev-ui/package.json \
  packages/opendev-ui/src/api/core.ts \
  packages/opendev-ui/src/api/client.ts \
  packages/opendev-ui/src/api/devtools.ts \
  packages/opendev-ui/src/api/logs.ts \
  packages/opendev-ui/src/api/mcp.ts \
  packages/opendev-ui/src/api/traces.ts \
  packages/opendev-ui/src/api/websocket.ts \
  packages/opendev-ui/src/stores/status.ts \
  packages/opendev-ui/src/stores/subagents.ts \
  packages/opendev-ui/src/stores/todo.ts \
  packages/opendev-ui/src/types/index.ts \
  packages/service/package.json \
  packages/service/src/inbound-router.ts \
  packages/service/src/types.ts \
  packages/service/src/ws-protocol.ts \
  packages/mcp/package.json \
  packages/mcp/src/mcp-tool-adapter.ts \
  packages/tools/package.json \
  packages/tools/src/tool-validator.ts \
  packages/tools/src/mcp \
  packages/tools/tests/mcp-client.test.ts \
  packages/tools/tests/mcp-manager.test.ts \
  packages/tools/tests/mcp-tool-adapter.test.ts \
  packages/tools/tests/mcp-transport.test.ts \
  packages/tools/tests/mcp-agent-tools.test.ts \
  packages/tools/tests/mcp-compatibility.test.ts \
  packages/tools/src/web/url-validator.ts \
  packages/tools/tests/web-tools.test.ts \
  packages/skill/package.json \
  packages/skill/src/skill-parser.ts \
  packages/skill/tests/skill-parser.test.ts \
  packages/memory/package.json \
  packages/memory/src/layered-memory.ts \
  packages/memory/tests/layered-memory.test.ts \
  packages/session/package.json \
  packages/session/src/session-manager.ts \
  packages/session/src/in-memory-session.ts \
  packages/session/src/storage-factory.ts \
  packages/session/tests/session-manager.test.ts \
  packages/session/tests/in-memory-session.test.ts \
  packages/agent/src/concurrency.ts \
  packages/agent/tests/concurrency.test.ts \
  packages/orchestrator/src/executor.ts \
  packages/orchestrator/tests/executor.test.ts
```

### 4. MA lockfile

```sh
git add pnpm-lock.yaml
```

该组必须独立审查。当前 lockfile 同时包含 MA importer 变化和陈旧 `packages/web-ui` importer 清理。
