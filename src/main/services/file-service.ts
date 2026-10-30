import { spawn } from 'node:child_process'
import { app } from 'electron'
import { mkdir } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { IPC } from '@shared/api'
import type { FileActionResult, FileEntry, FileListResult, FileTransferResult } from '@shared/types'
import { adbFailureMessage, runAdb } from './adb-client'
import { getMainWindow } from '../window'

function validRemotePath(value: string): string {
  const path = value.trim()
  if (!path.startsWith('/') || path.includes('..')) {
    throw new Error('手机路径必须是绝对路径，且不能包含 ..')
  }
  return path.replace(/\/+$/, '') || '/'
}

function validName(value: string): string {
  const name = value.trim()
  if (!name || name === '.' || name === '..' || /[\/\\;|&$'"<>`]/.test(name)) {
    throw new Error('名称不能为空，也不能包含路径或 shell 特殊字符')
  }
  return name
}

const SAFE_ROOTS = ['/sdcard', '/storage/emulated/0']

function underSafeRoot(path: string): boolean {
  return SAFE_ROOTS.some((root) => path === root || path.startsWith(root + '/'))
}

function assertSafeParent(path: string): void {
  if (!underSafeRoot(path)) {
    throw new Error('只允许在 /sdcard 或 /storage/emulated/0 下修改文件')
  }
}

function assertEditable(path: string): void {
  if (!underSafeRoot(path) || SAFE_ROOTS.includes(path)) {
    throw new Error('只允许修改 /sdcard 或 /storage/emulated/0 下的文件')
  }
}

function childPath(parent: string, name: string): string {
  return parent === '/' ? '/' + name : parent + '/' + name
}

export class FileService {
  async listFiles(adbPath: string, serial: string, remotePath: string): Promise<FileListResult> {
    try {
      const path = validRemotePath(remotePath)
      const result = await runAdb(
        adbPath,
        ['-s', serial, 'shell', 'ls', '-la', path],
        { timeoutMs: 20000 }
      )
      if (!result.ok) return { ok: false, message: adbFailureMessage(result) }
      const entries: FileEntry[] = []
      const pattern =
        /^([dl-])([rwxst-]{9})\s+\d+\s+\S+\s+\S+\s+(\d+)\s+(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})\s+(.+)$/
      for (const line of result.stdout.split(/\r?\n/)) {
        const match = line.match(pattern)
        if (!match) continue
        let name = match[6]
        let type: FileEntry['type'] = match[1] === 'd' ? 'dir' : match[1] === 'l' ? 'link' : 'file'
        if (type === 'link') {
          const arrow = name.indexOf(' -> ')
          if (arrow >= 0) name = name.slice(0, arrow)
        }
        if (!name || name === '.' || name === '..') continue
        const childPath = path === '/' ? '/' + name : path + '/' + name
        entries.push({
          name,
          path: childPath,
          type,
          size: Number(match[3]) || 0,
          modified: match[4] + ' ' + match[5]
        })
      }
      entries.sort((a, b) => {
        if (a.type !== b.type) {
          if (a.type === 'dir') return -1
          if (b.type === 'dir') return 1
        }
        return a.name.localeCompare(b.name)
      })
      return { ok: true, message: '共 ' + entries.length + ' 项', path, entries }
    } catch (error) {
      return { ok: false, message: '读取目录失败：' + String(error) }
    }
  }

  async downloadFile(
    adbPath: string,
    serial: string,
    remotePath: string
  ): Promise<FileTransferResult> {
    try {
      const remote = validRemotePath(remotePath)
      const name = basename(remote)
      const directory = join(app.getPath('downloads'), 'ADB工具箱', 'files')
      await mkdir(directory, { recursive: true })
      const localPath = join(directory, name)
      const send = (percent: number, message?: string): void => {
        getMainWindow()?.webContents.send(IPC.filesProgress, {
          operation: 'download',
          name,
          percent,
          message
        })
      }

      const result = await new Promise<{ ok: boolean; message: string }>((resolve) => {
        const child = spawn(
          adbPath,
          ['-s', serial, 'pull', remote, localPath],
          { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }
        )
        let output = ''
        let settled = false
        const timer = setTimeout(() => {
          try { child.kill() } catch { /* 进程可能已经退出 */ }
          if (!settled) {
            settled = true
            resolve({ ok: false, message: '下载超时' })
          }
        }, 300000)
        const onData = (chunk: Buffer): void => {
          const text = chunk.toString('utf8')
          output += text
          const match = text.match(/\[\s*(\d+)%\]/)
          if (match) send(Number(match[1]))
        }
        child.stdout.on('data', onData)
        child.stderr.on('data', onData)
        child.on('error', (error) => {
          if (settled) return
          settled = true
          clearTimeout(timer)
          resolve({ ok: false, message: error.message })
        })
        child.on('close', (code) => {
          if (settled) return
          settled = true
          clearTimeout(timer)
          if (code === 0) resolve({ ok: true, message: '下载完成' })
          else resolve({ ok: false, message: output.split(/\r?\n/).filter(Boolean).pop() || '下载失败' })
        })
      })
      send(result.ok ? 100 : 0, result.message)
      return { ...result, filePath: result.ok ? localPath : undefined }
    } catch (error) {
      return { ok: false, message: '下载失败：' + String(error) }
    }
  }

  async createFolder(
    adbPath: string,
    serial: string,
    parentPath: string,
    name: string
  ): Promise<FileActionResult> {
    try {
      const parent = validRemotePath(parentPath)
      assertSafeParent(parent)
      const folderName = validName(name)
      const target = childPath(parent, folderName)
      const exists = await runAdb(
        adbPath,
        ['-s', serial, 'shell', 'test', '-e', target],
        { timeoutMs: 10000 }
      )
      if (exists.ok) return { ok: false, message: '同名文件或目录已存在' }
      const result = await runAdb(
        adbPath,
        ['-s', serial, 'shell', 'mkdir', target],
        { timeoutMs: 15000 }
      )
      return {
        ok: result.ok,
        message: result.ok ? '目录已创建' : adbFailureMessage(result),
        path: result.ok ? target : undefined
      }
    } catch (error) {
      return { ok: false, message: '新建目录失败：' + String(error) }
    }
  }

  async rename(
    adbPath: string,
    serial: string,
    remotePath: string,
    newName: string
  ): Promise<FileActionResult> {
    try {
      const source = validRemotePath(remotePath)
      assertEditable(source)
      const name = validName(newName)
      const parent = source.slice(0, source.lastIndexOf('/')) || '/'
      const target = childPath(parent, name)
      if (source === target) return { ok: true, message: '名称未变化', path: source }
      const exists = await runAdb(
        adbPath,
        ['-s', serial, 'shell', 'test', '-e', target],
        { timeoutMs: 10000 }
      )
      if (exists.ok) return { ok: false, message: '目标名称已存在' }
      const result = await runAdb(
        adbPath,
        ['-s', serial, 'shell', 'mv', source, target],
        { timeoutMs: 20000 }
      )
      return {
        ok: result.ok,
        message: result.ok ? '重命名成功' : adbFailureMessage(result),
        path: result.ok ? target : undefined
      }
    } catch (error) {
      return { ok: false, message: '重命名失败：' + String(error) }
    }
  }

  async deletePath(
    adbPath: string,
    serial: string,
    remotePath: string
  ): Promise<FileActionResult> {
    try {
      const target = validRemotePath(remotePath)
      assertEditable(target)
      const result = await runAdb(
        adbPath,
        ['-s', serial, 'shell', 'rm', '-rf', target],
        { timeoutMs: 30000 }
      )
      return {
        ok: result.ok,
        message: result.ok ? '删除成功' : adbFailureMessage(result),
        path: target
      }
    } catch (error) {
      return { ok: false, message: '删除失败：' + String(error) }
    }
  }

  async uploadFiles(
    adbPath: string,
    serial: string,
    remoteDir: string,
    localPaths: string[]
  ): Promise<FileTransferResult> {
    try {
      const directory = validRemotePath(remoteDir)
      let count = 0
      for (const localPath of localPaths) {
        const name = basename(localPath)
        getMainWindow()?.webContents.send(IPC.filesProgress, {
          operation: 'upload',
          name,
          percent: 0
        })
        const result = await runAdb(
          adbPath,
          ['-s', serial, 'push', localPath, directory.replace(/\/$/, '') + '/' + name],
          { timeoutMs: 300000 }
        )
        if (!result.ok) {
          return { ok: false, message: '上传 ' + name + ' 失败：' + adbFailureMessage(result) }
        }
        count += 1
        getMainWindow()?.webContents.send(IPC.filesProgress, {
          operation: 'upload',
          name,
          percent: 100
        })
      }
      return { ok: true, message: '已上传 ' + count + ' 个文件', count }
    } catch (error) {
      return { ok: false, message: '上传失败：' + String(error) }
    }
  }
}

export const fileService = new FileService()
