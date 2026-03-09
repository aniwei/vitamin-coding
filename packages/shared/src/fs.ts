// 文件系统工具 —— 异步读写、mkdirp、rimraf
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

// 以 UTF-8 读取文件，文件不存在时返回 undefined
export async function readText(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, 'utf-8')
  } catch (error) {
    if (isNodeError(error) && error.code === 'ENOENT') {
      return undefined
    }
    throw error
  }
}

// 将 UTF-8 字符串写入文件，自动创建父目录
export async function writeText(path: string, content: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, content, 'utf-8')
}

// 递归创建目录（等同于 mkdir -p）
export async function mkdirp(path: string): Promise<void> {
  await mkdir(path, { recursive: true })
}

// 递归删除路径（等同于 rm -rf）
export async function rimraf(path: string): Promise<void> {
  await rm(path, { recursive: true, force: true })
}

// 检查路径是否存在
export async function exists(path: string): Promise<boolean> {
  try {
    await stat(path)
    return true
  } catch (error) {
    if (isNodeError(error) && error.code === 'ENOENT') {
      return false
    }
    throw error
  }
}


// 检查路径是否为目录
export async function isDirectory(path: string): Promise<boolean> {
  try {
    const info = await stat(path)
    return info.isDirectory()
  } catch (error) {
    if (isNodeError(error) && error.code === 'ENOENT') {
      return false
    }
    throw error
  }
}

// 检查路径是否为普通文件
export async function isFile(path: string): Promise<boolean> {
  try {
    const info = await stat(path)
    return info.isFile()
  } catch (error) {
    if (isNodeError(error) && error.code === 'ENOENT') {
      return false
    }
    throw error
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error
}
