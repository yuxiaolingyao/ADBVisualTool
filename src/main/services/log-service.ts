import { spawn, type ChildProcess } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { IPC } from '@shared/api'
import type { LogActionResult, LogBatchPayload, LogStatusPayload } from '@shared/types'
import { getMainWindow } from '../window'

const FLUSH_INTERVAL_MS = 100
const MAX_PENDING_LINES = 20000
const MAX_STDERR = 4000

export class LogService {
  private child: ChildProcess | null = null
  private buffer = ''
  private pending: string[] = []
  private stderr = ''
  private history: string[] = []
  private flushTimer: NodeJS.Timeout | null = null
  private stopping = false

  start(adbPath: string, serial: string): LogActionResult {
    this.stop()
    this.buffer = ''
    this.pending = []
    this.stderr = ''
    this.history = []
    this.stopping = false

    let child: ChildProcess
    try {
      child = spawn(adbPath, ['-s', serial, 'logcat', '-v', 'time'], {
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe']
      })
    } catch (error) {
      return { ok: false, message: '启动日志抓取失败：' + errorMessage(error) }
    }

    this.child = child
    child.stdout?.setEncoding('utf8')
    child.stderr?.setEncoding('utf8')

    child.stdout?.on('data', (chunk: string) => {
      this.buffer += chunk
      const parts = this.buffer.split(/\r?\n/)
      this.buffer = parts.pop() ?? ''
      for (const line of parts) {
        if (line.length > 0) {
          this.pending.push(line)
          this.history.push(line)
        }
      }
      if (this.pending.length > MAX_PENDING_LINES) {
        this.pending.splice(0, this.pending.length - MAX_PENDING_LINES)
      }
      if (this.history.length > MAX_PENDING_LINES) {
        this.history.splice(0, this.history.length - MAX_PENDING_LINES)
      }
    })

    child.stderr?.on('data', (chunk: string) => {
      this.stderr = (this.stderr + chunk).slice(-MAX_STDERR)
    })

    child.on('error', (error) => {
      if (this.child !== child) return
      this.emitStatus({ running: false, error: '日志抓取失败：' + error.message })
    })

    child.on('close', (code) => {
      if (this.child !== child) return
      this.child = null
      this.stopFlush()
      this.flush()
      const error =
        !this.stopping && code !== 0
          ? this.stderr.trim().split(/\r?\n/).filter(Boolean).slice(-2).join(' ') ||
            '日志抓取已退出（退出码 ' + String(code) + '）'
          : undefined
      this.stopping = false
      this.emitStatus({ running: false, error })
    })

    this.startFlush()
    this.emitStatus({ running: true })
    return { ok: true, message: '开始抓取日志' }
  }

  stop(): void {
    if (!this.child) return
    this.stopping = true
    const child = this.child
    try {
      child.kill()
    } catch {
      // 进程可能已经退出
    }
    setTimeout(() => {
      if (this.child === child) {
        try {
          child.kill('SIGKILL')
        } catch {
          // 进程可能已经退出
        }
      }
    }, 2000)
  }

  getHistoryCount(): number {
    return this.history.length
  }

  clearHistory(): void {
    this.history = []
  }

  async saveToFile(filePath: string): Promise<{ lines: number }> {
    const lines = this.history.length
    await mkdir(dirname(filePath), { recursive: true })
    await writeFile(filePath, this.history.join('\n') + (lines > 0 ? '\n' : ''), 'utf8')
    return { lines }
  }

  dispose(): void {
    this.stop()
    this.stopFlush()
    this.pending = []
    this.buffer = ''
    this.history = []
  }

  private flush(): void {
    if (this.pending.length === 0) return
    const lines = this.pending.splice(0, this.pending.length)
    const window = getMainWindow()
    if (!window || window.isDestroyed()) return
    const payload: LogBatchPayload = { lines, receivedAt: Date.now() }
    window.webContents.send(IPC.logBatch, payload)
  }

  private emitStatus(status: LogStatusPayload): void {
    const window = getMainWindow()
    if (!window || window.isDestroyed()) return
    window.webContents.send(IPC.logStatus, status)
  }

  private startFlush(): void {
    this.stopFlush()
    this.flushTimer = setInterval(() => this.flush(), FLUSH_INTERVAL_MS)
  }

  private stopFlush(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer)
      this.flushTimer = null
    }
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export const logService = new LogService()
