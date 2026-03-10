import { readText, writeText } from '@vitamin/shared'

export interface ConfigStore {
  read(path: string): Promise<string | undefined>
  write(path: string, content: string): Promise<void>
}

export class FileSystem implements ConfigStore {
  async read(path: string): Promise<string | undefined> {
    return readText(path)
  }

  async write(path: string, content: string): Promise<void> {
    await writeText(path, content)
  }
}
