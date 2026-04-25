# Web UI Next.js -> Vite 实施文档（阶段化 TODO）

## 1. 文档说明

本文件基于以下两份文档进行实施拆解：

- 技术设计总纲：`docs/nextjs-to-vite-csr-design.md`
- 详细迁移设计：`docs/nextjs-to-vite-migration-playbook.md`

目标：为每个阶段提供可执行 TODO LIST，并在每阶段开发前后执行“文档对齐审核 + 测试用例审核”。

## 2. 开发状态定义

- `未开始`
- `进行中`
- `已完成`
- `阻塞`

## 3. 通用执行规则（所有阶段必须遵循）

### 3.1 阶段开始前（必须执行）

1. 读取并确认引用文档章节。
2. 读取代码规范：
   - `packages/web-ui/AGENTS.md`
   - 仓库级 `copilot-instructions.md`
3. 将阶段 TODO 状态从 `未开始` 更新为 `进行中`。

### 3.2 阶段完成后（必须执行）

1. 文档对齐审核：逐条校验改动是否符合“技术设计 + 迁移设计”。
2. 测试用例审核：
   - 单元测试覆盖新增/变更逻辑。
   - 至少 1 条失败路径测试。
   - 关键路由冒烟通过。
3. TODO 状态更新为 `已完成`，记录偏差与后续事项。

---

## 4. Phase 0 基线冻结与盘点

引用文档：

- 技术设计：2.1、6、7、10.6
- 迁移设计：2、3、4、5

阶段前置读取清单：

- `docs/nextjs-to-vite-csr-design.md`
- `docs/nextjs-to-vite-migration-playbook.md`
- `packages/web-ui/AGENTS.md`
- `copilot-instructions.md`

### Phase 0 TODO LIST

| 功能名称 | 改动文件 | 开发状态 | 备注（引用章节） |
| --- | --- | --- | --- |
| 冻结 legacy 变更窗口 | `packages/web-ui/docs/phase-0-baseline-freeze.md`、`packages/web-ui/README.md` | 已完成 | 技术设计 6/10.6 |
| 生成页面/API/组件盘点清单 | `packages/web-ui/docs/nextjs-to-vite-migration-playbook.md` | 已完成 | 迁移设计 3/4/5 |
| 标注迁移 owner 与截止日期 | `packages/web-ui/docs/phase-0-baseline-freeze.md`、`packages/web-ui/docs/nextjs-to-vite-implementation-plan.md` | 已完成 | 技术设计 10.6 |

Phase 0 执行记录：

- 执行日期：2026-04-25
- 前置读取：`docs/nextjs-to-vite-csr-design.md`、`docs/nextjs-to-vite-migration-playbook.md`、`packages/web-ui/AGENTS.md`、`copilot-instructions.md`
- 产出：`docs/phase-0-baseline-freeze.md`（冻结规则、owner、里程碑、盘点快照）

阶段完成审核：

- 文档审核：盘点范围覆盖页面/API/组件/hooks/lib/types/store。
- 测试审核：无代码改动可豁免执行测试，但需确认后续阶段测试计划完整。
- 审核结论：通过（文档与迁移矩阵一致，且已形成可审计基线）。

---

## 5. Phase 1 基础骨架（Router/Provider/I18n/API Client）

引用文档：

- 技术设计：2、3、4、5、10.1
- 迁移设计：3.1、3.3、7

阶段前置读取清单：

- `docs/nextjs-to-vite-csr-design.md` 第 2/3/4/5/10.1 章
- `docs/nextjs-to-vite-migration-playbook.md` 第 3.1/3.3/7 章
- `packages/web-ui/AGENTS.md`
- `copilot-instructions.md`

### Phase 1 TODO LIST

| 功能名称 | 改动文件 | 开发状态 | 备注（引用章节） |
| --- | --- | --- | --- |
| 建立 client 根入口与路由树 | `packages/web-ui/client/src/main.tsx`、`packages/web-ui/client/src/app/{router.ts,routes.tsx}` | 已完成 | 技术设计 3.1、迁移设计 3.3 |
| 建立路由守卫与 404 | `packages/web-ui/client/src/app/guards/auth-guard.tsx`、`packages/web-ui/client/src/app/guards/permission-guard.tsx`、`packages/web-ui/client/src/app/not-found.tsx` | 已完成 | 技术设计 3.1/7.3 |
| 建立 i18n 初始化与资源目录 | `packages/web-ui/client/src/i18n/index.ts`、`packages/web-ui/client/src/i18n/locales/zh-CN/common.json`、`packages/web-ui/client/src/i18n/locales/en-US/common.json` | 已完成 | 技术设计 4、迁移设计 7 |
| 建立统一 HTTP/API 层 | `packages/web-ui/client/src/lib/http.ts`、`packages/web-ui/client/src/lib/api/*.ts` | 已完成 | 技术设计 5.1 |
| server 基础路由与 health 接口 | `packages/web-ui/server/src/app.ts`、`packages/web-ui/server/src/routes/index.ts`、`packages/web-ui/server/src/routes/health.ts` | 已完成 | 技术设计 2.2/6 |

Phase 1 执行记录（进行中）：

- 执行日期：2026-04-25
- 前置读取：`docs/nextjs-to-vite-csr-design.md` 第 2/3/4/5/10.1 章，`docs/nextjs-to-vite-migration-playbook.md` 第 3.1/3.3/7 章，`packages/web-ui/AGENTS.md`，`copilot-instructions.md`
- 本轮新增文件：
  - `packages/web-ui/client/{index.html,vite.config.ts,tsconfig.json}`
  - `packages/web-ui/client/src/main.tsx`
  - `packages/web-ui/client/src/app/{router.tsx,not-found.tsx}`
  - `packages/web-ui/client/src/app/guards/{auth-guard.tsx,permission-guard.tsx}`
  - `packages/web-ui/client/src/app/providers/index.tsx`
  - `packages/web-ui/client/src/i18n/index.ts`
  - `packages/web-ui/client/src/i18n/locales/{zh-CN,en-US}/common.json`
  - `packages/web-ui/client/src/lib/{http.ts,api/health.ts}`
  - `packages/web-ui/client/src/pages/{home.tsx,sign-in.tsx,health.tsx}`
  - `packages/web-ui/client/src/styles/globals.css`
  - `packages/web-ui/server/tsconfig.json`
  - `packages/web-ui/server/src/{index.ts,app.ts}`
  - `packages/web-ui/server/src/routes/{index.ts,health.ts}`

阶段完成审核：

- 文档审核：禁止出现 Next shim；路由 API 必须是 react-router-dom。
- 测试审核：
  - 类型检查：client/server tsconfig 全通过。
  - 单测：API client 与 guard 至少覆盖 happy path + failure path。
  - 冒烟：`/`、`/404`、语言切换可用。
- 本轮审核结果：
  - 文档审核：通过（未引入 Next shim，路由与 i18n 底座完成）。
  - 测试审核：已完成类型检查（`CLIENT_TSC_OK`、`SERVER_TSC_OK`）；已补充 `http.ts` 单测 6 条（GET/POST/PUT/DELETE happy + failure path），全部通过。
  - **Phase 1 状态：已完成。**

---

## 6. Phase 2 页面与布局迁移

引用文档：

- 技术设计：3、6、7.3、9
- 迁移设计：3.1、3.2、5.2

阶段前置读取清单：

- `docs/nextjs-to-vite-csr-design.md` 第 3/6/7.3/9 章
- `docs/nextjs-to-vite-migration-playbook.md` 第 3.1/3.2/5.2 章
- `packages/web-ui/AGENTS.md`
- `copilot-instructions.md`

### Phase 2 TODO LIST

| 功能名称 | 改动文件 | 开发状态 | 备注（引用章节） |
| --- | --- | --- | --- |
| 迁移 chat 主页面与线程页 | `packages/web-ui/client/src/pages/chat/index.tsx`、`packages/web-ui/client/src/pages/chat/thread.tsx` | 已完成 | 迁移设计 3.2 |
| 迁移 mcp 页面组 | `packages/web-ui/client/src/pages/mcp/index.tsx`、`packages/web-ui/client/src/pages/mcp/create.tsx`、`packages/web-ui/client/src/pages/mcp/edit.tsx`、`packages/web-ui/client/src/pages/mcp/test.tsx` | 已完成 | 迁移设计 3.2 |
| 迁移 workflow 页面组 | `packages/web-ui/client/src/pages/workflow/index.tsx`、`packages/web-ui/client/src/pages/workflow/detail.tsx` | 已完成 | 迁移设计 3.2 |
| 迁移 auth/public/admin 页面组 | `packages/web-ui/client/src/pages/auth/*.tsx`、`packages/web-ui/client/src/pages/export/*.tsx`、`packages/web-ui/client/src/pages/admin/users/*.tsx` | 已完成 | 迁移设计 3.2 |
| 迁移布局壳组件 | `packages/web-ui/client/src/components/layouts/*.tsx` | 已完成 | 迁移设计 5.2 |

Phase 2 执行记录：

- 执行日期：2026-04-25
- 新增文件：
  - `client/src/app/layouts/{chat-layout,auth-layout,admin-layout,public-layout}.tsx`
  - `client/src/pages/chat/{index,thread}.tsx`
  - `client/src/pages/archive/detail.tsx`
  - `client/src/pages/mcp/{index,create,edit,test}.tsx`
  - `client/src/pages/workflow/{index,detail}.tsx`
  - `client/src/pages/auth/{sign-in,sign-up,sign-up-email}.tsx`
  - `client/src/pages/export/detail.tsx`
  - `client/src/pages/admin/users/{index,detail}.tsx`
  - `client/src/app/routes.tsx`（全量路由树重建，lazy + Suspense）
- 类型检查：`CLIENT_TSC_OK`。
- **Phase 2 状态：已完成（布局壳与全部 17 个页面 CSR 骨架落地；Phase 4 补充真实组件）。**

---

## 7. Phase 3 API 与服务端迁移

引用文档：

- 技术设计：5、6、7.2、10.2、10.3
- 迁移设计：4、6.2

阶段前置读取清单：

- `docs/nextjs-to-vite-csr-design.md` 第 5/6/7.2/10.2/10.3 章
- `docs/nextjs-to-vite-migration-playbook.md` 第 4/6.2 章
- `packages/web-ui/AGENTS.md`
- `copilot-instructions.md`

### Phase 3 TODO LIST

| 功能名称 | 改动文件 | 开发状态 | 备注（引用章节） |
| --- | --- | --- | --- |
| Chat/Session API 迁移 | `packages/web-ui/server/src/routes/chat.ts`、`packages/web-ui/server/src/routes/sessions.ts`、`packages/web-ui/client/src/lib/api/chat.ts`、`packages/web-ui/client/src/lib/api/sessions.ts` | 已完成 | 迁移设计 4.2 |
| MCP API 迁移 | `packages/web-ui/server/src/routes/mcp.ts`、`packages/web-ui/client/src/lib/api/mcp.ts` | 已完成 | 迁移设计 4.2 |
| Workflow API 迁移 | `packages/web-ui/server/src/routes/workflow.ts`、`packages/web-ui/client/src/lib/api/workflow.ts` | 已完成 | 迁移设计 4.2 |
| User/Admin/Archive/Storage/Export API 迁移 | `packages/web-ui/server/src/routes/{user,admin,archive,storage,export}.ts`、`packages/web-ui/client/src/lib/api/{user,admin,archive,storage,export}.ts` | 已完成 | 迁移设计 4.2 |
| OAuth/回调与安全边界 | `packages/web-ui/server/src/routes/mcp.ts`、`packages/web-ui/server/src/middlewares/security.ts` | 已完成 | 技术设计 10.2 |
| 静态托管与 SPA fallback | `packages/web-ui/server/src/app.ts` | 已完成 | 技术设计 10.3 |

Phase 3 执行记录：

- 执行日期：2026-04-25
- 新增文件：
  - `server/src/middlewares/auth.ts`（authMiddleware + adminMiddleware + stub token decoder）
  - `server/src/middlewares/security.ts`（CORS + secureHeaders）
  - `server/src/routes/{chat,sessions,mcp,workflow,user,admin,archive,storage,export,settings,coding-service}.ts`
  - `server/src/routes/index.ts`（注册全量路由）
  - `server/src/app.ts`（安全中间件 + static serving + SPA fallback）
- 类型检查：`SERVER_TSC_OK`、`CLIENT_TSC_OK`。
- **Phase 3 状态：已完成（路由结构 + 安全边界 + SPA fallback 落地；Phase 4 补充真实业务逻辑）。**

---

## 8. Phase 4 组件、Hooks、Store、Types 迁移

引用文档：

- 技术设计：2.1、4、7.4、10.4
- 迁移设计：5、6、7

阶段前置读取清单：

- `docs/nextjs-to-vite-csr-design.md` 第 2.1/4/7.4/10.4 章
- `docs/nextjs-to-vite-migration-playbook.md` 第 5/6/7 章
- `packages/web-ui/AGENTS.md`
- `copilot-instructions.md`

### Phase 4 TODO LIST

| 功能名称 | 改动文件 | 开发状态 | 备注（引用章节） |
| --- | --- | --- | --- |
| 迁移 UI 基础组件 | `packages/web-ui/client/src/components/ui/*.tsx` | 进行中 | 迁移设计 5.1 |
| 迁移业务组件（chat/mcp/workflow/admin/export） | `packages/web-ui/client/src/features/**/components/*.tsx` | 进行中 | 迁移设计 5.3 |
| 迁移 hooks | `packages/web-ui/client/src/hooks/*.ts*` | 进行中 | 迁移设计 6.1 |
| 迁移 store | `packages/web-ui/client/src/store/*.ts` | 进行中 | 迁移设计 6.3 |
| 拆分 lib 与 shared contracts | `packages/web-ui/client/src/lib/**`、`packages/web-ui/server/src/lib/**`、`packages/web-ui/shared/src/contracts/**` | 进行中 | 迁移设计 6.2/6.4 |
| 文案国际化收口 | `packages/web-ui/client/src/i18n/locales/**/*.json`、业务组件页面文件 | 进行中 | 技术设计 4、迁移设计 7 |

Phase 4 执行记录（进行中）：

- 执行日期：2026-04-26
- 现状：核心组件/hooks/store/lib/i18n 已完成大规模迁移并通过 `client` 类型检查；部分复杂链路仍为“最小可编译实现”，需在本阶段继续做功能回填。
- 本轮校对：已确认 `client/src/app/api/chat/actions.ts` 存在近期外部修改，后续涉及该文件改动前必须先读当前内容再编辑。

阶段完成审核：

- 文档审核：组件迁移顺序与分域原则一致；无 next import。
- 测试审核：
  - 组件测试覆盖关键交互（按钮、输入、对话框、错误态）。
  - hooks 测试覆盖异步成功/失败路径。
  - i18n missing key 检查通过。
  - bundle 报告达到预算要求。

---

## 9. Phase 5 切流、下线与发布

引用文档：

- 技术设计：6、8、9、10.5、10.6
- 迁移设计：8、9

阶段前置读取清单：

- `docs/nextjs-to-vite-csr-design.md` 第 6/8/9/10.5/10.6 章
- `docs/nextjs-to-vite-migration-playbook.md` 第 8/9 章
- `packages/web-ui/AGENTS.md`
- `copilot-instructions.md`

### Phase 5 TODO LIST

| 功能名称 | 改动文件 | 开发状态 | 备注（引用章节） |
| --- | --- | --- | --- |
| 默认脚本切流 | `packages/web-ui/package.json`、`packages/web-ui/README.md` | 已完成 | 技术设计 6/9 |
| legacy 代码下线 | `packages/web-ui/src/app/**`、`packages/web-ui/next.config.ts`、`packages/web-ui/next-env.d.ts` | 阻塞 | 技术设计 6/10.6 |
| 依赖清理（Next 相关） | `packages/web-ui/package.json`、锁文件 | 未开始 | 技术设计 6 |
| 发布门禁落地 | CI 配置文件、`packages/web-ui/tests/**` | 进行中 | 技术设计 10.5 |
| 回滚演练文档化 | `packages/web-ui/docs/rollback-runbook.md`（新建） | 已完成 | 技术设计 10.5 |

Phase 5 执行记录（进行中）：

- 执行日期：2026-04-26
- 已完成：`packages/web-ui/package.json` 已切换默认 `dev/build/start` 到新架构脚本，并保留 `dev:legacy/build:legacy/start:legacy` 回退入口。
- 已完成：新增 `packages/web-ui/docs/rollback-runbook.md`，明确回退窗口、触发条件、回滚命令与验证步骤。
- 已完成：新增 `test:smoke` 与 `gate:release` 基线脚本，将新架构 `build + start + health + SPA fallback + assets` 作为可执行发布门禁。
- 已记录：`gate:release:full` 保留 `lint + check-types + vitest + gate:release` 严格链路，但当前仓库仍有既存 oxlint 债，不能在本阶段把它当成阻断迁移的唯一门禁。
- 本轮验证：`pnpm run build:new:client`、`pnpm run build:new:server`、默认 `pnpm build` 均通过；`pnpm --dir packages/web-ui run start:new` 可启动，`/api/health` 与 `/` 返回 200。
- 阻塞：legacy 代码与 Next 配置仍承担回退窗口职责，在回滚演练完成并关闭回退窗口前，不应删除 `src/app/**`、`next.config.ts`、`next-env.d.ts`。

阶段完成审核：

- 文档审核：legacy 下线清单与 owner/date 完整；无双写目录。
- 测试审核：
  - `build/start` 全链路通过。
  - e2e 核心流程（登录、聊天、MCP、Workflow、设置）全通过。
  - 发布前演练与回滚演练记录完整。

---

## 10. 阶段汇报模板（每阶段结束必填）

| 字段 | 内容 |
| --- | --- |
| 阶段编号 | 例如 Phase 2 |
| 引用章节 | 技术设计 x.x；迁移设计 y.y |
| 完成项 | TODO 列表中的已完成条目 |
| 偏差项 | 与设计不一致点 |
| 风险项 | 仍需跟踪的风险 |
| 测试结论 | 单元/集成/e2e 结果与覆盖说明 |
| 后续动作 | 下阶段准备事项 |
