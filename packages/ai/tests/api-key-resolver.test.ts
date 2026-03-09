import { describe, expect, it } from 'vitest'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { resolveApiKey } from '../src/api-key-resolver'

describe('resolveApiKey', () => {
  describe('#given explicit key', () => {
    describe('#when resolve is called', () => {
      it('#then returns explicit key first', async () => {
        const key = await resolveApiKey(
          'openai',
          {
            getApiKey: async () => 'dynamic-key',
            keys: { openai: 'static-key' },
          },
          'explicit-key',
        )

        expect(key).toBe('explicit-key')
      })
    })
  })

  describe('#given dynamic getter', () => {
    describe('#when explicit key is absent', () => {
      it('#then returns key from getter', async () => {
        const key = await resolveApiKey('openai', {
          getApiKey: async () => 'dynamic-key',
          keys: { openai: 'static-key' },
        })

        expect(key).toBe('dynamic-key')
      })
    })
  })

  describe('#given static key map only', () => {
    describe('#when getter returns undefined', () => {
      it('#then falls back to static map', async () => {
        const key = await resolveApiKey('openai', {
          getApiKey: async () => undefined,
          keys: { openai: 'static-key' },
        })

        expect(key).toBe('static-key')
      })
    })
  })

  describe('#given environment variable', () => {
    describe('#when no explicit/getter/static key exists', () => {
      it('#then uses environment variable', async () => {
        const prev = process.env.OPENAI_API_KEY
        process.env.OPENAI_API_KEY = 'env-key'

        try {
          const key = await resolveApiKey('openai')
          expect(key).toBe('env-key')
        } finally {
          if (prev === undefined) {
            process.env.OPENAI_API_KEY = undefined
          } else {
            process.env.OPENAI_API_KEY = prev
          }
        }
      })
    })
  })

  describe('#given ollama provider', () => {
    describe('#when no key source exists', () => {
      it('#then returns empty key', async () => {
        const key = await resolveApiKey('ollama')
        expect(key).toBe('')
      })
    })
  })

  describe('#given non-ollama provider without any key', () => {
    describe('#when resolve is called', () => {
      it('#then throws key missing error', async () => {
        const prev = process.env.OPENAI_API_KEY
        delete process.env.OPENAI_API_KEY

        try {
          await expect(resolveApiKey('openai')).rejects.toThrow('API key not found')
        } finally {
          if (prev !== undefined) process.env.OPENAI_API_KEY = prev
        }
      })
    })
  })

  describe('#given copilot oauth auth storage', () => {
    describe('#when github token env is absent', () => {
      it('#then loads token from ~/.config/vitamin/auth.json', async () => {
        const prevAuthFile = process.env.VITAMIN_AUTH_FILE
        const prevGithubToken = process.env.GITHUB_TOKEN
        const tempHome = join(process.cwd(), '.tmp-test-home-api-key-resolver')
        const authDir = join(tempHome, '.config', 'vitamin')
        const authFile = join(authDir, 'auth.json')

        delete process.env.GITHUB_TOKEN
        process.env.VITAMIN_AUTH_FILE = authFile

        await mkdir(authDir, { recursive: true })
        await writeFile(
          authFile,
          JSON.stringify(
            {
              'github-copilot': {
                type: 'oauth',
                refresh: 'oauth-token',
                access: 'oauth-token',
                expires: 0,
              },
            },
            null,
            2,
          ) + '\n',
        )

        try {
          const key = await resolveApiKey('github-copilot')
          expect(key).toBe('oauth-token')
        } finally {
          if (prevAuthFile === undefined) {
            delete process.env.VITAMIN_AUTH_FILE
          } else {
            process.env.VITAMIN_AUTH_FILE = prevAuthFile
          }

          if (prevGithubToken === undefined) {
            delete process.env.GITHUB_TOKEN
          } else {
            process.env.GITHUB_TOKEN = prevGithubToken
          }

          await rm(tempHome, { recursive: true, force: true })
        }
      })
    })
  })
})
