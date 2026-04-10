import { APIClient } from './client'
import type { Provider } from '../types'

export class ProviderService extends APIClient {
  async list(): Promise<Provider[]> {
    throw new Error('Not implemented')
  }
}

export const provider = new ProviderService()

