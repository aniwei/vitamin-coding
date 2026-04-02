import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

/** Built-in prompts directory path (published alongside dist) */
export const BUILTIN_PROMPTS_DIR = resolve(__dirname, '..', 'prompts')
