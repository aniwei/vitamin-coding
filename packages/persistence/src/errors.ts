export class PersistenceError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = 'PersistenceError'
  }
}

export class RemotePersistenceError extends PersistenceError {
  public readonly statusCode: number

  constructor(message: string, statusCode: number) {
    super(message)
    this.name = 'RemotePersistenceError'
    this.statusCode = statusCode
  }
}
