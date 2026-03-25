import { createLogger } from '@vitamin/shared'
import { createVitamin } from '../src'


const vitamin = createVitamin({
  port: 3000,
  inspect: true,
  logger: {
    name: 'vitamin-app',
    level: 'trace',
    destination: 'vitamin-app.log'
  }
})

vitamin.start().then(() => {
  const session = vitamin.createSession()

  vitamin.listSessions().then(sessions => {})
  vitamin.getSession('session-id').then(session => {})

})