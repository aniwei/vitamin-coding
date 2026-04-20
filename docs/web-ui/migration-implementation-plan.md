# web-ui 迁移实施计划

## 阶段 0：准备与依赖整顿

- [ ] 新建 `client/`、`server/` 目录骨架
- [ ] `package.json` 移除：`next`、`next-intl`、`@vercel/blob`、`eslint-config-next`、`cross-env`、`server-only`
- [ ] `package.json` 新增：`react-router-dom`、`hono`、`@hono/node-server`、`i18next`、`react-i18next`、`i18next-http-backend`、`i18next-browser-languagedetector`、`@fontsource-variable/geist`、`@fontsource-variable/geist-mono`、`concurrently`、`@vitejs/plugin-react`
- [ ] 保留 `next-themes` 及相关主题组件
- [ ] `messages/` 迁移到 `client/public/locales/`，结构不变
- [ ] 新建 `client/vite.config.ts`、`server/tsdown.config.ts`、`server/tsconfig.json`
- [ ] 新建 `client/src/main.tsx`、`client/src/router.tsx`、`client/src/i18n/index.ts`
- [ ] 新建 `server/src/index.ts`、`server/src/app.ts`、`server/src/bootstrap.ts`
- [ ] 新建 `server/src/auth/`、`db/`、`services/`、`middleware/`、`routes/` 目录

## 阶段 1：Server 路由与服务迁移

- [ ] 逐个迁移 `src/app/api/**/route.ts` 到 `server/src/routes/`，按业务域拆分模块
- [ ] `'use server'` action 文件全部转为 REST endpoint
- [ ] `better-auth/next-js` 替换为 Web handler
- [ ] `src/proxy.ts` 逻辑迁移为 Hono 中间件
- [ ] `instrumentation.ts` 逻辑迁移为 `bootstrap.ts`
- [ ] Playwright API 测试用例全部跑通

## 阶段 2：Client 路由与页面迁移

- [ ] 按路由树集中定义 `client/src/router.tsx`，所有页面组件迁移到 `client/src/routes/`
- [ ] `next/navigation`、`next/link`、`next/form`、`next/dynamic`、`next/font`、`next-intl` 全部替换为 react-router/i18next/原生方案
- [ ] 所有 loader、action、守卫逻辑迁移到 react-router loader/action/guard
- [ ] 主题组件、i18n 初始化、Toaster、SWR、zustand 等全局 provider 迁移到 `main.tsx`
- [ ] 页面级 Playwright 用例全部跑通

## 阶段 3：清理与收尾

- [ ] 删除 `src/app/`、`next.config.ts`、`proxy.ts`、`instrumentation.ts`、`next-env.d.ts`、`.next/`
- [ ] 更新 `README.md`、`AGENTS.md`、`Dockerfile`、`tsconfig.json`、`.vscode/settings.json`
- [ ] `pnpm lint`、`pnpm build`、`pnpm start`、`pnpm test` 全部通过
- [ ] `rg "from 'next['/]" packages/web-ui` 结果为 0（排除 next-themes）
- [ ] `rg "next-intl|@vercel/blob|'use server'|next/form|next/link|next/navigation|next/dynamic|next/font" packages/web-ui` 结果为 0
- [ ] Docker 镜像构建与部署验证

## 阶段 4：风险复盘与优化

- [ ] 聚合 loader 性能优化（Promise.all、defer/Await）
- [ ] i18n 替换后多语言完整性校验
- [ ] better-auth 登录态全流程回归
- [ ] 生产环境流式/SSE/WS 代理验证
- [ ] 业务 owner 验收

---

## 里程碑与分工建议

- 阶段 0/1 可由架构/infra owner 主导，阶段 2/3 由业务 owner/前端 owner 主导
- 每阶段结束后，Playwright + vitest + lint + build 全量跑一遍
- 迁移期间建议 freeze 业务新功能，优先保证迁移主线

---

## 进度追踪建议

- 每阶段拆分为 5-10 个小任务，PR 粒度控制在 500-1000 行
- 每日 standup 汇报迁移进度与阻塞点
- 关键节点（API 路由迁移、i18n 替换、client 路由切换、全量清理）设专人 review
