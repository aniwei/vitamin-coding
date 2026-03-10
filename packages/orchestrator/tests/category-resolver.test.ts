// CategoryResolver 单元测试
import { describe, expect, it } from 'vitest'

import { CategoryResolver, createCategoryResolver } from '../src/delegation/category-resolver'

describe('CategoryResolver', () => {
  describe('#given default mappings', () => {
    describe('#when resolving built-in categories', () => {
      it('#then code resolves to hephaestus', () => {
        const resolver = createCategoryResolver()
        expect(resolver.resolve('code')).toBe('hephaestus')
      })

      it('#then search resolves to explore', () => {
        const resolver = createCategoryResolver()
        expect(resolver.resolve('search')).toBe('explore')
      })

      it('#then quick resolves to sisyphus-junior', () => {
        const resolver = createCategoryResolver()
        expect(resolver.resolve('quick')).toBe('sisyphus-junior')
      })

      it('#then architecture resolves to oracle', () => {
        const resolver = createCategoryResolver()
        expect(resolver.resolve('architecture')).toBe('oracle')
      })

      it('#then knowledge resolves to librarian', () => {
        const resolver = createCategoryResolver()
        expect(resolver.resolve('knowledge')).toBe('librarian')
      })
    })

    describe('#when resolving unknown category', () => {
      it('#then returns undefined', () => {
        const resolver = createCategoryResolver()
        expect(resolver.resolve('nonexistent')).toBeUndefined()
      })
    })

    describe('#when getCategories is called', () => {
      it('#then returns all built-in categories', () => {
        const resolver = createCategoryResolver()
        const categories = resolver.getCategories()

        expect(categories).toContain('code')
        expect(categories).toContain('search')
        expect(categories).toContain('quick')
        expect(categories).toContain('architecture')
        expect(categories).toContain('knowledge')
        expect(categories).toContain('general')
        expect(categories).toContain('debug')
        expect(categories).toContain('test')
      })
    })
  })

  describe('#given custom overrides', () => {
    describe('#when resolving overridden category', () => {
      it('#then returns override agent', () => {
        const resolver = createCategoryResolver({
          overrides: { code: 'custom-code-agent' },
        })

        expect(resolver.resolve('code')).toBe('custom-code-agent')
      })
    })

    describe('#when setMapping is called dynamically', () => {
      it('#then new mapping is available', () => {
        const resolver = createCategoryResolver()

        resolver.setMapping('custom-category', 'custom-agent')
        expect(resolver.resolve('custom-category')).toBe('custom-agent')
      })
    })
  })
})
