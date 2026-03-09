// 内置模型静态数据库
// 包含 Anthropic, OpenAI, Google, xAI, DeepSeek, Moonshot, Ollama 等主流模型

import type { Model } from './types'

// Anthropic 模型
const anthropicModels: Model[] = [
  {
    id: 'anthropic/claude-opus-4-6',
    name: 'Claude Opus 4.6',
    api: 'anthropic-messages',
    provider: 'anthropic',
    baseUrl: 'https://api.anthropic.com',
    reasoning: true,
    input: ['text', 'image'],
    cost: { input: 15, output: 75, cacheRead: 1.5, cacheWrite: 18.75 },
    contextWindow: 200000,
    maxOutputTokens: 64000,
    thinkingLevels: ['minimal', 'low', 'medium', 'high', 'xhigh'],
  },
  {
    id: 'anthropic/claude-sonnet-4-6',
    name: 'Claude Sonnet 4.6',
    api: 'anthropic-messages',
    provider: 'anthropic',
    baseUrl: 'https://api.anthropic.com',
    reasoning: true,
    input: ['text', 'image'],
    cost: { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },
    contextWindow: 200000,
    maxOutputTokens: 64000,
    thinkingLevels: ['minimal', 'low', 'medium', 'high'],
  },
  {
    id: 'anthropic/claude-haiku-4-5',
    name: 'Claude Haiku 4.5',
    api: 'anthropic-messages',
    provider: 'anthropic',
    baseUrl: 'https://api.anthropic.com',
    reasoning: false,
    input: ['text', 'image'],
    cost: { input: 0.8, output: 4, cacheRead: 0.08, cacheWrite: 1 },
    contextWindow: 200000,
    maxOutputTokens: 8192,
  },
]

// OpenAI 模型
const openaiModels: Model[] = [
  {
    id: 'openai/gpt-5.3-codex',
    name: 'GPT-5.3 Codex',
    api: 'openai-responses',
    provider: 'openai',
    baseUrl: 'https://api.openai.com',
    reasoning: true,
    input: ['text', 'image'],
    cost: { input: 10, output: 50, cacheRead: 2.5, cacheWrite: 12.5 },
    contextWindow: 200000,
    maxOutputTokens: 64000,
    thinkingLevels: ['low', 'medium', 'high'],
  },
  {
    id: 'openai/gpt-5.2',
    name: 'GPT-5.2',
    api: 'openai-responses',
    provider: 'openai',
    baseUrl: 'https://api.openai.com',
    reasoning: true,
    input: ['text', 'image'],
    cost: { input: 5, output: 25, cacheRead: 1.25, cacheWrite: 6.25 },
    contextWindow: 128000,
    maxOutputTokens: 32000,
    thinkingLevels: ['low', 'medium', 'high'],
  },
  {
    id: 'openai/gpt-4.1-mini',
    name: 'GPT-4.1 Mini',
    api: 'openai-completions',
    provider: 'openai',
    baseUrl: 'https://api.openai.com',
    reasoning: false,
    input: ['text', 'image'],
    cost: { input: 0.4, output: 1.6, cacheRead: 0.1, cacheWrite: 0.5 },
    contextWindow: 128000,
    maxOutputTokens: 16384,
  },
  {
    id: 'openai/o3',
    name: 'O3',
    api: 'openai-responses',
    provider: 'openai',
    baseUrl: 'https://api.openai.com',
    reasoning: true,
    input: ['text', 'image'],
    cost: { input: 10, output: 40, cacheRead: 2.5, cacheWrite: 10 },
    contextWindow: 200000,
    maxOutputTokens: 100000,
    thinkingLevels: ['low', 'medium', 'high'],
  },
]

// Google 模型
const googleModels: Model[] = [
  {
    id: 'google/gemini-3.1-pro',
    name: 'Gemini 3.1 Pro',
    api: 'google-generative-ai',
    provider: 'google',
    baseUrl: 'https://generativelanguage.googleapis.com',
    reasoning: true,
    input: ['text', 'image', 'audio'],
    cost: { input: 1.25, output: 5, cacheRead: 0.3, cacheWrite: 1.5 },
    contextWindow: 2000000,
    maxOutputTokens: 65536,
    thinkingLevels: ['low', 'medium', 'high'],
  },
  {
    id: 'google/gemini-3.1-flash',
    name: 'Gemini 3.1 Flash',
    api: 'google-generative-ai',
    provider: 'google',
    baseUrl: 'https://generativelanguage.googleapis.com',
    reasoning: false,
    input: ['text', 'image', 'audio'],
    cost: { input: 0.15, output: 0.6, cacheRead: 0.04, cacheWrite: 0.15 },
    contextWindow: 1000000,
    maxOutputTokens: 32768,
  },
]

// xAI 模型
const xaiModels: Model[] = [
  {
    id: 'xai/grok-code-fast',
    name: 'Grok Code Fast',
    api: 'openai-completions',
    provider: 'xai',
    baseUrl: 'https://api.x.ai',
    reasoning: false,
    input: ['text'],
    cost: { input: 0.3, output: 1.5, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 131072,
    maxOutputTokens: 16384,
  },
]

// DeepSeek 模型
const deepseekModels: Model[] = [
  {
    id: 'deepseek/deepseek-chat',
    name: 'DeepSeek Chat',
    api: 'openai-completions',
    provider: 'deepseek',
    baseUrl: 'https://api.deepseek.com',
    reasoning: false,
    input: ['text'],
    cost: { input: 0.27, output: 1.1, cacheRead: 0.07, cacheWrite: 0.27 },
    contextWindow: 128000,
    maxOutputTokens: 8192,
  },
  {
    id: 'deepseek/deepseek-reasoner',
    name: 'DeepSeek Reasoner',
    api: 'openai-completions',
    provider: 'deepseek',
    baseUrl: 'https://api.deepseek.com',
    reasoning: true,
    input: ['text'],
    cost: { input: 0.55, output: 2.19, cacheRead: 0.14, cacheWrite: 0.55 },
    contextWindow: 128000,
    maxOutputTokens: 8192,
    thinkingLevels: ['medium', 'high'],
  },
]

// Moonshot 模型
const moonshotModels: Model[] = [
  {
    id: 'moonshot/kimi-k2.5',
    name: 'Kimi K2.5',
    api: 'openai-completions',
    provider: 'moonshot',
    baseUrl: 'https://api.moonshot.cn',
    reasoning: false,
    input: ['text', 'image'],
    cost: { input: 0.6, output: 2.4, cacheRead: 0.15, cacheWrite: 0.6 },
    contextWindow: 131072,
    maxOutputTokens: 16384,
  },
]

// GitHub Copilot 模型
const copilotModels: Model[] = [
  {
    id: 'github-copilot/gpt-4.1',
    name: 'Copilot GPT-4.1',
    api: 'github-copilot',
    provider: 'github-copilot',
    baseUrl: 'https://api.githubcopilot.com',
    reasoning: false,
    input: ['text'],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 128000,
    maxOutputTokens: 16384,
  },
  {
    id: 'github-copilot/gpt-4o',
    name: 'Copilot GPT-4o',
    api: 'github-copilot',
    provider: 'github-copilot',
    baseUrl: 'https://api.githubcopilot.com',
    reasoning: false,
    input: ['text', 'image'],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 128000,
    maxOutputTokens: 16384,
  },
  {
    id: 'github-copilot/o4-mini',
    name: 'Copilot o4-mini',
    api: 'github-copilot',
    provider: 'github-copilot',
    baseUrl: 'https://api.githubcopilot.com',
    reasoning: true,
    input: ['text'],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 200000,
    maxOutputTokens: 100000,
    thinkingLevels: ['low', 'medium', 'high'],
  },
  {
    id: 'github-copilot/claude-sonnet-4',
    name: 'Copilot Claude Sonnet 4',
    api: 'github-copilot',
    provider: 'github-copilot',
    baseUrl: 'https://api.githubcopilot.com',
    reasoning: true,
    input: ['text'],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 200000,
    maxOutputTokens: 16384,
    thinkingLevels: ['low', 'medium', 'high'],
  },
  {
    id: 'github-copilot/gemini-2.5-pro',
    name: 'Copilot Gemini 2.5 Pro',
    api: 'github-copilot',
    provider: 'github-copilot',
    baseUrl: 'https://api.githubcopilot.com',
    reasoning: true,
    input: ['text'],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 1000000,
    maxOutputTokens: 65536,
    thinkingLevels: ['low', 'medium', 'high'],
  },
]

// Ollama 本地模型（模板，实际模型通过 API 发现）
const ollamaModels: Model[] = [
  {
    id: 'ollama/llama3.3',
    name: 'Llama 3.3 (Local)',
    api: 'ollama',
    provider: 'ollama',
    baseUrl: 'http://localhost:11434',
    reasoning: false,
    input: ['text'],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 131072,
    maxOutputTokens: 4096,
  },
  {
    id: 'ollama/qwen3',
    name: 'Qwen 3 (Local)',
    api: 'ollama',
    provider: 'ollama',
    baseUrl: 'http://localhost:11434',
    reasoning: true,
    input: ['text'],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 131072,
    maxOutputTokens: 8192,
    thinkingLevels: ['low', 'medium', 'high'],
  },
]

// 全部内置模型
export const BUILTIN_MODELS: Model[] = [
  ...anthropicModels,
  ...openaiModels,
  ...googleModels,
  ...xaiModels,
  ...deepseekModels,
  ...moonshotModels,
  ...copilotModels,
  ...ollamaModels,
]
