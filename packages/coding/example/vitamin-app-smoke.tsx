import { createVitamin } from '../src'

async function main() {
  const vitamin = createVitamin({
    port: 3000,
    inspect: false,
    logger: {
      name: 'vitamin-app-smoke',
      level: 'info',
      destination: 'vitamin-app-smoke.log',
    },
    model: {
      id: 'claude-sonnet-4-20250514',
      name: 'Claude Sonnet 4',
      provider: 'anthropic',
      api: 'anthropic-messages',
      baseUrl: 'https://api.anthropic.com',
      reasoning: true,
      input: ['text'],
      cost: {
        input: 3,
        output: 15,
        cacheRead: 0.3,
        cacheWrite: 3.75,
      },
      contextWindow: 200_000,
      maxOutputTokens: 8_192,
    },
    systemPrompt: 'You are a helpful coding assistant.',
  })

  await vitamin.start()
  console.log('Vitamin smoke example started successfully')
  await vitamin.stop()
  console.log('Vitamin smoke example stopped successfully')
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
