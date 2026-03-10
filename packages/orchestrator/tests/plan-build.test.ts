// Plan 格式化 + Interview + Plan Storage 测试 (5.1.1, 5.1.2, 5.1.6)
import { describe, expect, it } from 'vitest'
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import {
  planToMarkdown,
  markdownToPlan,
} from '../src/agents/prometheus/plan-format'
import type { Plan, PlanStep } from '../src/agents/prometheus/plan-format'
import {
  createInterviewState,
  extractInterviewQuestions,
  buildInterviewPrompt,
} from '../src/agents/prometheus/interview'
import { createPlanStorage } from '../src/plan-build/plan-storage'

// ═══ Plan 格式化 ═══
describe('@vitamin/orchestrator Plan', () => {
  describe('#given planToMarkdown', () => {
    describe('#when 转换含依赖的计划', () => {
      const plan: Plan = {
        name: 'test-plan',
        title: 'Refactor Auth',
        description: 'Refactor the authentication system',
        steps: [
          {
            id: 'step-1',
            title: 'Analyze current auth',
            description: 'Review existing auth code',
            dependencies: [],
            estimatedMinutes: 10,
            status: 'pending',
          },
          {
            id: 'step-2',
            title: 'Implement new auth',
            description: 'Write new auth module',
            dependencies: ['step-1'],
            estimatedMinutes: 30,
            status: 'pending',
          },
        ],
        createdAt: 0,
        updatedAt: 0,
        metadata: {},
      }

      it('#then 生成 Markdown 含标题', () => {
        const md = planToMarkdown(plan)
        expect(md).toContain('# Refactor Auth')
      })

      it('#then 生成含 checkbox 的步骤', () => {
        const md = planToMarkdown(plan)
        expect(md).toContain('- [ ] **step-1**')
        expect(md).toContain('- [ ] **step-2**')
      })

      it('#then 包含依赖信息', () => {
        const md = planToMarkdown(plan)
        expect(md).toContain('(depends: step-1)')
      })

      it('#then 包含时间估计', () => {
        const md = planToMarkdown(plan)
        expect(md).toContain('(~10min)')
        expect(md).toContain('(~30min)')
      })

      // 5.1.2 验收: 完成的步骤标记为 [x]
      it('#then 已完成步骤标记 [x]', () => {
        const completedPlan = {
          ...plan,
          steps: [{ ...plan.steps[0]!, status: 'completed' as const }],
        }
        const md = planToMarkdown(completedPlan)
        expect(md).toContain('- [x] **step-1**')
      })
    })
  })

  describe('#given markdownToPlan', () => {
    describe('#when 解析标准格式 Markdown', () => {
      const markdown = `# Refactor Auth

Refactor the authentication system

## Steps

- [ ] **step-1**: Analyze current auth (~10min)
  Review existing auth code

- [ ] **step-2**: Implement new auth (depends: step-1) (~30min)
  Write new auth module
`

      it('#then 解析标题', () => {
        const plan = markdownToPlan('test', markdown)
        expect(plan.title).toBe('Refactor Auth')
      })

      it('#then 解析步骤', () => {
        const plan = markdownToPlan('test', markdown)
        expect(plan.steps).toHaveLength(2)
      })

      it('#then 解析依赖关系', () => {
        const plan = markdownToPlan('test', markdown)
        expect(plan.steps[1]?.dependencies).toContain('step-1')
      })

      it('#then 解析时间估计', () => {
        const plan = markdownToPlan('test', markdown)
        expect(plan.steps[0]?.estimatedMinutes).toBe(10)
      })
    })
  })

  // ═══ Interview ═══
  describe('#given Interview', () => {
    // 5.1.1 验收: Prometheus Interview 模式
    describe('#when 创建 Interview 状态', () => {
      it('#then 初始状态正确', () => {
        const state = createInterviewState('refactor auth', 'complexity: high')
        expect(state.userRequest).toBe('refactor auth')
        expect(state.metisContext).toBe('complexity: high')
        expect(state.questions).toHaveLength(0)
        expect(state.completed).toBe(false)
      })
    })

    describe('#when 从输出提取问题', () => {
      it('#then 提取 Q1/Q2/Q3 格式', () => {
        const output = 'Q1: What auth provider?\nQ2: Do you need MFA?\nQ3: Token or session?'
        const questions = extractInterviewQuestions(output)
        expect(questions.length).toBeGreaterThanOrEqual(3)
        expect(questions[0]?.question).toContain('auth provider')
      })

      it('#then 提取 "Question N:" 格式', () => {
        const output = 'Question 1: First question?\nQuestion 2: Second question?\nQuestion 3: Third?'
        const questions = extractInterviewQuestions(output)
        expect(questions.length).toBeGreaterThanOrEqual(3)
      })

      it('#then 提取问号结尾行', () => {
        const output = '- What is the current auth method?\n- How many users exist?\n- Is there a migration plan?'
        const questions = extractInterviewQuestions(output)
        expect(questions.length).toBeGreaterThanOrEqual(3)
      })
    })

    describe('#when 构建 Interview Prompt', () => {
      it('#then 包含用户请求和 Metis 上下文', () => {
        const state = createInterviewState('refactor auth', 'high complexity')
        const prompt = buildInterviewPrompt(state)
        expect(prompt).toContain('refactor auth')
        expect(prompt).toContain('high complexity')
      })

      it('#then 包含已回答的问题', () => {
        const state = createInterviewState('refactor auth', 'context')
        state.questions.push({
          question: 'What auth?',
          context: '',
          answered: true,
          answer: 'OAuth2',
        })
        const prompt = buildInterviewPrompt(state)
        expect(prompt).toContain('What auth?')
        expect(prompt).toContain('OAuth2')
      })
    })
  })

  // ═══ Plan Storage ═══
  // 5.1.6 验收: 计划文件持久化到 .vitamin/plans/
  describe('#given PlanStorage', () => {
    let tmpDir: string

    it('#then 保存并加载计划', async () => {
      tmpDir = await mkdtemp(join(tmpdir(), 'vitamin-plan-'))
      const storage = createPlanStorage(tmpDir)

      const plan: Plan = {
        name: 'refactor-auth',
        title: 'Refactor Auth',
        description: 'Auth refactoring plan',
        steps: [{
          id: 'step-1',
          title: 'Analyze',
          description: 'Analyze code',
          dependencies: [],
          estimatedMinutes: 5,
          status: 'pending',
        }],
        createdAt: Date.now(),
        updatedAt: Date.now(),
        metadata: {},
      }

      const path = await storage.save(plan)
      expect(path).toContain('refactor-auth.md')

      const loaded = await storage.load('refactor-auth')
      expect(loaded).toBeDefined()
      expect(loaded?.title).toBe('Refactor Auth')
      expect(loaded?.steps).toHaveLength(1)

      // 清理
      await rm(tmpDir, { recursive: true })
    })

    it('#then 列出所有计划', async () => {
      tmpDir = await mkdtemp(join(tmpdir(), 'vitamin-plan-'))
      const storage = createPlanStorage(tmpDir)

      const plan1: Plan = {
        name: 'plan-a',
        title: 'Plan A',
        description: 'First',
        steps: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
        metadata: {},
      }
      const plan2: Plan = {
        name: 'plan-b',
        title: 'Plan B',
        description: 'Second',
        steps: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
        metadata: {},
      }

      await storage.save(plan1)
      await storage.save(plan2)

      const names = await storage.list()
      expect(names).toContain('plan-a')
      expect(names).toContain('plan-b')

      await rm(tmpDir, { recursive: true })
    })

    it('#then 删除计划', async () => {
      tmpDir = await mkdtemp(join(tmpdir(), 'vitamin-plan-'))
      const storage = createPlanStorage(tmpDir)

      const plan: Plan = {
        name: 'to-delete',
        title: 'Delete Me',
        description: '',
        steps: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
        metadata: {},
      }

      await storage.save(plan)
      const removed = await storage.remove('to-delete')
      expect(removed).toBe(true)

      const loaded = await storage.load('to-delete')
      expect(loaded).toBeUndefined()

      await rm(tmpDir, { recursive: true })
    })

    it('#then 加载不存在的计划返回 undefined', async () => {
      tmpDir = await mkdtemp(join(tmpdir(), 'vitamin-plan-'))
      const storage = createPlanStorage(tmpDir)

      const loaded = await storage.load('nonexistent')
      expect(loaded).toBeUndefined()

      await rm(tmpDir, { recursive: true })
    })
  })
})
