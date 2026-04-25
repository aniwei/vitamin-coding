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
| 冻结 legacy 变更窗口 | `packages/web-ui/README.md`、`packages/web-ui/docs/*.md` | 未开始 | 技术设计 6/10.6 |
| 生成页面/API/组件盘点清单 | `packages/web-ui/docs/nextjs-to-vite-migration-playbook.md` | 未开始 | 迁移设计 3/4/5 |
| 标注迁移 owner 与截止日期 | `packages/web-ui/docs/nextjs-to-vite-implementation-plan.md` | 未开始 | 技术设计 10.6 |

阶段完成审核：

- 文档审核：盘点范围覆盖页面/API/组件/hooks/lib/types/store。
- 测试审核：无代码改动可豁免执行测试，但需确认后续阶段测试计划完整。

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
| 建立 client 根入口与路由树 | `packages/web-ui/client/src/main.tsx`、`packages/web-ui/client/src/app/router.tsx` | 未开始 | 技术设计 3.1、迁移设计 3.3 |
| 建立路由守卫与 404 | `packages/web-ui/client/src/app/guards/auth-guard.tsx`、`packages/web-ui/client/src/app/guards/permission-guard.tsx`、`packages/web-ui/client/src/app/not-found.tsx` | 未开始 | 技术设计 3.1/7.3 |
| 建立 i18n 初始化与资源目录 | `packages/web-ui/client/src/i18n/index.ts`、`packages/web-ui/client/src/i18n/locales/zh-CN/common.json`、`packages/web-ui/client/src/i18n/locales/en-US/common.json` | 未开始 | 技术设计 4、迁移设计 7 |
| 建立统一 HTTP/API 层 | `packages/web-ui/client/src/lib/http.ts`、`packages/web-ui/client/src/lib/api/*.ts` | 未开始 | 技术设计 5.1 |
| server 基础路由与 health 接口 | `packages/web-ui/server/src/app.ts`、`packages/web-ui/server/src/routes/index.ts`、`packages/web-ui/server/src/routes/health.ts` | 未开始 | 技术设计 2.2/6 |

阶段完成审核：

- 文档审核：禁止出现 Next shim；路由 API 必须是 react-router-dom。
- 测试审核：
  - 类型检查：client/server tsconfig 全通过。
  - 单测：API client 与 guard 至少覆盖 happy path + failure path。
  - 冒烟：`/`、`/404`、语言切换可用。

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
| 迁移 chat 主页面与线程页 | `packages/web-ui/client/src/pages/chat/index.tsx`、`packages/web-ui/client/src/pages/chat/thread.tsx` | 未开始 | 迁移设计 3.2 |
| 迁移 mcp 页面组 | `packages/web-ui/client/src/pages/mcp/index.tsx`、`packages/web-ui/client/src/pages/mcp/create.tsx`、`packages/web-ui/client/src/pages/mcp/edit.tsx`、`packages/web-ui/client/src/pages/mcp/test.tsx` | 未开始 | 迁移设计 3.2 |
| 迁移 workflow 页面组 | `packages/web-ui/client/src/pages/workflow/index.tsx`、`packages/web-ui/client/src/pages/workflow/detail.tsx` | 未开始 | 迁移设计 3.2 |
| 迁移 auth/public/admin 页面组 | `packages/web-ui/client/src/pages/auth/*.tsx`、`packages/web-ui/client/src/pages/export/*.tsx`、`packages/web-ui/client/src/pages/admin/users/*.tsx` | 未开始 | 迁移设计 3.2 |
| 迁移布局壳组件 | `packages/web-ui/client/src/components/layouts/*.tsx` | 未开始 | 迁移设计 5.2 |

阶段完成审核：

- 文档审核：页面路由与映射表一致；无 next/router import。
- 测试审核：
  - 页面路由 e2e 冒烟（chat/mcp/workflow/auth/export/admin）。
  - 每个页面至少 1 条异常态验证（无权限/404/请求失败）。

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
| Chat/Session API 迁移 | `packages/web-ui/server/src/routes/chat.ts`、`packages/web-ui/server/src/routes/sessions.ts`、`packages/web-ui/client/src/lib/api/chat.ts`、`packages/web-ui/client/src/lib/api/sessions.ts` | 未开始 | 迁移设计 4.2 |
| MCP API 迁移 | `packages/web-ui/server/src/routes/mcp.ts`、`packages/web-ui/client/src/lib/api/mcp.ts` | 未开始 | 迁移设计 4.2 |
| Workflow API 迁移 | `packages/web-ui/server/src/routes/workflow.ts`、`packages/web-ui/client/src/lib/api/workflow.ts` | 未开始 | 迁移设计 4.2 |
| User/Admin/Archive/Storage/Export API 迁移 | `packages/web-ui/server/src/routes/{user,admin,archive,storage,export}.ts`、`packages/web-ui/client/src/lib/api/{user,admin,archive,storage,export}.ts` | 未开始 | 迁移设计 4.2 |
| OAuth/回调与安全边界 | `packages/web-ui/server/src/routes/mcp.ts`、`packages/web-ui/server/src/middlewares/security.ts` | 未开始 | 技术设计 10.2 |
| 静态托管与 SPA fallback | `packages/web-ui/server/src/app.ts` | 未开始 | 技术设计 10.3 |

阶段完成审核：

- 文档审核：接口 envelope 与边界一致；client 不直连 server 内部模块。
- 测试审核：
  - API 集成测试覆盖 CRUD + failure path。
  - CORS/未认证访问策略测试。
  - `GET /`、`GET /assets/*`、`GET /api/health` 全部 200。

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
| 迁移 UI 基础组件 | `packages/web-ui/client/src/components/ui/*.tsx` | 未开始 | 迁移设计 5.1 |
| 迁移业务组件（chat/mcp/workflow/admin/export） | `packages/web-ui/client/src/features/**/components/*.tsx` | 未开始 | 迁移设计 5.3 |
| 迁移 hooks | `packages/web-ui/client/src/hooks/*.ts*` | 未开始 | 迁移设计 6.1 |
| 迁移 store | `packages/web-ui/client/src/store/*.ts` | 未开始 | 迁移设计 6.3 |
| 拆分 lib 与 shared contracts | `packages/web-ui/client/src/lib/**`、`packages/web-ui/server/src/lib/**`、`packages/web-ui/shared/src/contracts/**` | 未开始 | 迁移设计 6.2/6.4 |
| 文案国际化收口 | `packages/web-ui/client/src/i18n/locales/**/*.json`、业务组件页面文件 | 未开始 | 技术设计 4、迁移设计 7 |

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
| 默认脚本切流 | `packages/web-ui/package.json`、`packages/web-ui/README.md` | 未开始 | 技术设计 6/9 |
| legacy 代码下线 | `packages/web-ui/src/app/**`、`packages/web-ui/next.config.ts`、`packages/web-ui/next-env.d.ts` | 未开始 | 技术设计 6/10.6 |
| 依赖清理（Next 相关） | `packages/web-ui/package.json`、锁文件 | 未开始 | 技术设计 6 |
| 发布门禁落地 | CI 配置文件、`packages/web-ui/tests/**` | 未开始 | 技术设计 10.5 |
| 回滚演练文档化 | `packages/web-ui/docs/rollback-runbook.md`（新建） | 未开始 | 技术设计 10.5 |

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
