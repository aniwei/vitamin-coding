import { APIClient } from './client'

export class ToolsService extends APIClient {
  async list() {

  }
}

export const tools = new ToolsService()