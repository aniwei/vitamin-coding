import { describe, expect, it } from 'vitest'
import {
  createMarkdownProcessor,
  createGfmProcessor,
  createFrontmatterProcessor,
  getNodeText,
  extractBoldLabels,
  extractInlineCodes,
  countChecks,
  extractFrontmatter,
  extractBodyFromAst,
} from '../src/markdown'
import type { MdastNode, YamlNode } from '../src/markdown'

describe('createMarkdownProcessor', () => {
  it('#parses basic markdown into AST', () => {
    const proc = createMarkdownProcessor()
    const tree = proc.parse('# Hello\n\nworld')
    expect(tree.type).toBe('root')
    expect(tree.children.length).toBeGreaterThan(0)
    expect(tree.children[0]!.type).toBe('heading')
  })
})

describe('createGfmProcessor', () => {
  it('#parses GFM tables', () => {
    const proc = createGfmProcessor()
    const tree = proc.parse('| A | B |\n|---|---|\n| 1 | 2 |')
    expect(tree.type).toBe('root')
    const table = tree.children.find(n => n.type === 'table')
    expect(table).toBeDefined()
  })

  it('#parses task lists', () => {
    const proc = createGfmProcessor()
    const tree = proc.parse('- [x] done\n- [ ] todo')
    const list = tree.children.find(n => n.type === 'list')
    expect(list).toBeDefined()
    expect(list!.children!.length).toBe(2)
  })
})

describe('createFrontmatterProcessor', () => {
  it('#parses yaml frontmatter nodes', () => {
    const proc = createFrontmatterProcessor()
    const tree = proc.parse('---\ntitle: test\n---\n\nBody')
    const yamlNode = tree.children.find(n => n.type === 'yaml')
    expect(yamlNode).toBeDefined()
    expect(yamlNode!.value).toContain('title: test')
  })
})

describe('getNodeText', () => {
  it('#returns value for leaf nodes', () => {
    expect(getNodeText({ type: 'text', value: 'hello' })).toBe('hello')
  })

  it('#concatenates children text recursively', () => {
    const node: MdastNode = {
      type: 'paragraph',
      children: [
        { type: 'text', value: 'hello ' },
        { type: 'strong', children: [{ type: 'text', value: 'world' }] },
      ],
    }
    expect(getNodeText(node)).toBe('hello world')
  })

  it('#returns empty string for node without value or children', () => {
    expect(getNodeText({ type: 'thematicBreak' })).toBe('')
  })
})

describe('extractBoldLabels', () => {
  it('#extracts bold label-value pairs', () => {
    const proc = createMarkdownProcessor()
    const tree = proc.parse('**Name:** Alice **Role:** Admin')
    const para = tree.children.find(n => n.type === 'paragraph')
    const labels = extractBoldLabels(para!)
    expect(labels.length).toBe(2)
    expect(labels[0]!.label).toBe('Name')
    expect(labels[0]!.rest).toBe('Alice')
    expect(labels[1]!.label).toBe('Role')
    expect(labels[1]!.rest).toBe('Admin')
  })

  it('#returns empty for non-paragraph nodes', () => {
    expect(extractBoldLabels({ type: 'heading', children: [] })).toEqual([])
  })

  it('#ignores bold without trailing colon', () => {
    const proc = createMarkdownProcessor()
    const tree = proc.parse('**NoColon** text')
    const para = tree.children.find(n => n.type === 'paragraph')
    expect(extractBoldLabels(para!)).toEqual([])
  })
})

describe('extractInlineCodes', () => {
  it('#extracts all inline code values', () => {
    const proc = createMarkdownProcessor()
    const tree = proc.parse('Use `foo` and `bar`')
    const codes = extractInlineCodes(tree)
    expect(codes).toEqual(['foo', 'bar'])
  })

  it('#returns empty for no inline codes', () => {
    const proc = createMarkdownProcessor()
    const tree = proc.parse('no code here')
    expect(extractInlineCodes(tree)).toEqual([])
  })
})

describe('countChecks', () => {
  it('#counts checked and total items in a task list', () => {
    const items: MdastNode[] = [
      { type: 'listItem', checked: true },
      { type: 'listItem', checked: false },
      { type: 'listItem', checked: true },
    ]
    expect(countChecks(items)).toEqual({ total: 3, checked: 2 })
  })

  it('#ignores items without checked property', () => {
    const items: MdastNode[] = [
      { type: 'listItem' },
      { type: 'listItem', checked: false },
    ]
    expect(countChecks(items)).toEqual({ total: 1, checked: 0 })
  })

  it('#handles empty array', () => {
    expect(countChecks([])).toEqual({ total: 0, checked: 0 })
  })
})

describe('extractFrontmatter', () => {
  it('#extracts yaml and body from content with frontmatter', () => {
    const content = '---\ntitle: hello\n---\n\nBody text'
    const result = extractFrontmatter(content)
    expect(result.yaml).toBe('title: hello')
    expect(result.body).toBe('Body text')
  })

  it('#returns null yaml when no frontmatter present', () => {
    const result = extractFrontmatter('Just plain text')
    expect(result.yaml).toBeNull()
    expect(result.body).toBe('Just plain text')
  })

  it('#returns null yaml when opening --- is not first line', () => {
    const result = extractFrontmatter('text\n---\ntitle: x\n---')
    expect(result.yaml).toBeNull()
  })

  it('#handles empty body after frontmatter', () => {
    const result = extractFrontmatter('---\nkey: val\n---')
    expect(result.yaml).toBe('key: val')
    expect(result.body).toBe('')
  })

  it('#handles unclosed frontmatter as no frontmatter', () => {
    const result = extractFrontmatter('---\nkey: val\nno closing')
    expect(result.yaml).toBeNull()
  })

  it('#handles Windows-style line endings', () => {
    const result = extractFrontmatter('---\r\ntitle: x\r\n---\r\n\r\nBody')
    expect(result.yaml).toBe('title: x')
    expect(result.body).toBe('Body')
  })
})

describe('extractBodyFromAst', () => {
  it('#extracts body using yaml node position', () => {
    const content = '---\ntitle: test\n---\n\nBody here'
    const proc = createFrontmatterProcessor()
    const tree = proc.parse(content)
    const yamlNode = tree.children.find(n => n.type === 'yaml') as YamlNode | undefined
    const body = extractBodyFromAst(content, yamlNode)
    expect(body).toBe('Body here')
  })

  it('#returns full content when no yaml node', () => {
    const body = extractBodyFromAst('  No frontmatter  ', undefined)
    expect(body).toBe('No frontmatter')
  })
})
