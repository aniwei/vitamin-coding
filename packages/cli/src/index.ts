import { runCli } from './cli'

const code = runCli()
if (code !== 0) {
  process.exitCode = code
}

export { runCli }
