import type { Service } from '../service'

export class Logger {
  private readonly service: Service

  constructor(service: Service) {
    this.service = service
  }

  publish(message: unknown) {
    this.service.logger(message)
  }
}
