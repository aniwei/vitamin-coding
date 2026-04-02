import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

/** 内置 prompts 目录路径（包发布时随 dist 同级） */
export const BUILTIN_PROMPTS_DIR = resolve(__dirname, '..', 'prompts')
