

import type { DevtoolsService } from '../service'

export class DevtoolsLogger {
  public readonly serviceUrl: string
  private readonly service: DevtoolsService

  constructor(service: DevtoolsService) {
    this.service = service
    this.serviceUrl = service.loggerUrl
  }

  publish(message: unknown) {
    this.service.publishLogger(message)
  }
}