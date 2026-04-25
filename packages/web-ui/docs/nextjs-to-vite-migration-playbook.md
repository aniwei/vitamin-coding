# Web UI Next.js -> Vite 详细迁移设计（Playbook）

## 1. 文档目的与范围

本文件是模块级迁移蓝图，面向开发执行，覆盖以下对象：

- 模块（module）
- 页面（page）
- 接口（API/Actions）
- 组件（component）
- hooks/lib/types/store

引用文档：

- 技术设计总纲：`docs/nextjs-to-vite-csr-design.md`

## 2. 迁移基线与约束

### 2.1 硬性约束

- 禁止 Next API shim：不允许 `useRouter` 兼容封装，不允许 `next/dynamic` 兼容封装。
- 统一 CSR：页面与状态管理完全基于 React + react-router-dom。
- API 边界统一：client 只能经 `/api/*` 调 server。
- 国际化统一：react-i18next + 命名空间资源。

### 2.2 目录目标

- `client/src`: 前端唯一业务入口。
- `server/src`: 后端唯一源码入口。
- `src`: legacy 过渡区，仅迁移期间只读。

## 3. 页面迁移矩阵（App Router -> React Router）

### 3.1 Layout 与全局入口

| Legacy 文件 | 目标文件 | 迁移方式 | 备注 |
| --- | --- | --- | --- |
| `src/app/layout.tsx` | `client/src/main.tsx`、`client/src/app/providers/index.tsx` | 拆分为根挂载与 Provider 组合 | 去除 Next Metadata/Head 语义 |
| `src/app/globals.css` | `client/src/styles/globals.css` | 直接复制并修正资源路径 | 保持视觉一致性 |
| `src/app/(chat)/layout.tsx` | `client/src/app/layouts/chat-layout.tsx` | 改为路由布局组件 | Outlet 渲染子路由 |
| `src/app/(auth)/layout.tsx` | `client/src/app/layouts/auth-layout.tsx` | 改为路由布局组件 | 含登录态前置判断 |
| `src/app/(chat)/(admin)/layout.tsx` | `client/src/app/layouts/admin-layout.tsx` | 改为路由布局组件 | 权限守卫由 Route Guard 完成 |

### 3.2 页面路由映射

| Legacy 页面 | 新路由路径 | 目标页面文件 | 迁移方式 |
| --- | --- | --- | --- |
| `src/app/(chat)/page.tsx` | `/` | `client/src/pages/chat/index.tsx` | 从 server component 语义改为 CSR 页面 |
| `src/app/(chat)/chat/[thread]/page.tsx` | `/chat/:thread` | `client/src/pages/chat/thread.tsx` | `params.thread` 改为 `useParams()` |
| `src/app/(chat)/chat/[thread]/loading.tsx` | `/chat/:thread` loading | `client/src/pages/chat/thread.loading.tsx` 或骨架组件 | 由 Suspense/fallback 接管 |
| `src/app/(chat)/archive/[id]/page.tsx` | `/archive/:id` | `client/src/pages/archive/detail.tsx` | 路由参数改造 |
| `src/app/(chat)/mcp/page.tsx` | `/mcp` | `client/src/pages/mcp/index.tsx` | 按现有 dashboard 组件重组 |
| `src/app/(chat)/mcp/create/page.tsx` | `/mcp/create` | `client/src/pages/mcp/create.tsx` | 表单与校验迁移到 client |
| `src/app/(chat)/mcp/modify/[id]/page.tsx` | `/mcp/:id/edit` | `client/src/pages/mcp/edit.tsx` | 参数 + 请求改造 |
| `src/app/(chat)/mcp/test/[id]/page.tsx` | `/mcp/:id/test` | `client/src/pages/mcp/test.tsx` | 参数 + 请求改造 |
| `src/app/(chat)/workflow/page.tsx` | `/workflow` | `client/src/pages/workflow/index.tsx` | 保持功能对齐 |
| `src/app/(chat)/workflow/[id]/page.tsx` | `/workflow/:id` | `client/src/pages/workflow/detail.tsx` | 结构编辑器路由参数改造 |
| `src/app/(auth)/sign-in/page.tsx` | `/sign-in` | `client/src/pages/auth/sign-in.tsx` | 去掉 Next 表单语义 |
| `src/app/(auth)/sign-up/page.tsx` | `/sign-up` | `client/src/pages/auth/sign-up.tsx` | 迁移到纯 CSR |
| `src/app/(auth)/sign-up/email/page.tsx` | `/sign-up/email` | `client/src/pages/auth/sign-up-email.tsx` | 保持现有流程 |
| `src/app/(public)/export/[id]/page.tsx` | `/export/:id` | `client/src/pages/export/detail.tsx` | 公共页无鉴权布局 |
| `src/app/(public)/export/[id]/loading.tsx` | `/export/:id` loading | `client/src/pages/export/detail.loading.tsx` | Suspense/fallback |
| `src/app/(chat)/(admin)/admin/users/(list)/page.tsx` | `/admin/users` | `client/src/pages/admin/users/index.tsx` | 加权限 guard |
| `src/app/(chat)/(admin)/admin/users/[id]/page.tsx` | `/admin/users/:id` | `client/src/pages/admin/users/detail.tsx` | 参数与权限校验迁移 |

### 3.3 路由实现文件

- `client/src/app/router.tsx`: 路由树定义（createBrowserRouter）。
- `client/src/app/guards/auth-guard.tsx`: 登录态守卫。
- `client/src/app/guards/permission-guard.tsx`: 权限守卫。
- `client/src/app/not-found.tsx`: 404 页面。

## 4. API 迁移矩阵（Next Route Handlers/Actions -> Hono）

### 4.1 迁移原则

- legacy `src/app/api/**/route.ts` 迁入 `server/src/routes/*.ts`。
- legacy `src/app/api/**/actions.ts` 改造成：
  - client `api` 调用函数（`client/src/lib/api/*.ts`）
  - server handler 内部 service/repository 调用。
- 保持接口契约稳定，统一返回 envelope。

### 4.2 路由分组迁移

| Legacy 接口 | 新 server 路由文件 | 新 client 调用文件 | 迁移说明 |
| --- | --- | --- | --- |
| `src/app/api/chat/route.ts` | `server/src/routes/chat.ts` | `client/src/lib/api/chat.ts` | 核心聊天接口 |
| `src/app/api/chat/models/route.ts` | `server/src/routes/chat.ts` | `client/src/lib/api/chat.ts` | 子路径整合 |
| `src/app/api/chat/title/route.ts` | `server/src/routes/chat.ts` | `client/src/lib/api/chat.ts` | 统一 chat 路由模块 |
| `src/app/api/chat/temporary/route.ts` | `server/src/routes/chat.ts` | `client/src/lib/api/chat.ts` | 临时会话接口 |
| `src/app/api/chat/export/route.ts` | `server/src/routes/export.ts` | `client/src/lib/api/export.ts` | 可导出接口拆分 |
| `src/app/api/thread/route.ts` | `server/src/routes/sessions.ts` | `client/src/lib/api/sessions.ts` | 线程/会话统一 |
| `src/app/api/mcp/route.ts` | `server/src/routes/mcp.ts` | `client/src/lib/api/mcp.ts` | MCP 主接口 |
| `src/app/api/mcp/list/route.ts` | `server/src/routes/mcp.ts` | `client/src/lib/api/mcp.ts` | 列表接口归并 |
| `src/app/api/mcp/[id]/route.ts` | `server/src/routes/mcp.ts` | `client/src/lib/api/mcp.ts` | id 参数路由 |
| `src/app/api/mcp/oauth/callback/route.ts` | `server/src/routes/mcp.ts` | 无（服务端回调） | OAuth callback 仅 server |
| `src/app/api/workflow/route.ts` | `server/src/routes/workflow.ts` | `client/src/lib/api/workflow.ts` | 工作流主接口 |
| `src/app/api/workflow/[id]/route.ts` | `server/src/routes/workflow.ts` | `client/src/lib/api/workflow.ts` | 明细接口 |
| `src/app/api/workflow/[id]/execute/route.ts` | `server/src/routes/workflow.ts` | `client/src/lib/api/workflow.ts` | 执行接口 |
| `src/app/api/workflow/[id]/structure/route.ts` | `server/src/routes/workflow.ts` | `client/src/lib/api/workflow.ts` | 结构接口 |
| `src/app/api/workflow/tools/route.ts` | `server/src/routes/workflow.ts` | `client/src/lib/api/workflow.ts` | tools 列表 |
| `src/app/api/settings/*`（由 legacy 配置路由实现） | `server/src/routes/settings.ts` | `client/src/lib/api/settings.ts` | 统一设置接口 |
| `src/app/api/user/preferences/route.ts` | `server/src/routes/user.ts` | `client/src/lib/api/user.ts` | 用户偏好 |
| `src/app/api/user/details/route.ts` | `server/src/routes/user.ts` | `client/src/lib/api/user.ts` | 用户详情 |
| `src/app/api/admin/*` | `server/src/routes/admin.ts` | `client/src/lib/api/admin.ts` | 管理接口单独聚合 |
| `src/app/api/archive/*` | `server/src/routes/archive.ts` | `client/src/lib/api/archive.ts` | 归档接口聚合 |
| `src/app/api/storage/*` | `server/src/routes/storage.ts` | `client/src/lib/api/storage.ts` | 上传/ingest |
| `src/app/api/export/*` | `server/src/routes/export.ts` | `client/src/lib/api/export.ts` | 导出与评论 |
| `src/app/api/coding-service/[...path]/route.ts` | `server/src/routes/coding-service.ts` | `client/src/lib/api/coding-service.ts` | 反向代理/网关能力 |

### 4.3 actions 文件迁移

| Legacy actions | 新位置 | 迁移方式 |
| --- | --- | --- |
| `src/app/api/chat/actions.ts` | `client/src/lib/api/chat.ts` | 改为普通异步请求函数 |
| `src/app/api/mcp/actions.ts` | `client/src/lib/api/mcp.ts` | 去除 server action 标记 |
| `src/app/api/workflow/actions.ts` | `client/src/lib/api/workflow.ts` | 去除 server action 标记 |
| `src/app/api/archive/actions.ts` | `client/src/lib/api/archive.ts` | 去除 server action 标记 |
| `src/app/api/storage/actions.ts` | `client/src/lib/api/storage.ts` | 去除 server action 标记 |
| `src/app/api/user/actions.ts` | `client/src/lib/api/user.ts` | 去除 server action 标记 |
| `src/app/api/admin/actions.ts` | `client/src/lib/api/admin.ts` | 去除 server action 标记 |
| `src/app/api/auth/actions.ts` | `client/src/lib/api/auth.ts` | 对接 server auth API |

## 5. 组件迁移矩阵（229 files）

### 5.1 基础 UI 组件（src/components/ui）

迁移策略：

- 全量复制到 `client/src/components/ui`。
- 批量检查 Next 依赖（`next/link`、`next/image`）并替换为 React 方案。
- 保留 `class-variance-authority`、Radix 生态，不改 public API。

关键文件（优先核查）：

- `button.tsx`
- `input.tsx`
- `textarea.tsx`
- `badge.tsx`
- `card.tsx`
- `tooltip.tsx`
- `dialog.tsx`

### 5.2 布局与壳组件（src/components/layouts）

迁移策略：

- 迁移到 `client/src/components/layouts`。
- 将路由相关逻辑替换为 react-router-dom。
- 所有导航行为只保留 `useNavigate`。

关键文件：

- `app-header.tsx`
- `app-sidebar.tsx`
- `app-sidebar-menus.tsx`
- `app-sidebar-threads.tsx`
- `theme-provider.tsx`

### 5.3 业务组件分域迁移

| 组件域 | 来源目录 | 目标目录 | 迁移策略 |
| --- | --- | --- | --- |
| Chat | `src/components/chat-*`、`message*.tsx`、`prompt-input.tsx` | `client/src/features/chat/components` | 请求与路由 API 全部换成 client API 层 |
| MCP | `src/components/mcp-*` | `client/src/features/mcp/components` | 将 action 调用改为 `client/src/lib/api/mcp.ts` |
| Workflow/Devtools | `src/components/devtools`、`src/components/workflow` | `client/src/features/workflow/components` | 保留 ReactFlow 逻辑，改造数据读写接口 |
| Admin/User | `src/components/admin`、`src/components/user` | `client/src/features/admin/components` | 引入权限守卫和按需加载 |
| Export | `src/components/export` | `client/src/features/export/components` | 公共页组件与鉴权态拆分 |
| Tool Invocation | `src/components/tool-invocation` | `client/src/features/tools/components` | 与 API 响应模型对齐 |

### 5.4 组件迁移顺序

1. `ui` 与 `layouts`（底座）
2. `chat` + `mcp`（核心业务）
3. `workflow/devtools`（复杂交互）
4. `admin/export/user`（边缘域）

## 6. Hooks / Lib / Store / Types 迁移矩阵

### 6.1 Hooks（src/hooks）

迁移目标：`client/src/hooks`

策略：

- 纯前端 hooks 直接迁移：`use-copy.ts`、`use-debounce.ts`、`use-mobile.ts`。
- 请求类 hooks 改为调用 `client/src/lib/api/*`：
  - `use-chat-models.ts`
  - `use-mcp-list.ts`
  - `use-workflow-tool-list.ts`
  - `use-service-sessions.ts`
- `use-coding-chat.ts` 与新 server 路由对齐，统一会话接口语义。

### 6.2 Lib（src/lib）

迁移分流：

- 仅 client 可用：迁入 `client/src/lib`（例如 `notify`、前端缓存辅助）。
- 仅 server 可用：迁入 `server/src/lib`（数据库、认证实例、服务编排）。
- 双端共享：迁入 `shared/src`（类型、schema、常量、错误码）。

高风险目录（需拆分）：

- `src/lib/auth/*`
- `src/lib/db/*`
- `src/lib/ai/*`
- `src/lib/code-runner/*`

### 6.3 Store（src/app/store）

迁移目标：`client/src/store`

- `breakpoint.store.ts`
- `workflow.store.ts`
- `log.store.ts`
- `index.ts`

说明：去除与 Next 布局生命周期耦合，统一在 client providers 初始化。

### 6.4 Types（src/types）

迁移目标：`shared/src/types` + `client/src/types`

分层策略：

- API DTO：`shared/src/contracts`
- 前端视图类型：`client/src/types`
- 仅 server 内部类型：`server/src/types`

## 7. 国际化迁移分工

### 7.1 命名空间

- `common`
- `auth`
- `chat`
- `mcp`
- `workflow`
- `settings`
- `admin`
- `export`

### 7.2 文案抽取优先级

1. 导航/按钮/空态
2. 错误提示与 toast
3. 表单标签与校验提示
4. 帮助文案与描述性文本

### 7.3 迁移落点

- `client/src/i18n/index.ts`
- `client/src/i18n/locales/zh-CN/*.json`
- `client/src/i18n/locales/en-US/*.json`

## 8. 不可接受方案（明确禁止）

- 禁止新增 `next/navigation` 的桥接层。
- 禁止新增 `useRouter` 同名兼容 hook。
- 禁止保留 `'use server'` action 语义并在 client 调用。
- 禁止把 `src/app/api` 继续当作新功能承载目录。

## 9. 完成定义（迁移维度）

单个模块迁移完成需同时满足：

- 路由可访问，刷新深链可用。
- 接口调用仅走 `client/src/lib/api`。
- 无 Next import。
- 关键文案完成 i18n。
- 单元测试与冒烟用例通过。
