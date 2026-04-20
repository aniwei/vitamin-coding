# web-ui 迁移技术设计文档

> Next.js App Router → Vite + React Router v7 + Hono

## 一、目标

| 目标 | 说明 |
|------|------|
| 前端 | 纯 SPA：Vite 8 + React 19 + react-router-dom v7（Data Router） |
| 后端 | 独立 HTTP 服务：Hono + @hono/node-server |
| 鉴权 | better-auth 通用 Web Fetch handler（去除 next-js 适配层） |
| i18n | i18next + react-i18next（去除 next-intl） |
| 主题 | 保留 next-themes（纯客户端库，无 Next 依赖） |
| 部署 | 单进程（Hono 托管 SPA 静态资源 + API）或分离部署（CDN + API） |

### 非目标

- 不做 SSR/SSG（纯 SPA）
- 不重写业务逻辑，只换容器
- 不引入任何 Next shim / 兼容层

---

## 二、现状评估

### 2.1 代码规模

| 指标 | 数量 |
|------|------|
| `page.tsx`（页面组件） | 18 |
| `layout.tsx`（布局组件） | 7 |
| `loading.tsx`（加载骨架） | 6 |
| `route.ts`（API 路由） | 38 |
| `'use server'` action 文件 | 11 |
| `next/navigation` 导入 | 40 个文件 |
| `next/link` 导入 | 23 个文件 |
| `next/form` 导入 | 7 个文件 |
| `next/dynamic` 导入 | 6 个文件 |
| `next-intl` 导入 | 91 处（客户端 `useTranslations` + 服务端 `getTranslations`） |
| `next-themes` 导入 | 12 个文件 |
| `better-auth/next-js` 导入 | 2 个文件 |
| i18n 语言包 | 7（en/zh/ja/ko/fr/es/no） |

### 2.2 Next 特有能力使用分布

```
next/navigation
├── useRouter         → 16 个文件（客户端组件）
├── redirect          → 12 个文件（服务端组件/layout）
├── notFound          → 5 个文件
├── usePathname       → 3 个文件
├── useSearchParams   → 3 个文件
├── unauthorized      → 3 个文件
└── useParams         → 1 个文件

next/link             → 23 个文件
next/form             → 7 个文件
next/dynamic          → 6 个文件
next/font/google      → 1 个文件（root layout）
next/headers          → 5 个文件（cookies/headers 服务端调用）
next/server           → 18 个文件（NextRequest/NextResponse）
```

### 2.3 路由结构

```
src/app/
├── layout.tsx                          (RootLayout)
├── (auth)/
│   ├── layout.tsx                      (AuthLayout)
│   ├── sign-in/page.tsx
│   └── sign-up/
│       ├── layout.tsx
│       ├── page.tsx
│       └── email/page.tsx
├── (chat)/
│   ├── layout.tsx                      (ChatLayout)
│   ├── page.tsx                        (→ redirect /chat/new)
│   ├── chat/[thread]/page.tsx
│   ├── agent/[id]/page.tsx
│   ├── agents/page.tsx
│   ├── archive/[id]/page.tsx
│   ├── workflow/
│   │   ├── page.tsx                    (→ redirect)
│   │   └── [id]/page.tsx
│   ├── mcp/
│   │   ├── page.tsx
│   │   ├── create/page.tsx
│   │   ├── modify/[id]/page.tsx
│   │   └── test/[id]/page.tsx
│   └── (admin)/
│       ├── layout.tsx                  (AdminLayout)
│       └── admin/users/
│           ├── (list)/page.tsx
│           └── [id]/page.tsx
├── (public)/
│   └── export/[id]/page.tsx
└── api/                                (38 个 route.ts)
    ├── auth/[...all]/route.ts
    ├── chat/route.ts, title/, temporary/, export/, models/, openai-realtime/
    ├── agent/route.ts, [id]/, ai/
    ├── workflow/route.ts, [id]/, [id]/execute/, [id]/structure/, tools/
    ├── mcp/route.ts, [id]/, list/, oauth/, server-customizations/, tool-customizations/
    ├── archive/route.ts, [id]/, [id]/items/, [id]/items/[itemId]/
    ├── export/route.ts, [id]/, [id]/comments/, [id]/comments/[commentId]/
    ├── storage/upload/, ingest/, upload-url/
    ├── user/details/, details/[id]/, preferences/
    ├── bookmark/
    └── thread/
```

---

## 三、目标架构

### 3.1 目录结构

```
packages/web-ui/
├── client/                          # Vite SPA
│   ├── index.html
│   ├── vite.config.ts
│   ├── public/
│   │   ├── locales/                 # i18n JSON（从 messages/ 迁移）
│   │   │   ├── en/
│   │   │   │   └── translation.json
│   │   │   ├── zh/
│   │   │   └── ...
│   │   └── favicon.ico, icons, manifest...
│   └── src/
│       ├── main.tsx                 # 入口
│       ├── router.tsx               # createBrowserRouter
│       ├── routes/                  # 页面组件（从 src/app/ 迁入）
│       │   ├── chat/
│       │   ├── agent/
│       │   ├── workflow/
│       │   ├── mcp/
│       │   ├── admin/
│       │   ├── archive/
│       │   ├── auth/
│       │   ├── export/
│       │   ├── loaders/             # react-router loader
│       │   ├── guards/              # requireAuth / requireAdmin / requireGuest
│       │   └── errors/              # 错误边界组件
│       ├── layouts/                 # RootLayout / ChatLayout / AuthLayout / AdminLayout
│       ├── components/              # 从 src/components/ 原样迁入
│       ├── hooks/                   # 从 src/hooks/ 迁入
│       ├── lib/                     # 仅客户端安全的 lib
│       │   ├── api-client.ts        # 封装 fetch，typed 接口
│       │   ├── auth/client.ts       # better-auth React client（不变）
│       │   └── utils.ts
│       ├── i18n/                    # i18next 初始化
│       │   └── index.ts
│       ├── theme/                   # next-themes wrapper（不变）
│       └── styles/globals.css
├── server/                          # Hono API 服务
│   ├── tsconfig.json
│   ├── tsdown.config.ts
│   ├── drizzle.config.ts
│   └── src/
│       ├── index.ts                 # 启动入口
│       ├── app.ts                   # Hono 实例 + 路由挂载
│       ├── env.ts                   # zod 校验环境变量
│       ├── bootstrap.ts             # DB 迁移 + MCP 初始化（替代 instrumentation.ts）
│       ├── auth/                    # better-auth 实例（Web handler）
│       │   ├── index.ts
│       │   └── roles.ts
│       ├── db/                      # drizzle schema + repositories
│       │   ├── index.ts
│       │   ├── schema/
│       │   └── repositories/
│       ├── services/                # AI / storage / file-ingest / mcp
│       │   ├── ai/
│       │   ├── storage/
│       │   ├── file-ingest/
│       │   └── mcp/
│       ├── middleware/
│       │   ├── require-auth.ts
│       │   ├── require-admin.ts
│       │   └── request-id.ts
│       └── routes/                  # 对应原 app/api/**
│           ├── index.ts             # mountRoutes
│           ├── chat.routes.ts
│           ├── agent.routes.ts
│           ├── workflow.routes.ts
│           ├── mcp.routes.ts
│           ├── archive.routes.ts
│           ├── export.routes.ts
│           ├── storage.routes.ts
│           ├── user.routes.ts
│           ├── admin.routes.ts
│           ├── thread.routes.ts
│           └── bookmark.routes.ts
├── package.json
├── tsconfig.json
└── .oxlintrc.json
```

### 3.2 运行形态

```
┌──────────────────────────────────┐
│           开发模式                │
│                                  │
│  ┌────────────┐ proxy /api/*  ┌────────────┐
│  │ Vite :5173 │─────────────→│ Hono :3001 │
│  │ (SPA HMR)  │              │ (API + DB) │
│  └────────────┘              └────────────┘
│                                  │
│  concurrently 并行启动            │
└──────────────────────────────────┘

┌──────────────────────────────────┐
│           生产模式                │
│                                  │
│  ┌──────────────────────────┐    │
│  │       Hono :3001         │    │
│  │  ┌─────────────────────┐ │    │
│  │  │ serveStatic(client/) │ │    │
│  │  │ SPA fallback         │ │    │
│  │  └─────────────────────┘ │    │
│  │  ┌─────────────────────┐ │    │
│  │  │ /api/* → 业务路由    │ │    │
│  │  └─────────────────────┘ │    │
│  └──────────────────────────┘    │
└──────────────────────────────────┘
```

---

## 四、能力映射

### 4.1 路由映射

| Next App Router | React Router v7 |
|---|---|
| `page.tsx` | router 中的 `element`（`lazy` 或直接导入） |
| `layout.tsx` + `{children}` | 父路由 `element` 中渲染 `<Outlet/>` |
| Route groups `(auth)` `(chat)` `(public)` | 父路由 path='' + element（不参与 URL） |
| `[id]` / `[thread]` | `:id` / `:thread` |
| `[...all]` | `*` |
| `(list)` group | path='' 父路由（纯布局层） |
| `loading.tsx` | `<Suspense fallback={<Loading/>}>`，或单独放 loader pending UI |

#### 集中式路由定义

```tsx
// client/src/router.tsx
export const router = createBrowserRouter([
  {
    path: '/',
    element: <RootLayout />,
    errorElement: <GlobalError />,
    children: [
      // (auth) group
      {
        element: <AuthLayout />,
        children: [
          { path: 'sign-in', lazy: () => import('./routes/auth/sign-in') },
          { path: 'sign-up', lazy: () => import('./routes/auth/sign-up') },
          { path: 'sign-up/email', lazy: () => import('./routes/auth/sign-up-email') },
        ],
      },
      // (chat) group
      {
        element: <ChatLayout />,
        loader: chatLayoutLoader,
        children: [
          { index: true, loader: () => redirect('/chat/new') },
          { path: 'chat/:thread', lazy: () => import('./routes/chat/thread') },
          { path: 'agent/:id', lazy: () => import('./routes/agent/detail') },
          { path: 'agents', lazy: () => import('./routes/agent/list') },
          { path: 'archive/:id', lazy: () => import('./routes/archive/detail') },
          { path: 'workflow', loader: () => redirect('/workflow/new') },
          { path: 'workflow/:id', lazy: () => import('./routes/workflow/detail') },
          { path: 'mcp', lazy: () => import('./routes/mcp/list') },
          { path: 'mcp/create', lazy: () => import('./routes/mcp/create') },
          { path: 'mcp/modify/:id', lazy: () => import('./routes/mcp/modify') },
          { path: 'mcp/test/:id', lazy: () => import('./routes/mcp/test') },
          // (admin) group
          {
            element: <AdminLayout />,
            loader: requireAdmin,
            children: [
              { path: 'admin/users', lazy: () => import('./routes/admin/users-list') },
              { path: 'admin/users/:id', lazy: () => import('./routes/admin/user-detail') },
            ],
          },
        ],
      },
      // (public) group
      { path: 'export/:id', lazy: () => import('./routes/export/detail') },
      // auth error
      { path: 'api/auth/error', lazy: () => import('./routes/auth/error') },
    ],
  },
])
```

### 4.2 导航 API 映射

| Next | React Router | 影响文件数 |
|---|---|---|
| `import { useRouter } from 'next/navigation'` | `import { useNavigate } from 'react-router-dom'` | 16 |
| `router.push(url)` | `navigate(url)` | |
| `router.replace(url)` | `navigate(url, { replace: true })` | |
| `router.refresh()` | `revalidate()`（`useRevalidator`） | |
| `import Link from 'next/link'` | `import { Link } from 'react-router-dom'` | 23 |
| `<Link href={url}>` | `<Link to={url}>` | |
| `import { usePathname } from 'next/navigation'` | `import { useLocation } from 'react-router-dom'` → `location.pathname` | 3 |
| `import { useSearchParams } from 'next/navigation'` | `import { useSearchParams } from 'react-router-dom'` | 3 |
| `import { useParams } from 'next/navigation'` | `import { useParams } from 'react-router-dom'` | 1 |
| `redirect(url)` (server) | `throw redirect(url)` (loader) | 12 |
| `notFound()` (server) | `throw new Response(null, { status: 404 })` | 5 |
| `unauthorized()` (server) | `throw new Response(null, { status: 401 })` | 3 |
| `import Form from 'next/form'` | `import { Form } from 'react-router-dom'` 或原生 `<form>` | 7 |
| `import dynamic from 'next/dynamic'` | `React.lazy(() => import(...))` + `<Suspense>` | 6 |
| `import { Geist } from 'next/font/google'` | `import '@fontsource-variable/geist'` | 1 |

### 4.3 Server Component / Server Action 映射

| Next | 替代方案 |
|---|---|
| `async` Server Component（读 DB / cookies / redirect） | React Router `loader` 调 `/api` 获取数据 |
| `'use server'` action（11 个文件） | 转为 Hono REST endpoint，client 通过 `fetch` / `useFetcher` 调用 |
| `cookies()` / `headers()`（5 个文件） | 移到 server 端用 Hono `c.req.header/cookie` |
| `generateMetadata` | `index.html` 静态 `<meta>`；动态 `document.title` 在组件里设置 |
| `experimental_ppr` | 删除（SPA 不需要） |

### 4.4 i18n 映射

| Next (next-intl) | 替代 (i18next) |
|---|---|
| `import { useTranslations } from 'next-intl'` | `import { useTranslation } from 'react-i18next'` |
| `const t = useTranslations('Chat')` | `const { t } = useTranslation(); t('Chat.xxx')` |
| `import { getTranslations } from 'next-intl/server'` | 删除（server 不做 i18n，或 server 端用 `i18next` 直接调 `t()` ） |
| `<NextIntlClientProvider>` | `<I18nextProvider i18n={i18n}>` |
| `getRequestConfig()`（`src/i18n/request.ts`） | `i18next.init()` 的 `backend` 配置 |
| `messages/en.json`（顶层 keys） | `public/locales/en/translation.json`（结构不变） |
| 语言检测：`cookies()` + `accept-language` | `i18next-browser-languagedetector`（cookie + navigator） |
| `deepmerge` 回退英语 | i18next `fallbackLng: 'en'` 内建支持 |

### 4.5 鉴权映射

| Next (better-auth/next-js) | 替代 |
|---|---|
| `toNextJsHandler(auth.handler)` | `app.on(['GET','POST'], '/api/auth/*', c => auth.handler(c.req.raw))` |
| `nextCookies()` 插件 | 删除；better-auth 默认 cookie 行为即可 |
| `getSession()`（用 `next/headers`） | `auth.api.getSession({ headers: c.req.raw.headers })` |
| `src/proxy.ts`（中间件） | Hono `app.use('*', requireAuth)` + client router `loader` 守卫 |
| `src/lib/auth/client.ts`（`better-auth/react`） | **不变**（与 Next 无关） |

### 4.6 构建工具映射

| Next | 替代 |
|---|---|
| `next dev` | `concurrently 'vite' 'tsx watch server/src/index.ts'` |
| `next build` | `vite build` + `tsdown server/` |
| `next start` | `node server/dist/index.js` |
| `next.config.ts` | `client/vite.config.ts` + `server/tsdown.config.ts` |
| `.next/` 缓存目录 | `client/dist/` + `server/dist/` |

### 4.7 环境变量映射

| Next | Vite + Hono |
|---|---|
| `NEXT_PUBLIC_*`（客户端） | `VITE_*`（客户端） |
| `process.env.*`（服务端） | `process.env.*`（server/src 中，zod 校验） |
| `NEXT_RUNTIME` | 删除 |
| `NEXT_STANDALONE_OUTPUT` | 删除 |

---

## 五、依赖变更

### 5.1 移除

| 依赖 | 类型 | 原因 |
|---|---|---|
| `next` | dependencies | 框架替换 |
| `next-intl` | dependencies | 改用 i18next |
| `@vercel/blob` | dependencies | 只保留 S3 存储 |
| `server-only` | dependencies | SPA 不需要 |
| `eslint-config-next` | devDependencies | 已统一到 oxlint |
| `eslint` | devDependencies | 已统一到 oxlint |
| `cross-env` | devDependencies | 仅 Next 脚本使用 |

### 5.2 新增

| 依赖 | 类型 | 用途 |
|---|---|---|
| `react-router-dom` | dependencies | SPA 路由 |
| `hono` | dependencies | API 服务器 |
| `@hono/node-server` | dependencies | Node.js 运行时 |
| `i18next` | dependencies | i18n 核心 |
| `react-i18next` | dependencies | React 绑定 |
| `i18next-http-backend` | dependencies | 按需加载语言包 |
| `i18next-browser-languagedetector` | dependencies | 语言检测 |
| `@fontsource-variable/geist` | dependencies | 字体（替 next/font） |
| `@fontsource-variable/geist-mono` | dependencies | 字体 |
| `concurrently` | devDependencies | 并行启动 client+server |
| `@vitejs/plugin-react` | devDependencies | Vite React 插件 |

### 5.3 保留不变

- `next-themes`（纯客户端库）
- `better-auth`（核心库，去掉 `/next-js` 子路径即可）
- `better-auth/react`（`src/lib/auth/client.ts`）
- `drizzle-orm` / `drizzle-kit`
- `ai` SDK 全家桶 / `@ai-sdk/*`
- 所有 `@radix-ui/*` / `tailwindcss` / `lucide-react` / `sonner` / `swr` / `zustand` 等 UI 依赖
- `@aws-sdk/*`（S3 存储）
- `@modelcontextprotocol/sdk`
- `vitest` / `@playwright/test`

---

## 六、Server 设计

### 6.1 API 路由映射（38 个 → 12 个模块）

| 原路径 | Hono 模块 | 方法 |
|---|---|---|
| `api/auth/[...all]` | `auth`（直接挂载 handler） | GET, POST |
| `api/chat/`、`temporary/`、`export/`、`title/`、`models/`、`openai-realtime/` | `chat.routes.ts` | POST, GET |
| `api/agent/`、`[id]/`、`ai/` | `agent.routes.ts` | GET, POST, PUT, DELETE |
| `api/workflow/`、`[id]/`、`[id]/execute/`、`[id]/structure/`、`tools/` | `workflow.routes.ts` | GET, POST, PUT, DELETE |
| `api/mcp/`、`[id]/`、`list/`、`oauth/`、`server-customizations/`、`tool-customizations/` | `mcp.routes.ts` | GET, POST, DELETE |
| `api/archive/`、`[id]/`、`[id]/items/`、`[id]/items/[itemId]/` | `archive.routes.ts` | GET, POST, PUT, DELETE |
| `api/export/`、`[id]/`、`[id]/comments/`、`[id]/comments/[commentId]/` | `export.routes.ts` | GET, POST, DELETE |
| `api/storage/upload/`、`ingest/`、`upload-url/` | `storage.routes.ts` | POST |
| `api/user/details/`、`details/[id]/`、`preferences/` | `user.routes.ts` | GET, PUT |
| `api/admin/` (actions) | `admin.routes.ts` | POST |
| `api/bookmark/` | `bookmark.routes.ts` | POST, DELETE |
| `api/thread/` | `thread.routes.ts` | GET |

### 6.2 Server Action 映射（11 个文件）

| 原 action 文件 | 目标 |
|---|---|
| `api/user/actions.ts` | `user.routes.ts` 新增 endpoints |
| `api/admin/actions.ts` | `admin.routes.ts` 新增 endpoints |
| `api/chat/actions.ts` | `chat.routes.ts` 新增 endpoints |
| `api/auth/actions.ts` | `auth` 模块或 `user.routes.ts` |
| `api/mcp/actions.ts` | `mcp.routes.ts` 新增 endpoints |
| `api/workflow/actions.ts` | `workflow.routes.ts` 新增 endpoints |
| `api/archive/actions.ts` | `archive.routes.ts` 新增 endpoints |
| `api/storage/actions.ts` | `storage.routes.ts` 新增 endpoints |
| `i18n/get-locale.ts` | `GET /api/locale`（读 cookie） |
| `lib/user/server.ts` | server 端 service 层 |
| `lib/ai/image/generate-image.ts` | `chat.routes.ts` 内部调用 |

### 6.3 启动流程（替代 instrumentation.ts）

```ts
// server/src/bootstrap.ts
export async function bootstrap() {
  // 1. HTTP proxy 支持
  const proxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY
  if (proxyUrl) {
    const { ProxyAgent, setGlobalDispatcher } = await import('undici')
    setGlobalDispatcher(new ProxyAgent(proxyUrl))
  }
  // 2. DB 迁移
  await runMigrate()
  // 3. MCP 管理器初始化
  await initMCPManager()
}
```

### 6.4 中间件（替代 proxy.ts）

```ts
// server/src/middleware/require-auth.ts
export const requireAuth: MiddlewareHandler = async (c, next) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers })
  if (!session) return c.json({ error: 'Unauthorized' }, 401)
  c.set('session', session)
  await next()
}
```

客户端侧路由守卫通过 loader 实现：

```ts
// client/src/routes/guards/requireAuth.ts
export async function requireAuth({ request }: LoaderFunctionArgs) {
  const session = await apiClient.me.get({ signal: request.signal })
  if (!session) throw redirect(`/sign-in?redirect=${encodeURIComponent(new URL(request.url).pathname)}`)
  return session
}
```

---

## 七、Client 设计

### 7.1 入口

```tsx
// client/src/main.tsx
import '@fontsource-variable/geist'
import '@fontsource-variable/geist-mono'
import './styles/globals.css'
import 'katex/dist/katex.min.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router-dom'
import { ThemeProvider, ThemeStyleProvider } from './theme/theme-provider'
import { Toaster } from './components/ui/sonner'
import { setupI18n } from './i18n'
import { router } from './router'

async function boot() {
  await setupI18n()
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <ThemeProvider
        attribute='class'
        defaultTheme='system'
        themes={['light', 'dark']}
        storageKey='app-theme-v2'
        disableTransitionOnChange
      >
        <ThemeStyleProvider>
          <RouterProvider router={router} />
          <Toaster richColors />
        </ThemeStyleProvider>
      </ThemeProvider>
    </StrictMode>,
  )
}
boot()
```

### 7.2 i18n 初始化

```ts
// client/src/i18n/index.ts
import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import HttpBackend from 'i18next-http-backend'
import LanguageDetector from 'i18next-browser-languagedetector'

export async function setupI18n() {
  await i18n
    .use(HttpBackend)
    .use(LanguageDetector)
    .use(initReactI18next)
    .init({
      fallbackLng: 'en',
      defaultNS: 'translation',
      detection: {
        order: ['querystring', 'cookie', 'navigator'],
        caches: ['cookie'],
        cookieMinutes: 60 * 24 * 365,
      },
      interpolation: { escapeValue: false },
      backend: { loadPath: '/locales/{{lng}}/translation.json' },
    })
  return i18n
}
```

### 7.3 Vite 配置

```ts
// client/vite.config.ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  plugins: [react(), tailwindcss(), tsconfigPaths()],
  publicDir: 'public',
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:3001', changeOrigin: true, ws: true },
    },
  },
  build: { outDir: 'dist', sourcemap: true, target: 'es2022' },
})
```

### 7.4 FOUC 防闪烁

```html
<!-- client/index.html → <head> 最前 -->
<script>
  ;(() => {
    try {
      const t = localStorage.getItem('app-theme-v2') || 'system'
      const dark = t === 'dark' || (t === 'system' && matchMedia('(prefers-color-scheme: dark)').matches)
      document.documentElement.classList.add(dark ? 'dark' : 'light')
      document.documentElement.style.colorScheme = dark ? 'dark' : 'light'
    } catch {}
  })()
</script>
```

---

## 八、风险与对策

| 风险 | 影响 | 对策 |
|---|---|---|
| Server Component 聚合数据需在 client 重做 | loader 变多、潜在瀑布请求 | `Promise.all` 组合 loader；重查询走 `defer + Await` |
| `'use server'` 调用点散落多 | 改动面大 | 建 `api-client.ts` 做 typed fetch，统一替换 |
| better-auth 某些插件依赖 Next cookies | 登录态异常 | 删 `nextCookies`，用默认 cookie 策略 |
| SEO / OG / metadata 丢失 | 分享链接预览变差 | `index.html` 通用 meta；如需动态 OG，server 加 `/og/*` endpoint |
| SSE/WS 流式代理 | Dev 需要支持 | Vite `proxy.ws = true`；SSE 天然透传 |
| `NEXT_PUBLIC_*` 环境变量 | 名称不兼容 | 统一为 `VITE_*`；server 用 `process.env` |
| i18n 91 处 import 替换 | 工作量大 | 批量 sed 替换 + 类型检查兜底 |
| experimental_taint（React） | 不再可用 | 删除；靠类型系统 / lint 规则防范 |

---

## 九、验收标准

- [ ] `rg "from 'next['/]" packages/web-ui` 结果为 0（排除 `next-themes`）
- [ ] `rg "next-intl|@vercel/blob|'use server'|next/form|next/link|next/navigation|next/dynamic|next/font" packages/web-ui` 结果为 0
- [ ] `pnpm dev`（client + server）正常启动
- [ ] 登录 / 登出 / 注册流程正常
- [ ] Chat 流式输出、工具调用、文件上传正常
- [ ] Admin 角色权限正常
- [ ] i18n 7 种语言切换正常
- [ ] 所有 Playwright E2E 用例通过
- [ ] `pnpm build && pnpm start` 生产模式可用
- [ ] Docker 镜像构建成功并可运行
