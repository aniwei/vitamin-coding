import { runCli } from './cli'

runCli().then((code) => {
  if (code !== 0) {
    process.exitCode = code
  }
}).catch((err) => {
  process.stderr.write(`x-mars: ${err instanceof Error ? err.message : String(err)}\n`)
  process.exitCode = 1
})

export { runCli }
