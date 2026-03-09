// @vitamin/ai token-counter 测试
import { describe, expect, it } from 'vitest'
import { estimateMessagesTokens, estimateTokenCount } from '../src/utils/token-counter'

describe('estimateTokenCount', () => {
  describe('#given empty string', () => {
    it('#then returns 0', () => {
      expect(estimateTokenCount('')).toBe(0)
    })
  })

  describe('#given ASCII text', () => {
    it('#then estimates roughly 1 token per 4 chars', () => {
      // 12 ASCII chars → 12 * 0.25 = 3 tokens
      const text = 'hello world!'
      const tokens = estimateTokenCount(text)
      expect(tokens).toBe(3)
    })
  })

  describe('#given CJK text', () => {
    it('#then estimates roughly 1.5 tokens per char', () => {
      // 2 CJK chars → 2 * 1.5 = 3 tokens
      const text = '你好'
      const tokens = estimateTokenCount(text)
      expect(tokens).toBe(3)
    })
  })

  describe('#given mixed CJK and ASCII', () => {
    it('#then sums both rates', () => {
      // "hello" = 5 * 0.25 = 1.25, "你好" = 2 * 1.5 = 3 → ceil(4.25) = 5
      const text = 'hello你好'
      const tokens = estimateTokenCount(text)
      expect(tokens).toBe(5)
    })
  })
})

describe('estimateMessagesTokens', () => {
  describe('#given string content messages', () => {
    it('#then includes role overhead per message', () => {
      const messages = [
        { role: 'user', content: 'hello world!' },
        { role: 'assistant', content: 'hi!' },
      ]
      const tokens = estimateMessagesTokens(messages)
      // message1: 4 (overhead) + 3 (text) = 7
      // message2: 4 (overhead) + 1 (ceil(4*0.25)) = 5
      expect(tokens).toBe(12)
    })
  })

  describe('#given array content with text part', () => {
    it('#then extracts text from parts', () => {
      const messages = [{ role: 'user', content: [{ type: 'text', text: 'test' }] }]
      const tokens = estimateMessagesTokens(messages)
      // 4 (overhead) + ceil(4*0.25) = 4 + 1 = 5
      expect(tokens).toBe(5)
    })
  })

  describe('#given array content with image part', () => {
    it('#then counts ~1000 tokens for image', () => {
      const messages = [{ role: 'user', content: [{ type: 'image' }] }]
      const tokens = estimateMessagesTokens(messages)
      // 4 (overhead) + 1000 (image) = 1004
      expect(tokens).toBe(1004)
    })
  })
})
