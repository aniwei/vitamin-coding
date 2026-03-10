// Prometheus Interview — 自动预研 + 用户提问（≥ 3 个问题）

// Interview 阶段的问题
export interface InterviewQuestion {
  question: string
  context: string
  answered: boolean
  answer?: string
}

// Interview 状态
export interface InterviewState {
  userRequest: string
  metisContext: string
  questions: InterviewQuestion[]
  autoResearchNotes: string[]
  completed: boolean
}

// 创建初始 interview 状态
export function createInterviewState(
  userRequest: string,
  metisContext: string,
): InterviewState {
  return {
    userRequest,
    metisContext,
    questions: [],
    autoResearchNotes: [],
    completed: false,
  }
}

// 从 Prometheus 输出中提取 interview 问题
export function extractInterviewQuestions(output: string): InterviewQuestion[] {
  const questions: InterviewQuestion[] = []
  // 匹配 "Q1:", "Q2:", "Question 1:" 等格式
  const questionPattern = /(?:Q\d+|Question\s+\d+)[.:]\s*(.+?)(?=\n(?:Q\d+|Question\s+\d+)[.:]|\n\n|$)/gs

  let match = questionPattern.exec(output)
  while (match) {
    const text = match[1]
    if (text) {
      questions.push({
        question: text.trim(),
        context: '',
        answered: false,
      })
    }
    match = questionPattern.exec(output)
  }

  // 如果上面的模式没匹配到，尝试逐行 "? " 格式
  if (questions.length === 0) {
    const lines = output.split('\n')
    for (const line of lines) {
      const trimmed = line.trim()
      if (trimmed.endsWith('?') && trimmed.length > 10) {
        questions.push({
          question: trimmed.replace(/^[-*•]\s*/, ''),
          context: '',
          answered: false,
        })
      }
    }
  }

  return questions
}

// 构建带有 interview 上下文的 prompt
export function buildInterviewPrompt(state: InterviewState): string {
  const parts: string[] = [
    `## 用户请求\n${state.userRequest}`,
    '',
    `## 预分析上下文（来自 Metis）\n${state.metisContext}`,
  ]

  if (state.autoResearchNotes.length > 0) {
    parts.push('')
    parts.push(`## 自动预研笔记\n${state.autoResearchNotes.join('\n')}`)
  }

  if (state.questions.length > 0) {
    parts.push('')
    parts.push('## 访谈问答')
    for (const q of state.questions) {
      parts.push(`**问：** ${q.question}`)
      if (q.answered && q.answer) {
        parts.push(`**答：** ${q.answer}`)
      }
    }
  }

  parts.push('')
  parts.push(
    '基于以上上下文，生成一个包含步骤、依赖关系和时间估算的全面计划。',
  )

  return parts.join('\n')
}
