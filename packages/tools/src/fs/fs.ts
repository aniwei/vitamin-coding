import { createRead, type ReadOptions } from './read'
import { createWrite, type WriteOptions } from './write'
import { createEdit, type EditOptions  } from './edit'

export type FsOptions = {
  readOptions: ReadOptions
  writeOptions: WriteOptions 
  editOptions: EditOptions
}

export const createFs = (projectRoot: string, options: FsOptions) => {
  const { readOptions, writeOptions, editOptions } = options

  return [
    createRead(projectRoot, readOptions),
    createWrite(projectRoot, writeOptions),
    createEdit(projectRoot, editOptions)
  ]
}