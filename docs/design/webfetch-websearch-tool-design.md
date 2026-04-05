# WebFetch / WebSearch 工具技术方案

> 综合分析 superpowers、deepagents、pi-mono、opendev、gstack、infiAgent、open-agent-sdk 七大框架，为 vitamin 设计 web 类工具实现。

---

## 1. 框架调研总结

### 1.1 各框架 Web 工具实现对比

| 框架 | Stars | WebFetch 方案 | WebSearch 方案 | 浏览器自动化 | 依赖复杂度 |
|------|-------|--------------|---------------|-------------|-----------|
| **open-agent-sdk** | 2.3k | 原生 `fetch` + 正则剥离 HTML 标签 + 100K 截断 | DuckDuckGo HTML 页面抓取 + 正则解析 | 无 | 极低（零依赖） |
| **gstack** | 64.5k | Playwright headless Chromium 全功能浏览器 | 通过浏览器执行搜索 | 完整 Playwright（持久化会话、快照、CSS 检查） | 极高（Chromium ~300MB） |
| **infiAgent** | 1.2k | Crawl4AI 抓取 → Markdown 文件 | 通过 Crawl4AI | Playwright + Crawl4AI | 高 |
| **superpowers** | 136k | 无内置（Skills 框架） | 无内置（Skills 框架） | 无 | N/A |
| **deepagents** | 19.2k | LangChain 工具链 | "Web search — ground responses in live information" | LangChain 生态 | 中 |
| **pi-mono** | 31.6k | 未发现独立 web 工具 | 未发现独立 web 工具 | 无 | N/A |
| **opendev** | 479 | 无内置（MCP 外部工具） | 无内置（MCP 外部工具） | 无 | N/A |

### 1.2 关键实现模式

**模式 A — 轻量级 fetch + 正则清洗**（open-agent-sdk）
- 使用 Node.js 原生 `fetch()` 获取页面
- 正则移除 `<script>`、`<style>`、HTML 标签
- 截断到固定长度（100K 字符）
- 优点：零依赖、快速、可靠
- 缺点：无法处理 JavaScript 渲染页面、解析质量较低

**模式 B — 完整浏览器引擎**（gstack）
- Playwright headless Chromium，~100ms/命令
- 持久化浏览器会话、 accessibility tree 快照
- CSS 检查、响应式测试、截图/PDF
- CAPTCHA 检测可交由用户处理
- 优点：完整渲染、可与复杂 Web 应用交互
- 缺点：巨大依赖（Chromium）、资源消耗高

**模式 C — 专用爬虫库**（infiAgent）
- Crawl4AI 专用抓取库
- 自动提取页面内容转为 Markdown
- 文件导向（保存为本地 .md）
- 优点：提取质量好
- 缺点：Python 生态，不适合 Node.js 项目

**模式 D — 搜索引擎 HTML 抓取**（open-agent-sdk）
- 直接请求 DuckDuckGo HTML 版 `https://html.duckduckgo.com/html/?q=`
- 正则解析 `result__a` 链接和 `result__snippet` 摘要
- 无需 API Key
- 优点：零成本、零注册
- 缺点：依赖 DuckDuckGo HTML 页面结构稳定性

---

## 2. 设计目标

1. **分层架构**：Tier 1 轻量 HTTP fetch（标准预设），Tier 2 可选浏览器引擎（未来扩展）
2. **零必需外部依赖**：核心实现仅使用 Node.js 原生 `fetch`，不引入 Playwright/Puppeteer
3. **对齐现有工具模式**：遵循 vitamin `AgentTool` 接口 + Zod schema + 工厂函数 + ToolRegistry 注册
4. **内容质量**：HTML → 可读文本转换质量优于简单正则剥离
5. **安全性**：URL 白/黑名单、请求超时、输出截断、SSRF 防护

---

## 3. 工具定义

### 3.1 `web_fetch` — 获取网页内容

```typescript
// packages/tools/src/web/fetch.ts

const WebFetchArgsSchema = z.object({
  url: z.string().url().describe('URL to fetch content from'),
  format: z.enum(['text', 'markdown', 'raw'])
    .optional()
    .default('text')
    .describe('Output format: text (default), markdown, or raw HTML'),
  headers: z.record(z.string(), z.string())
    .optional()
    .describe('Additional HTTP headers to include'),
  maxLength: z.number().int().min(1000).max(500_000)
    .optional()
    .describe('Maximum output length in characters (default: env limit)'),
})

function createWebFetch(projectRoot: string): AgentTool<WebFetchArgs>
```

**参数说明**：
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `url` | `string` (URL) | 是 | 目标 URL |
| `format` | `'text' \| 'markdown' \| 'raw'` | 否 | 输出格式，默认 `text` |
| `headers` | `Record<string, string>` | 否 | 自定义请求头 |
| `maxLength` | `number` | 否 | 最大输出字符数 |

**返回**：`ToolResult` — `content[0].text` 为提取的页面内容

### 3.2 `web_search` — 网络搜索

```typescript
// packages/tools/src/web/search.ts

const WebSearchArgsSchema = z.object({
  query: z.string().min(1).max(500).describe('Search query'),
  limit: z.number().int().min(1).max(20)
    .optional()
    .default(10)
    .describe('Maximum number of results to return'),
})

function createWebSearch(projectRoot: string): AgentTool<WebSearchArgs>
```

**参数说明**：
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `query` | `string` | 是 | 搜索关键词 |
| `limit` | `number` | 否 | 返回结果数量上限，默认 10 |

**返回**：`ToolResult` — 格式化的搜索结果列表

---

## 4. 实现细节

### 4.1 `web_fetch` 核心流程

```
URL 验证 → SSRF 检查 → HTTP fetch（30s 超时）→ Content-Type 检测 → HTML 转换 → 截断 → 返回
```

#### 4.1.1 SSRF 防护

```typescript
// packages/tools/src/web/url-validator.ts

const BLOCKED_HOSTS = new Set([
  'localhost', '127.0.0.1', '0.0.0.0', '[::1]',
  'metadata.google.internal',          // GCP
  '169.254.169.254',                    // AWS/Azure metadata
])

const BLOCKED_PROTOCOLS = new Set(['file:', 'ftp:', 'data:', 'javascript:'])

function validateUrl(raw: string): URL {
  const url = new URL(raw)
  
  if (BLOCKED_PROTOCOLS.has(url.protocol)) {
    throw new Error(`Blocked protocol: ${url.protocol}`)
  }

  if (BLOCKED_HOSTS.has(url.hostname)) {
    throw new Error(`Blocked host: ${url.hostname}`)
  }

  // 阻止私有 IP 范围
  if (isPrivateIP(url.hostname)) {
    throw new Error(`Blocked private IP: ${url.hostname}`)
  }

  return url
}
```

#### 4.1.2 HTML → 文本转换

采用基于正则的分层清洗策略（借鉴 open-agent-sdk，但更精细）：

```typescript
// packages/tools/src/web/html-to-text.ts

function htmlToText(html: string): string {
  let text = html

  // 1. 移除不可见内容
  text = text.replace(/<script[\s\S]*?<\/script>/gi, '')
  text = text.replace(/<style[\s\S]*?<\/style>/gi, '')
  text = text.replace(/<noscript[\s\S]*?<\/noscript>/gi, '')
  text = text.replace(/<!--[\s\S]*?-->/g, '')

  // 2. 语义化转换（保留结构信息）
  text = text.replace(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/gi, '\n\n## $1\n\n')
  text = text.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, '\n• $1')
  text = text.replace(/<br\s*\/?>/gi, '\n')
  text = text.replace(/<\/p>/gi, '\n\n')
  text = text.replace(/<\/div>/gi, '\n')
  text = text.replace(/<\/tr>/gi, '\n')
  text = text.replace(/<td[^>]*>/gi, '\t')
  text = text.replace(/<th[^>]*>/gi, '\t')

  // 3. 提取链接信息
  text = text.replace(/<a[^>]+href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, '$2 ($1)')

  // 4. 剥离剩余标签
  text = text.replace(/<[^>]+>/g, '')

  // 5. 解码 HTML 实体
  text = decodeHtmlEntities(text)

  // 6. 清理空白
  text = text.replace(/\n{3,}/g, '\n\n')
  text = text.replace(/[ \t]+/g, ' ')
  text = text.trim()

  return text
}
```

> **设计决策**：不引入 `cheerio`/`turndown` 等外部依赖。正则方法可处理 95% 场景，且保持零依赖特性。若未来需要更高质量的 Markdown 转换，可作为可选依赖引入 turndown。

#### 4.1.3 请求配置

```typescript
const FETCH_TIMEOUT_MS = 30_000
const MAX_RESPONSE_BYTES = 5 * 1024 * 1024  // 5MB 限制原始响应
const DEFAULT_USER_AGENT = 'VitaminBot/1.0 (+https://github.com/aspect-build/vitamin-coding)'

const response = await fetch(url.href, {
  headers: {
    'User-Agent': DEFAULT_USER_AGENT,
    'Accept': 'text/html, application/json, text/plain, */*',
    ...userHeaders,
  },
  signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  redirect: 'follow',
})
```

#### 4.1.4 Content-Type 分支处理

```
text/html              → htmlToText() 或 htmlToMarkdown()
application/json       → JSON.stringify(body, null, 2)
text/plain             → 直接返回
text/xml, application/* → 尝试提取文本
其他                    → 返回元信息（MIME、大小）
```

### 4.2 `web_search` 核心流程

```
查询清洗 → DuckDuckGo HTML 请求 → 正则解析结果 → 格式化输出
```

#### 4.2.1 DuckDuckGo HTML 引擎

```typescript
// packages/tools/src/web/search.ts

const DUCKDUCKGO_URL = 'https://html.duckduckgo.com/html/'

async function duckduckgoSearch(query: string, limit: number): Promise<SearchResult[]> {
  const params = new URLSearchParams({ q: query })
  
  const response = await fetch(`${DUCKDUCKGO_URL}?${params}`, {
    headers: {
      'User-Agent': DEFAULT_USER_AGENT,
      'Accept': 'text/html',
    },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  })

  const html = await response.text()
  return parseSearchResults(html, limit)
}

function parseSearchResults(html: string, limit: number): SearchResult[] {
  const results: SearchResult[] = []
  
  // 匹配 DuckDuckGo 结果条目
  const resultPattern = /<a[^>]+class="result__a"[^>]+href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi
  const snippetPattern = /<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi

  // ... 解析逻辑（参考 open-agent-sdk 实现）
  
  return results.slice(0, limit)
}
```

#### 4.2.2 输出格式

```
Search results for: "TypeScript error handling patterns"

1. TypeScript Error Handling Best Practices - SomeWebsite.com
   https://example.com/typescript-error-handling
   Learn about proper error handling patterns in TypeScript including...

2. ...
```

#### 4.2.3 可扩展搜索引擎接口

```typescript
// packages/tools/src/web/search-engine.ts

interface SearchEngine {
  name: string
  search(query: string, limit: number, signal?: AbortSignal): Promise<SearchResult[]>
}

interface SearchResult {
  title: string
  url: string
  snippet: string
}
```

为未来扩展预留接口，可接入：
- Brave Search API (`BRAVE_API_KEY`)
- SerpAPI (`SERPAPI_KEY`)
- Tavily (`TAVILY_API_KEY`)
- Google Custom Search

当前版本仅实现 DuckDuckGo HTML 引擎（零 API Key 需求）。

---

## 5. 集成方案

### 5.1 目录结构

```
packages/tools/src/
├── web/
│   ├── fetch.ts           # createWebFetch 工具
│   ├── search.ts          # createWebSearch 工具
│   ├── html-to-text.ts    # HTML → 纯文本转换
│   ├── url-validator.ts   # URL 验证 + SSRF 防护
│   └── search-engine.ts   # SearchEngine 接口 + DuckDuckGo 实现
├── fs/
├── search/
├── shell/
└── ...
```

### 5.2 register-builtin.ts 注册

```typescript
// 在 registerBuiltinTools() 中新增：
import { createWebFetch } from './web/fetch'
import { createWebSearch } from './web/search'

// standard preset — web 类工具
registry.register([
  createWebFetch(projectRoot),
  createWebSearch(projectRoot),
], { preset: 'standard', category: 'web', builtin: true })
```

**预设级别选择 `standard` 的理由**：
- web_fetch/web_search 是通用 coding agent 的常见需求
- 不需要外部回调函数（不像 orchestration 工具需要注入 dispatch）
- 与 `ls`/`find`/`grep` 同级

### 5.3 index.ts 导出

```typescript
// Web tools
export { createWebFetch } from './web/fetch'
export { createWebSearch } from './web/search'
```

### 5.4 System Prompt 工具指引

通过 `ToolRegistry.buildToolGuidance()` 自动注入：

```typescript
registry.register([
  createWebFetch(projectRoot),
  createWebSearch(projectRoot),
], {
  preset: 'standard',
  category: 'web',
  builtin: true,
  guideline: [
    'Use web_fetch to read specific URLs when you know the page address.',
    'Use web_search to find information when you need to discover relevant URLs.',
    'Prefer web_search → web_fetch workflow: search first, then fetch specific results.',
    'web_fetch cannot render JavaScript-heavy pages (SPAs). Use for documentation, articles, APIs.',
  ].join('\n'),
})
```

---

## 6. 安全设计

| 安全措施 | 实现方式 |
|---------|---------|
| **SSRF 防护** | 阻止私有 IP、localhost、云元数据端点 |
| **协议限制** | 仅允许 `http:` / `https:` |
| **请求超时** | 30s AbortSignal.timeout |
| **响应大小限制** | 5MB 原始响应上限 |
| **输出截断** | 复用 `TOOLS_MAX_OUTPUT_BYTES` 环境变量 |
| **User-Agent** | 明确标识 VitaminBot，遵守 robots.txt 精神 |
| **无凭据泄露** | 不在搜索 query 中传递用户密码/token |
| **重定向限制** | 跟随重定向但不超过浏览器默认限制 |

---

## 7. 未来扩展路径

### 7.1 Tier 2 — 可选浏览器引擎（`web_browse`）

参考 gstack 的完整 Playwright 方案，作为独立工具：

```typescript
// 未来: packages/tools/src/web/browse.ts
// 需要可选依赖: playwright

const WebBrowseArgsSchema = z.object({
  commands: z.array(z.string()).describe('Browser commands (navigate, click, type, snapshot, screenshot)'),
})

function createWebBrowse(projectRoot: string): AgentTool<WebBrowseArgs>
```

这将作为 `full` 预设工具，仅在安装 `playwright` 时可用。

### 7.2 可配置搜索引擎

```typescript
// 环境变量驱动的搜索引擎选择
// VITAMIN_SEARCH_ENGINE=duckduckgo (default)
// VITAMIN_SEARCH_ENGINE=brave      → 需要 BRAVE_API_KEY
// VITAMIN_SEARCH_ENGINE=serpapi     → 需要 SERPAPI_KEY
```

### 7.3 可配置内容提取

若解析质量不足，通过可选依赖升级：
- `turndown` → 高质量 HTML → Markdown
- `@mozilla/readability` → 提取文章正文（去广告/导航）

---

## 8. 依赖影响

### 8.1 当前方案（Tier 1）

**新增依赖：无**

完全使用 Node.js 原生 API：
- `fetch` — Node.js 18+ 内置
- `URL` / `URLSearchParams` — Node.js 内置
- `AbortSignal.timeout` — Node.js 18+ 内置

### 8.2 未来方案（Tier 2，可选）

| 依赖 | 用途 | 大小 | 必需？ |
|------|------|------|--------|
| `playwright` | 浏览器自动化 | ~300MB | 否，opt-in |
| `turndown` | HTML→Markdown | ~50KB | 否，opt-in |
| `@mozilla/readability` | 文章提取 | ~30KB | 否，opt-in |

---

## 9. 测试策略

```
tests/web/
├── fetch.test.ts          # HTTP fetch + HTML 转换集成测试
├── search.test.ts         # 搜索结果解析测试
├── html-to-text.test.ts   # HTML→文本转换单元测试
└── url-validator.test.ts  # URL 验证 + SSRF 防护测试
```

- **html-to-text**: 使用真实 HTML snippet 测试转换质量
- **url-validator**: 测试所有 SSRF 场景（私有 IP、metadata endpoint、协议）
- **fetch/search**: 使用真实 HTTP 请求（遵循用户偏好不使用 mock/spyon）

---

## 10. 实现优先级

| 阶段 | 内容 | 复杂度 |
|------|------|--------|
| **P0** | `url-validator.ts` — SSRF 防护 | 低 |
| **P0** | `html-to-text.ts` — HTML 清洗 | 低 |
| **P0** | `web_fetch` — 核心实现 | 中 |
| **P0** | `web_search` — DuckDuckGo 引擎 | 中 |
| **P0** | register-builtin 注册 + 导出 | 低 |
| **P1** | SearchEngine 可扩展接口 | 低 |
| **P2** | `web_browse` — Playwright （选 opt-in） | 高 |
