import { describe, expect, it } from 'vitest'
import { PersistenceError, RemotePersistenceError } from '../src/errors'

describe('PersistenceError', () => {
  it('#given a message #then sets name and message', () => {
    const error = new PersistenceError('disk full')

    expect(error.name).toBe('PersistenceError')
    expect(error.message).toBe('disk full')
    expect(error).toBeInstanceOf(Error)
    expect(error).toBeInstanceOf(PersistenceError)
  })

  it('#given a cause option #then preserves cause', () => {
    const cause = new Error('underlying')
    const error = new PersistenceError('wrapper', { cause })

    expect(error.cause).toBe(cause)
  })
})

describe('RemotePersistenceError', () => {
  it('#given a message and statusCode #then sets all fields', () => {
    const error = new RemotePersistenceError('not found', 404)

    expect(error.name).toBe('RemotePersistenceError')
    expect(error.message).toBe('not found')
    expect(error.statusCode).toBe(404)
  })

  it('#then is an instanceof PersistenceError', () => {
    const error = new RemotePersistenceError('server error', 500)

    expect(error).toBeInstanceOf(PersistenceError)
    expect(error).toBeInstanceOf(Error)
  })
})
