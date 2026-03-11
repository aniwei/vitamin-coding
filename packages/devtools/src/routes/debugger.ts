import { Hono } from 'hono'
import { type Devtools } from '../types'

export const createDebuggerRoute = (devtools: Devtools) => {
  const app = new Hono()

  app.get('/paused', (c) => {
    return new Promise((resolve) => {
      

      devtools.once('Debugger.stepOver', () => {
        resolve()
      })

      devtools.emit('Debugger.paused')
    })
  })

  return app
}

