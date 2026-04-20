import { execSync } from 'child_process'
import { getUserCount } from '../helpers/clear-users'

async function globalSetup() {
  // Skip seeding if we're running first-user tests
  if (process.env.SKIP_SEEDING === 'true') {
    console.log('⏭️  Skipping user seeding for first-user tests')
    return
  }

  console.log('\n🌱 Global Setup: Checking if users need to be seeded...')
  const userCount = await getUserCount()
  console.log(`📊 Current user count: ${userCount}`)

  if (userCount < 3) {
    console.log('⚠️  Not enough test users, running seed script...')
    try {
      execSync('pnpm test:e2e:seed', { stdio: 'inherit' })
      console.log('✅ Test users seeded successfully')
    } catch (error) {
      console.error('❌ Failed to seed test users:', error)
      throw error
    }
  } else {
    console.log('✅ Test users already exist')
  }
}

export default globalSetup
