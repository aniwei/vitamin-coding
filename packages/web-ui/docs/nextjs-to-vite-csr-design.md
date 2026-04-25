# Web UI Next.js -> Vite 技术设计

## 1. 背景与目标

当前 `packages/web-ui` 同时存在 legacy Next.js 代码（`src/`）与新架构脚本入口（`client/` + `server/`）。本设计目标是将 Web UI 彻底切换为 Vite + CSR 模式，并完成前后端职责分离。

目标要求：

- 前端：Vite + React + react-router-dom。
- 后端：Hono 提供 `/api/*` 与静态托管。
- 国际化：react-i18next。
- 禁止为兼容 Next API 实现 shim（例如 `useRouter` 兼容封装）。
- 页面代码按 client side render 思想重写，不依赖 Next runtime 语义。

非目标：

- 不在迁移过程中保留 Next 特有能力（Server Actions、App Router middleware、Route Handlers）到新架构。
- 不通过 polyfill/shim 保持旧 API 调用习惯。

## 2. 目标架构

### 2.1 目录分层

建议结构如下：

- `packages/web-ui/client/`: 纯前端 SPA。
- `packages/web-ui/server/`: 纯后端 API + 静态资源托管。
- `packages/web-ui/src/`: legacy Next.js 代码，仅过渡期保留。
- `packages/web-ui/shared/`（可选）: 前后端共享 DTO、类型与错误码。

### 2.2 运行职责

Client 负责：

- 路由渲染与页面状态。
- 发起 API 请求、缓存与重试。
- i18n 语言检测和切换。

Server 负责：

- 统一 API 网关（`/api/*`）。
- 认证与业务编排。
- 生产环境静态托管（`dist/client`）与 SPA fallback。

### 2.3 关键约束

- Client 禁止引入 `next/*`。
- 禁止构建 Next 兼容层：
  - 禁止 `useRouter` 包装器。
  - 禁止 `next/dynamic` 等价替代包装器。
  - 禁止保留 Next 目录语义作为运行时依赖。
- 统一使用浏览器原生 CSR 机制和 React 生态能力。

## 3. 路由设计（react-router-dom）

### 3.1 路由模式

- 采用 `createBrowserRouter` + `RouterProvider`。
- 使用布局路由（layout route）组织页面分组。
- 动态参数用 `:id`、`:thread`。
- 使用 `path: "*"` 处理 404。

### 3.2 路由映射原则

将 legacy `src/app` 中 page 路径映射到 client 路径：

- `(chat)/page.tsx` -> `/`
- `(chat)/chat/[thread]/page.tsx` -> `/chat/:thread`
- `(chat)/mcp/page.tsx` -> `/mcp`
- `(chat)/mcp/create/page.tsx` -> `/mcp/create`
- `(chat)/workflow/page.tsx` -> `/workflow`
- `(chat)/workflow/[id]/page.tsx` -> `/workflow/:id`
- `(auth)/sign-in/page.tsx` -> `/sign-in`
- `(auth)/sign-up/page.tsx` -> `/sign-up`
- `(public)/export/[id]/page.tsx` -> `/export/:id`

### 3.3 导航编码规范

- 页面跳转：`useNavigate`。
- 读取路径：`useLocation`。
- 查询参数：`useSearchParams`。
- 禁用：`next/navigation`、`next/router`、`next/link`。

## 4. 国际化设计（react-i18next）

### 4.1 初始化

基础依赖：

- `i18next`
- `react-i18next`
- `i18next-browser-languagedetector`

入口初始化示例能力：

- 默认语言：`zh-CN`。
- 回退语言：`en-US`。
- 资源按命名空间加载：`common`、`chat`、`mcp`、`workflow`、`settings`、`auth`。

### 4.2 资源结构

- `client/src/i18n/locales/zh-CN/*.json`
- `client/src/i18n/locales/en-US/*.json`

键名规范：

- 使用层级式命名，如 `mcp.form.name.label`。
- 禁止业务页面硬编码可见文案。

### 4.3 使用规范

- 组件统一使用 `useTranslation()`。
- toast/error/empty-state 文案统一国际化。
- CI 增加 missing key 检查。

## 5. API 与前后端契约

### 5.1 API 边界

- Client 仅通过 `/api/*` 与 Server 通信。
- 不允许 Client 直接 import Server 运行时代码。
- 请求统一走 `client/src/lib/http.ts`。

### 5.2 响应标准

统一 envelope：

- 成功：`{ success: true, data, meta? }`
- 失败：`{ success: false, error: { code, message, details? } }`

### 5.3 共享契约

- 推荐 `shared` 维护 DTO 与错误码。
- 可选使用 zod 在 server 进行入参/出参校验，client 进行关键响应窄化。

## 6. 迁移执行计划

### Phase 0: 基线冻结

- 冻结 legacy 主干能力。
- 记录回滚点（tag 或 commit）。
- 补齐关键流程 smoke/e2e 基线。

### Phase 1: 基础骨架

- 建立 client 主入口、路由树、providers、i18n 初始化。
- 建立 server API 骨架与 health 接口。
- 打通本地开发联调。

### Phase 2: 页面迁移

- 以页面壳为单位迁移（先路由壳，后数据逻辑）。
- 每迁移一页即删除其 Next 依赖。
- 禁止新增 shim 过渡层。

### Phase 3: 功能域迁移

按域分批：

- Chat
- MCP
- Workflow
- Settings
- Auth
- Export/Admin

每批完成后执行类型检查 + 回归。

### Phase 4: 切流

- 默认脚本切到 `dev:new/build:new/start:new`。
- server 承担静态托管与 SPA fallback。
- 验证 `/`、`/assets/*`、`/api/health` 均可访问。

### Phase 5: 清理

- 移除 legacy Next runtime 依赖：`next`、`next.config.*`、`next-env.d.ts`、`src/app/api/*` 等。
- 删除已迁移页面在 legacy 树中的重复实现。

## 7. 审核清单（防遗漏）

### 7.1 构建与运行

- [ ] `pnpm --filter @vitamin/web-ui build` 通过。
- [ ] `pnpm --filter @vitamin/web-ui start` 后 `/` 返回 200。
- [ ] `/assets/*` 返回 200。
- [ ] `/api/health` 返回 200。

### 7.2 代码约束

- [ ] 新 client 代码无 `next/*` import。
- [ ] 无 router shim（`useRouter` 适配器等）。
- [ ] 无 Server Actions 残留调用。
- [ ] API 调用统一从 `client/src/lib/http.ts` 发起。

### 7.3 路由与状态

- [ ] 动态路由参数映射完整（thread/id 等）。
- [ ] 404、鉴权失败、无权限页面具备明确路由行为。
- [ ] 刷新深链路径可通过 server fallback 正常进入 SPA。

### 7.4 国际化

- [ ] 页面文案完成 i18n 替换。
- [ ] 组件内默认文案、错误提示、空态提示已国际化。
- [ ] 语言切换与持久化可用。
- [ ] missing key 有 CI 防线。

### 7.5 可观测与质量

- [ ] 错误日志包含请求路径和错误码。
- [ ] 关键 API 有集成测试。
- [ ] 关键页面具备 e2e 冒烟。

## 8. 风险与缓解

- 风险：迁移期间双栈并存导致维护负担增加。
  - 缓解：限定并存窗口，按功能域完成即从 legacy 移除。
- 风险：路由重写造成历史链接失效。
  - 缓解：配置 client 路由重定向策略与 server fallback。
- 风险：i18n 回归遗漏。
  - 缓解：增加 missing key 检查和双语冒烟用例。

## 9. 验收标准（DoD）

- 新架构可独立开发、构建、部署。
- 核心流程（登录、聊天、MCP、Workflow、设置）功能等价可用。
- 构建产物和运行路径不依赖 Next runtime。
- 技术债仅剩可追踪条目，且均有截止时间。

## 10. 二次审查补遗（本轮新增）

以下内容为本轮审核发现的高优先级遗漏项，需纳入实施范围。

### 10.1 环境变量与配置分层

- 约束：Client 仅允许读取 `VITE_*` 变量，禁止读取服务端密钥。
- 约束：Server 独占敏感配置（模型密钥、数据库凭据、签名密钥）。
- 落地：新增配置文档，列出迁移前后变量映射与弃用时间。

建议校验项：

- [ ] CI 检查 client 代码中是否使用非 `VITE_*` 的 `process.env`。
- [ ] `.env.example` 包含 client/server 两侧最小必需配置。

### 10.2 安全边界

- 明确 CORS 策略：仅允许受信任来源访问 `/api/*`。
- 明确认证态传递方式（cookie 或 token）及失效处理。
- 对写操作 API 增加 CSRF/同源策略说明（按当前认证方案选择）。

建议校验项：

- [ ] 非同源来源无法调用受保护 API。
- [ ] 未认证请求在 client 侧有统一跳转/提示行为。

### 10.3 构建产物与部署约定

- server 运行必须依赖 `server/src` 编译产物，不依赖手工维护的 `server/dist`。
- 定义单一发布物：`dist/client + server/dist`。
- 明确静态资源缓存策略：`/assets/*` 长缓存，`index.html` 短缓存。

建议校验项：

- [ ] 构建产物可在空目录环境直接启动。
- [ ] 启动后刷新任意深链路径均能落入 SPA。

### 10.4 性能与包体积预算

- 设定首屏 JS 预算与告警阈值（例如 gzip 后体积阈值）。
- 路由级别懒加载：业务大页面按路由拆包。
- 重型依赖（编辑器、图表、mermaid）按需加载。

建议校验项：

- [ ] 关键路由均启用懒加载。
- [ ] CI 输出 bundle 报告并设置超阈值告警。

### 10.5 测试门禁与发布策略

- 定义发布前最小门禁：lint + typecheck + unit + e2e smoke。
- 定义灰度/回滚策略：保留 legacy 可回退窗口与截止日期。
- 定义故障处置：当 `/api` 正常但 SPA 异常时的快速回退步骤。

建议校验项：

- [ ] 发布流水线包含上述门禁并阻断失败发布。
- [ ] 回滚演练至少执行一次并留存记录。

### 10.6 遗留代码下线判定

- 设立下线标准：某功能域迁移完成并稳定后，删除对应 legacy 页面和 API。
- 防止双写：禁止新功能同时落在 `src/`（legacy）与 `client/`。
- 增加仓库规则：新前端功能只允许提交到 `client/`。

建议校验项：

- [ ] legacy 路由清单存在 owner 和下线目标日期。
- [ ] 新增功能 PR 不再触达 `src/app`。

## 11. 文档体系与遗漏审查结论

### 11.1 文档体系

- 总纲（本文件）：`docs/nextjs-to-vite-csr-design.md`
- 详细迁移设计：`docs/nextjs-to-vite-migration-playbook.md`
- 实施文档（阶段 TODO）：`docs/nextjs-to-vite-implementation-plan.md`

### 11.2 本轮遗漏审查结论

以下历史缺口已被文档补齐并可执行：

- 已补齐：模块/页面/API/组件级迁移矩阵与目标落点。
- 已补齐：分阶段 TODO 模型（功能名称、改动文件、开发状态、备注）。
- 已补齐：每阶段“前置读取引用文档与代码规范”要求。
- 已补齐：每阶段“开发完成后文档审核 + 测试用例审核”要求。

### 11.3 仍需在实施阶段验证的事项

- 构建与发布流水线是否按门禁阻断失败发布。
- 各阶段测试覆盖是否达到最小要求（happy path + failure path）。
- 迁移结束后是否实现 legacy 目录清理与依赖下线。
