import { afterEach, describe, expect, it, vi } from 'vitest'
import { ToolError } from '@vitamin/shared'
import { htmlToText, htmlToMarkdown } from '../src/web/html-to-text'
import { validateUrl } from '../src/web/url-validator'
import { createWebFetch } from '../src/web/fetch'
import { createWebSearch } from '../src/web/search'

afterEach(() => {
  vi.unstubAllGlobals()
})

// ─── URL Validator ─────────────────────────────────────────────────────────

describe('url-validator', () => {
  it('accepts valid https URL', () => {
    const url = validateUrl('https://example.com/page')
    expect(url.hostname).toBe('example.com')
    expect(url.protocol).toBe('https:')
  })

  it('accepts valid http URL', () => {
    const url = validateUrl('http://example.com')
    expect(url.protocol).toBe('http:')
  })

  it('rejects file: protocol', () => {
    expect(() => validateUrl('file:///etc/passwd')).toThrow('Blocked protocol')
    expect(() => validateUrl('file:///etc/passwd')).toThrow(ToolError)
  })

  it('rejects ftp: protocol', () => {
    expect(() => validateUrl('ftp://example.com')).toThrow('Blocked protocol')
  })

  it('rejects data: protocol', () => {
    expect(() => validateUrl('data:text/html,<h1>hi</h1>')).toThrow('Blocked protocol')
  })

  it('rejects javascript: protocol', () => {
    expect(() => validateUrl('javascript:alert(1)')).toThrow('Blocked protocol')
  })

  it('rejects localhost', () => {
    expect(() => validateUrl('http://localhost:3000')).toThrow('Blocked host')
  })

  it('rejects 127.0.0.1', () => {
    expect(() => validateUrl('http://127.0.0.1')).toThrow('Blocked host')
  })

  it('rejects 0.0.0.0', () => {
    expect(() => validateUrl('http://0.0.0.0')).toThrow('Blocked host')
  })

  it('rejects AWS metadata endpoint', () => {
    expect(() => validateUrl('http://169.254.169.254/latest/meta-data')).toThrow('Blocked host')
  })

  it('rejects GCP metadata endpoint', () => {
    expect(() => validateUrl('http://metadata.google.internal')).toThrow('Blocked host')
  })

  it('rejects private IP 10.x.x.x', () => {
    expect(() => validateUrl('http://10.0.0.1')).toThrow('Blocked private IP')
  })

  it('rejects private IP 172.16.x.x', () => {
    expect(() => validateUrl('http://172.16.0.1')).toThrow('Blocked private IP')
  })

  it('rejects private IP 192.168.x.x', () => {
    expect(() => validateUrl('http://192.168.1.1')).toThrow('Blocked private IP')
  })

  it('rejects invalid URL', () => {
    expect(() => validateUrl('not-a-url')).toThrow('Invalid URL')
  })

  it('returns typed metadata for blocked private URLs', () => {
    try {
      validateUrl('http://192.168.1.1')
    } catch (error) {
      expect(error).toBeInstanceOf(ToolError)
      expect(error).toMatchObject({
        code: 'TOOL_WEB_BLOCKED_PRIVATE_IP',
        metadata: {
          url: 'http://192.168.1.1',
          hostname: '192.168.1.1',
        },
      })
    }
  })
})

// ─── HTML → Text ───────────────────────────────────────────────────────────

describe('htmlToText', () => {
  it('strips script and style tags', () => {
    const html = '<p>Hello</p><script>alert("x")</script><style>.x{color:red}</style><p>World</p>'
    const text = htmlToText(html)
    expect(text).not.toContain('alert')
    expect(text).not.toContain('color:red')
    expect(text).toContain('Hello')
    expect(text).toContain('World')
  })

  it('converts headings', () => {
    const html = '<h1>Title</h1><p>Paragraph</p>'
    const text = htmlToText(html)
    expect(text).toContain('## Title')
    expect(text).toContain('Paragraph')
  })

  it('converts list items', () => {
    const html = '<ul><li>First</li><li>Second</li></ul>'
    const text = htmlToText(html)
    expect(text).toContain('• First')
    expect(text).toContain('• Second')
  })

  it('extracts link text with URL', () => {
    const html = '<a href="https://example.com">Click here</a>'
    const text = htmlToText(html)
    expect(text).toContain('Click here (https://example.com)')
  })

  it('decodes HTML entities', () => {
    const html = '<p>A &amp; B &lt; C &gt; D</p>'
    const text = htmlToText(html)
    expect(text).toContain('A & B < C > D')
  })

  it('decodes numeric entities', () => {
    const html = '<p>&#169; &#x2764;</p>'
    const text = htmlToText(html)
    expect(text).toContain('©')
    expect(text).toContain('❤')
  })

  it('removes HTML comments', () => {
    const html = '<p>Visible</p><!-- Hidden comment --><p>Also visible</p>'
    const text = htmlToText(html)
    expect(text).not.toContain('Hidden comment')
    expect(text).toContain('Visible')
    expect(text).toContain('Also visible')
  })

  it('collapses excessive whitespace', () => {
    const html = '<p>A</p>\n\n\n\n\n\n<p>B</p>'
    const text = htmlToText(html)
    expect(text).not.toMatch(/\n{3,}/)
  })

  it('handles empty input', () => {
    expect(htmlToText('')).toBe('')
  })
})

// ─── HTML → Markdown ───────────────────────────────────────────────────────

describe('htmlToMarkdown', () => {
  it('converts headings to markdown heading levels', () => {
    const html = '<h1>H1</h1><h2>H2</h2><h3>H3</h3>'
    const md = htmlToMarkdown(html)
    expect(md).toContain('# H1')
    expect(md).toContain('## H2')
    expect(md).toContain('### H3')
  })

  it('converts bold and italic', () => {
    const html = '<strong>bold</strong> and <em>italic</em>'
    const md = htmlToMarkdown(html)
    expect(md).toContain('**bold**')
    expect(md).toContain('*italic*')
  })

  it('converts inline code', () => {
    const html = 'Use <code>npm install</code> to install'
    const md = htmlToMarkdown(html)
    expect(md).toContain('`npm install`')
  })

  it('converts links to markdown format', () => {
    const html = '<a href="https://example.com">Example</a>'
    const md = htmlToMarkdown(html)
    expect(md).toContain('[Example](https://example.com)')
  })

  it('converts list items with dashes', () => {
    const html = '<ul><li>Item 1</li><li>Item 2</li></ul>'
    const md = htmlToMarkdown(html)
    expect(md).toContain('- Item 1')
    expect(md).toContain('- Item 2')
  })

  it('converts horizontal rules', () => {
    const html = '<p>Above</p><hr><p>Below</p>'
    const md = htmlToMarkdown(html)
    expect(md).toContain('---')
  })
})

// ─── WebFetch Tool ────────────────────────────────────────────────────────

describe('web_fetch', () => {
  const tool = createWebFetch('/tmp/test')

  it('has correct tool shape', () => {
    expect(tool.name).toBe('web_fetch')
    expect(tool.description).toContain('Fetch')
    expect(tool.readonly).toBe(true)
    expect(tool.parameters).toBeDefined()
  })

  it('rejects SSRF URLs', async () => {
    await expect(
      tool.execute({
        id: 'f1',
        params: { url: 'http://169.254.169.254/latest/meta-data' },
        signal: new AbortController().signal,
      }),
    ).rejects.toThrow('Blocked host')
  })

  it('fetches a real public URL', async () => {
    const result = await tool.execute({
      id: 'f2',
      params: { url: 'https://httpbin.org/html' },
      signal: AbortSignal.timeout(15_000),
    })

    expect(result.isError).toBeFalsy()
    expect(result.content[0]?.text).toContain('Herman Melville')
  }, 20_000)

  it('fetches JSON content', async () => {
    const result = await tool.execute({
      id: 'f3',
      params: { url: 'https://httpbin.org/json' },
      signal: AbortSignal.timeout(15_000),
    })

    expect(result.isError).toBeFalsy()
    const text = result.content[0]?.text ?? ''
    expect(text).toContain('slideshow')
  }, 20_000)

  it('returns error for 404', async () => {
    const result = await tool.execute({
      id: 'f4',
      params: { url: 'https://httpbin.org/status/404' },
      signal: AbortSignal.timeout(15_000),
    })

    expect(result.isError).toBe(true)
    expect(result.content[0]?.text).toContain('404')
  }, 20_000)
})

// ─── WebSearch Tool ───────────────────────────────────────────────────────

describe('web_search', () => {
  const tool = createWebSearch('/tmp/test')

  it('has correct tool shape', () => {
    expect(tool.name).toBe('web_search')
    expect(tool.description).toContain('Search')
    expect(tool.readonly).toBe(true)
    expect(tool.parameters).toBeDefined()
  })

  it('returns search results for a common query', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        return new Response(
          `
          <html>
            <body>
              <div class="snippet" data-type="web">
                <a href="https://www.typescriptlang.org/" class="result svelte-abc">
                  <div class="title search-snippet-title" title="TypeScript: JavaScript With Syntax For Types."></div>
                </a>
                <div class="generic-snippet"><div class="content">TypeScript extends JavaScript by adding types.</div></div>
              </div>
            </body>
          </html>
          `,
          {
            status: 200,
            headers: { 'Content-Type': 'text/html' },
          },
        )
      }),
    )

    const result = await tool.execute({
      id: 's1',
      params: { query: 'TypeScript programming language', limit: 5 },
      signal: AbortSignal.timeout(15_000),
    })

    expect(result.isError).toBeFalsy()
    const text = result.content[0]?.text ?? ''
    expect(text).toContain('Search results for:')
    // Should have at least one numbered result
    expect(text).toMatch(/\d+\./)
  }, 20_000)
})
