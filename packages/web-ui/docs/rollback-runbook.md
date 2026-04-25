# Web UI Rollback Runbook

## 1. 目的

本手册用于在 `packages/web-ui` 新架构（Vite + Hono）切流后出现故障时，快速回退到 legacy Next.js 路径。

适用场景：

- `pnpm --filter @vitamin/web-ui build` 通过，但运行时 SPA 白屏或关键路由异常。
- `/api/*` 正常，但前端路由、资源加载或 hydration/CSR 初始化异常。
- 发布后核心流程（登录、聊天、MCP、Workflow、设置）出现 P0/P1 回归。

## 2. 回退窗口

- 当前保留的回退入口：`dev:legacy`、`build:legacy`、`start:legacy`
- 在 legacy 代码、`next.config.ts`、`next-env.d.ts`、`src/app/**` 被删除前，本手册必须保持有效。
- 只有当以下条件全部满足时，才允许关闭回退窗口：
  - 新架构 `build/start` 全链路稳定。
  - e2e 核心流程通过。
  - 至少完成一次人工回滚演练并留存结果。

## 3. 发布前检查

发布新架构前至少执行：

```bash
pnpm --filter @vitamin/web-ui build
pnpm --filter @vitamin/web-ui test
pnpm --filter @vitamin/web-ui test:e2e
```

如需快速本地验证运行态：

```bash
pnpm --dir packages/web-ui run start:new
curl http://127.0.0.1:4000/api/health
curl -I http://127.0.0.1:4000/
```

## 4. 故障判定

满足以下任一条件即可触发回滚：

- `/api/health` 返回非 200。
- `/` 返回非 200 或静态资源无法加载。
- 登录、聊天、MCP、Workflow、设置任一核心流程阻断。
- 前端故障无法在发布窗口内通过热修复完成。

## 5. 新架构快速核查

在决定回滚前，先区分故障面：

```bash
curl -s http://127.0.0.1:4000/api/health
curl -I http://127.0.0.1:4000/
```

判定建议：

- `/api/health` 失败：优先排查 server 启动、环境变量、静态目录路径。
- `/api/health` 正常但 `/` 异常：优先判定为 SPA/静态资源问题，可直接进入回滚。

## 6. 回滚步骤

### 6.1 停止新架构进程

停止当前运行中的 `start:new` / `dev:new` 相关进程。

### 6.2 切回 legacy 启动路径

开发环境：

```bash
pnpm --dir packages/web-ui run dev:legacy
```

生产构建：

```bash
pnpm --dir packages/web-ui run build:legacy
pnpm --dir packages/web-ui run start:legacy
```

### 6.3 回滚后验证

至少验证以下内容：

```bash
curl -I http://127.0.0.1:3000/
```

并人工确认：

- 登录可用
- 聊天页可访问
- MCP 页面可访问
- Workflow 页面可访问
- 设置页可访问

## 7. 回滚后记录

每次回滚都应记录：

- 回滚时间
- 触发原因
- 影响范围
- 回滚执行人
- 回滚后验证结果
- 后续修复项

建议将结果同步到：

- `docs/nextjs-to-vite-implementation-plan.md` 的 Phase 5 执行记录
- 对应发布记录或事故记录

## 8. 关闭回退窗口前的最终动作

只有在以下条件满足后，才允许删除 legacy：

- `start:new` 运行稳定
- `/api/health`、`/`、深链刷新验证通过
- 回滚手册已演练
- Phase 5 发布门禁已落地

届时再删除：

- `next.config.ts`
- `next-env.d.ts`
- `src/app/**`
- 其他仅供 Next runtime 使用的 legacy 文件