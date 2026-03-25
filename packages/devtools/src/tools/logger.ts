

export class DevtoolsLogger {
  private serviceUrl: string

  constructor(serviceUrl: string) {
    this.serviceUrl = serviceUrl
  }

  publish(message: unknown) {
    fetch(this.serviceUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(message),
    })
  }
}