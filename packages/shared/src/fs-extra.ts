// 文件系统工具 —— 异步读写、mkdirp、rimraf
import { 
  mkdir, 
  rm, 
  stat
} from 'node:fs/promises'
import { lookup } from 'mime-types'

// 支持的图片扩展名列表
export async function mime(path: string): Promise<string> {
  return lookup(path) || 'application/octet-stream'
}

// 递归创建目录
export async function mkdirp(path: string): Promise<void> {
  await mkdir(path, { recursive: true })
}

// 递归删除路径
export async function rimraf(path: string): Promise<void> {
  await rm(path, { recursive: true, force: true })
}

// 检查路径是否存在
export async function exists(path: string): Promise<boolean> {
  await stat(path)
  return true
}

// 检查路径是否为目录
export async function isDirectory(path: string): Promise<boolean> {
  const info = await stat(path)
  return info.isDirectory()
}

// 检查路径是否为普通文件
export async function isFile(path: string): Promise<boolean> {
  const info = await stat(path)
  return info.isFile()
}
