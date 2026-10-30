import { spawn, type ChildProcess } from 'node:child_process'
import { createWriteStream, mkdirSync, type WriteStream } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { CommandResult, MonkeyStatus } from '@shared/types'
import { runAdb } from './adb-client'

const STOP_TIMEOUT_MS = 12000
const MAX_OUTPUT = 200000

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function stamp(): string {
  const now = new Date()
  const pad = (value: number): string => String(value).padStart(2, '0')
  return (
    String(now.getFullYear()) +
    pad(now.getMonth() + 1) +
    pad(now.getDate()) +
    '-' +
    pad(now.getHours()) +
    pad(now.getMinutes()) +
    pad(now.getSeconds())
  )
}

function safeName(value: string): string {
  return value.replace(/[^A-Za-z0-9_.-]/g, '_')
}

function fileStamp(): string {
  return stamp() + '-' + String(new Date().getMilliseconds()).padStart(3, '0')
}

function parsePid(output: string): string | null {
  const match = output.match(/\b(\d{2,})\b/)
  return match ? match[1] : null
}

export class MonkeyService {
  private child: ChildProcess | null = null
  private adbPath: string | null = null
  private serial: string | null = null
  private packageName: string | null = null
  private outputDir: string | null = null
  private startedAt: number | null = null
  private count: number | null = null
  private output = ''
  private logcat: ChildProcess | null = null
  private logStream: WriteStream | null = null
  private logPath: string | undefined
  private stopRequested = false
  private state: MonkeyStatus = { running: false }
  private finalizePromise: Promise<CommandResult> | null = null
  private finalizeResolve: ((result: CommandResult) => void) | null = null

  start(
    adbPath: string,
    serial: string,
    packageName: string,
    count: number,
    throttle: number,
    seed: number | undefined,
    outputDir: string
  ): CommandResult {
    if (this.child) return { ok: false, message: 'Monkey 正在运行，请先停止' }
    const safeCount = Math.max(1, Math.min(100000, Math.round(count)))
    const safeThrottle = Math.max(0, Math.min(2000, Math.round(throttle)))
    const args = [
      '-s', serial,
      'shell', 'monkey',
      '-p', packageName,
      '--throttle', String(safeThrottle)
    ]
    if (seed !== undefined && Number.isFinite(seed)) {
      args.push('-s', String(Math.round(seed)))
    }
    args.push('-v', '-v', String(safeCount))

    let logcat: ChildProcess | null = null
    let logStream: WriteStream | null = null
    try {
      mkdirSync(outputDir, { recursive: true })
      const logPath = join(
        outputDir,
        'monkey-' + safeName(packageName) + '-' + fileStamp() + '-logcat.txt'
      )
      logStream = createWriteStream(logPath, { flags: 'w' })
      logStream.on('error', () => undefined)
      const logcatCommand =
        'logcat -v time -T "$(date +\'%m-%d %H:%M:%S.000\')"'
      logcat = spawn(adbPath, ['-s', serial, 'shell', logcatCommand], {
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe']
      })
      logcat.stdout?.pipe(logStream)
      logcat.stderr?.on('data', (chunk: Buffer) => {
        logStream?.write(chunk)
      })
      this.logcat = logcat
      this.logStream = logStream
      this.logPath = logPath

      const child = spawn(adbPath, args, {
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe']
      })
      this.child = child
      this.adbPath = adbPath
      this.serial = serial
      this.packageName = packageName
      this.outputDir = outputDir
      this.startedAt = Date.now()
      this.count = safeCount
      this.output = ''
      this.stopRequested = false
      this.state = {
        running: true,
        packageName,
        startedAt: this.startedAt,
        count: safeCount,
        output: '',
        logPath
      }
      this.finalizePromise = new Promise((resolve) => {
        this.finalizeResolve = resolve
      })

      const append = (chunk: Buffer): void => {
        if (!this.child) return
        this.output = (this.output + chunk.toString('utf8')).slice(-MAX_OUTPUT)
        this.state = { ...this.state, output: this.output }
      }
      child.stdout?.on('data', append)
      child.stderr?.on('data', append)
      child.on('error', (error) => {
        void this.finish(child, -1, 'Monkey 启动失败：' + error.message)
      })
      child.on('exit', (code) => {
        void this.finish(child, code)
      })
      return { ok: true, message: 'Monkey 已启动' }
    } catch (error) {
      try {
        logcat?.kill()
        logStream?.end()
      } catch {
        // 启动失败时清理日志采集
      }
      this.logcat = null
      this.logStream = null
      this.logPath = undefined
      return { ok: false, message: 'Monkey 启动失败：' + String(error) }
    }
  }

  async stop(): Promise<CommandResult> {
    const child = this.child
    if (!child || !this.adbPath || !this.serial) {
      return { ok: false, message: '当前没有运行 Monkey' }
    }
    this.stopRequested = true
    const pid = await this.findMonkeyPid()
    if (pid) {
      await runAdb(
        this.adbPath,
        ['-s', this.serial, 'shell', 'kill', '-2', pid],
        { timeoutMs: 5000 }
      )
    } else {
      await runAdb(
        this.adbPath,
        ['-s', this.serial, 'shell', 'pkill', '-INT', 'monkey'],
        { timeoutMs: 5000 }
      )
    }

    const pending =
      this.finalizePromise ??
      Promise.resolve({ ok: false, message: 'Monkey 正在收尾' } as CommandResult)
    const timeout = delay(STOP_TIMEOUT_MS).then(
      () => ({ ok: false, message: '停止 Monkey 超时' }) as CommandResult
    )
    const result = await Promise.race([pending, timeout])
    if (!result.ok) {
      try {
        child.kill()
      } catch {
        // 进程可能已经退出
      }
    }
    return result
  }

  getState(): MonkeyStatus {
    return { ...this.state }
  }

  dispose(): void {
    if (this.child) {
      try {
        this.child.kill()
      } catch {
        // 进程可能已经退出
      }
    }
    if (this.logcat) {
      try {
        this.logcat.kill()
      } catch {
        // 进程可能已经退出
      }
    }
    if (this.logStream) {
      try {
        this.logStream.end()
      } catch {
        // 流可能已经关闭
      }
    }
    this.child = null
    this.logcat = null
    this.logStream = null
    this.logPath = undefined
    this.state = { running: false }
  }

  private async stopLogcat(): Promise<void> {
    const logcat = this.logcat
    const stream = this.logStream
    this.logcat = null
    this.logStream = null
    if (logcat) {
      try {
        logcat.kill()
      } catch {
        // 进程可能已经退出
      }
      await delay(300)
    }
    if (stream) {
      await new Promise<void>((resolve) => {
        let finished = false
        const done = (): void => {
          if (finished) return
          finished = true
          resolve()
        }
        stream.end(done)
        setTimeout(done, 500)
      })
    }
  }

  private async findMonkeyPid(): Promise<string | null> {
    if (!this.adbPath || !this.serial) return null
    for (const name of ['monkey', 'com.android.commands.monkey']) {
      const result = await runAdb(
        this.adbPath,
        ['-s', this.serial, 'shell', 'pidof', name],
        { timeoutMs: 5000 }
      )
      if (result.ok) {
        const pid = parsePid(result.stdout)
        if (pid) return pid
      }
    }
    const ps = await runAdb(
      this.adbPath,
      ['-s', this.serial, 'shell', 'ps', '-A', '-o', 'PID,NAME'],
      { timeoutMs: 5000 }
    )
    if (ps.ok) {
      for (const line of ps.stdout.split(/\r?\n/)) {
        if (/monkey/i.test(line)) {
          const match = line.match(/^\s*(\d+)/)
          if (match) return match[1]
        }
      }
    }
    return null
  }

  private async finish(
    child: ChildProcess,
    code: number | null,
    errorText?: string
  ): Promise<void> {
    if (this.child !== child) return
    this.child = null
    const adbPath = this.adbPath
    const serial = this.serial
    const packageName = this.packageName
    const outputDir = this.outputDir
    const startedAt = this.startedAt
    const count = this.count
    const output = this.output
    const stoppedByUser = this.stopRequested
    this.adbPath = null
    this.serial = null
    this.packageName = null
    this.outputDir = null
    this.startedAt = null
    this.count = null
    this.stopRequested = false

    const logPath = this.logPath
    this.logPath = undefined
    await this.stopLogcat()

    let crashPath: string | undefined
    if (adbPath && serial && outputDir) {
      try {
        const crash = await runAdb(
          adbPath,
          ['-s', serial, 'logcat', '-b', 'crash', '-d'],
          { timeoutMs: 10000 }
        )
        crashPath = join(
          outputDir,
          'monkey-' + safeName(packageName ?? 'device') + '-' + fileStamp() + '-crash.txt'
        )
        await writeFile(
          crashPath,
          'Monkey 崩溃日志\n\n' + (crash.stdout || '') + (crash.stderr || ''),
          'utf8'
        )
      } catch {
        crashPath = undefined
      }
    }

    let reportPath: string | undefined
    let saveError: string | undefined
    if (outputDir && packageName) {
      try {
        await mkdir(outputDir, { recursive: true })
        reportPath = join(
          outputDir,
          'monkey-' + safeName(packageName) + '-' + fileStamp() + '.txt'
        )
        const header = [
          'Monkey 报告',
          '包名: ' + packageName,
          '设备: ' + (serial ?? ''),
          '开始时间: ' + (startedAt ? new Date(startedAt).toLocaleString() : ''),
          '事件数: ' + String(count ?? ''),
          '退出码: ' + String(code ?? ''),
          '停止方式: ' + (stoppedByUser ? '手动停止' : '自动结束'),
          '日志文件: ' + (logPath ?? ''),
          '崩溃日志: ' + (crashPath ?? ''),
          ''
        ].join('\n')
        await writeFile(reportPath, header + output, 'utf8')
      } catch (error) {
        saveError = '报告保存失败：' + String(error)
      }
    }

    const failed = Boolean(errorText) || (!stoppedByUser && code !== null && code !== 0)
    const error = errorText || saveError || (failed ? 'Monkey 异常退出（退出码 ' + String(code) + '）' : undefined)
    this.output = output
    this.state = {
      running: false,
      packageName: packageName ?? undefined,
      startedAt: startedAt ?? undefined,
      count: count ?? undefined,
      output,
      reportPath,
      logPath,
      crashPath,
      error
    }
    const result: CommandResult = {
      ok: !error,
      message: error ?? (stoppedByUser ? 'Monkey 已停止' : 'Monkey 执行完成'),
      output,
      command: adbPath ? 'adb shell monkey -p ' + (packageName ?? '') : undefined
    }
    this.finalizeResolve?.(result)
    this.finalizeResolve = null
    this.finalizePromise = null
  }
}

export const monkeyService = new MonkeyService()
