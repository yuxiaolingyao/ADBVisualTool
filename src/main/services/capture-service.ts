import { execFile, spawn, type ChildProcess } from 'node:child_process'
import { mkdirSync, realpathSync } from 'node:fs'
import { copyFile, mkdir, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import type { CaptureResult, MirroringState, RecordingState } from '@shared/types'
import { adbFailureMessage, runAdb } from './adb-client'

const SCREENSHOT_TIMEOUT = 15000
const FINALIZE_WAIT_MS = 700
const STOP_TIMEOUT_MS = 20000

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

function safeSerial(serial: string): string {
  return serial.replace(/[^A-Za-z0-9_.-]/g, '_')
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function runPowerShell(script: string): Promise<void> {
  return new Promise((resolve) => {
    execFile('powershell.exe', ['-NoProfile', '-Command', script], {
      windowsHide: true,
      timeout: 10000
    }, () => resolve())
  })
}

export class CaptureService {
  private child: ChildProcess | null = null
  private childSerial: string | null = null
  private localPath: string | null = null
  private finalPath: string | null = null
  private startedAt: number | null = null
  private stopRequested = false
  private stderr = ''
  private state: RecordingState = { recording: false }
  private finalizePromise: Promise<CaptureResult> | null = null
  private finalizeResolve: ((result: CaptureResult) => void) | null = null
  private mirrorChild: ChildProcess | null = null
  private mirrorSerial: string | null = null
  private mirrorStartedAt: number | null = null
  private mirrorStopRequested = false
  private mirrorStderr = ''
  private mirrorState: MirroringState = { mirroring: false }
  private mirrorExitPromise: Promise<void> | null = null
  private mirrorExitResolve: (() => void) | null = null

  async takeScreenshot(adbPath: string, serial: string, directory: string): Promise<CaptureResult> {
    try {
      await mkdir(directory, { recursive: true })
      const filePath = join(directory, 'screenshot-' + safeSerial(serial) + '-' + stamp() + '.png')
      const buffer = await this.captureExecOut(adbPath, serial)
      if (buffer && buffer.length > 0) {
        await writeFile(filePath, buffer)
        return { ok: true, message: '截图已保存', filePath }
      }

      const remote = '/sdcard/adb-tool-shot-' + stamp() + '.png'
      const shot = await runAdb(
        adbPath,
        ['-s', serial, 'shell', 'screencap', '-p', remote],
        { timeoutMs: 15000 }
      )
      if (!shot.ok) return { ok: false, message: adbFailureMessage(shot) }
      const pull = await runAdb(
        adbPath,
        ['-s', serial, 'pull', remote, filePath],
        { timeoutMs: 30000 }
      )
      if (!pull.ok) return { ok: false, message: adbFailureMessage(pull) }
      return { ok: true, message: '截图已保存', filePath }
    } catch (error) {
      return { ok: false, message: '截图失败：' + errorMessage(error) }
    }
  }

  startRecording(
    scrcpyPath: string,
    serial: string,
    directory: string,
    bitRate: number,
    timeLimit: number
  ): CaptureResult {
    if (this.child) return { ok: false, message: '正在录屏，请先停止' }
    if (this.mirrorChild) return { ok: false, message: '正在投屏，请先关闭投屏' }
    try {
      mkdirSync(directory, { recursive: true })
      const safeLimit = Math.max(1, Math.min(3600, Math.round(timeLimit)))
      const safeBitRate = Math.max(100000, Math.min(20000000, Math.round(bitRate)))
      const fileName = 'record-' + safeSerial(serial) + '-' + stamp() + '.mp4'
      const baseDir = process.env.LOCALAPPDATA ?? tmpdir()
      const workingDir = join(baseDir, 'adb-tool-records')
      mkdirSync(workingDir, { recursive: true })
      const resolvedWorkingDir = realpathSync
        .native(workingDir)
        .replace(/^\\\\\?\\/, '')
      const localPath = join(resolvedWorkingDir, fileName)
      const finalPath = join(directory, fileName)
      const child = spawn(
        scrcpyPath,
        [
          '--no-audio',
          '--no-control',
          '--time-limit=' + String(safeLimit),
          '--video-bit-rate=' + String(safeBitRate),
          '--window-title=ADB 工具箱录屏',
          '--record=' + localPath,
          '-s',
          serial
        ],
        { windowsHide: false, stdio: ['ignore', 'pipe', 'pipe'] }
      )

      this.child = child
      this.childSerial = serial
      this.localPath = localPath
      this.finalPath = finalPath
      this.startedAt = Date.now()
      this.stopRequested = false
      this.stderr = ''
      this.state = { recording: true, serial, startedAt: this.startedAt }
      this.finalizePromise = new Promise((resolve) => {
        this.finalizeResolve = resolve
      })

      child.stdout?.on('data', (chunk: Buffer) => {
        this.stderr = (this.stderr + chunk.toString('utf8')).slice(-4000)
      })
      child.stderr?.on('data', (chunk: Buffer) => {
        this.stderr = (this.stderr + chunk.toString('utf8')).slice(-4000)
      })
      child.on('error', (error) => {
        void this.finishRecording(child, -1, '录屏启动失败：' + error.message)
      })
      child.on('exit', (code) => {
        void this.finishRecording(child, code)
      })

      return { ok: true, message: '开始录屏' }
    } catch (error) {
      return { ok: false, message: '录屏启动失败：' + errorMessage(error) }
    }
  }

  startMirroring(scrcpyPath: string, serial: string, bitRate: number): CaptureResult {
    if (this.child) return { ok: false, message: '正在录屏，请先停止录屏' }
    if (this.mirrorChild) return { ok: false, message: '投屏窗口已经打开' }
    try {
      const safeBitRate = Math.max(100000, Math.min(20000000, Math.round(bitRate)))
      const child = spawn(
        scrcpyPath,
        [
          '--no-audio',
          '--no-control',
          '--video-bit-rate=' + String(safeBitRate),
          '--window-title=ADB 工具箱投屏',
          '-s',
          serial
        ],
        { windowsHide: false, stdio: ['ignore', 'pipe', 'pipe'] }
      )
      this.mirrorChild = child
      this.mirrorSerial = serial
      this.mirrorStartedAt = Date.now()
      this.mirrorStopRequested = false
      this.mirrorStderr = ''
      this.mirrorState = { mirroring: true, serial, startedAt: this.mirrorStartedAt }
      this.mirrorExitPromise = new Promise((resolve) => {
        this.mirrorExitResolve = resolve
      })

      child.stdout?.on('data', (chunk: Buffer) => {
        this.mirrorStderr = (this.mirrorStderr + chunk.toString('utf8')).slice(-4000)
      })
      child.stderr?.on('data', (chunk: Buffer) => {
        this.mirrorStderr = (this.mirrorStderr + chunk.toString('utf8')).slice(-4000)
      })
      child.on('error', (error) => {
        this.finishMirroring(child, -1, '投屏启动失败：' + error.message)
      })
      child.on('exit', (code) => {
        this.finishMirroring(child, code)
      })

      return { ok: true, message: '已打开投屏窗口' }
    } catch (error) {
      return { ok: false, message: '投屏启动失败：' + errorMessage(error) }
    }
  }

  async stopMirroring(): Promise<CaptureResult> {
    const child = this.mirrorChild
    if (!child || !child.pid) return { ok: false, message: '当前没有投屏' }
    this.mirrorStopRequested = true
    const pid = child.pid
    await runPowerShell(
      '$p=Get-Process -Id ' + String(pid) + ' -ErrorAction SilentlyContinue;' +
        '$deadline=(Get-Date).AddSeconds(5);' +
        'while($p -and $p.MainWindowHandle -eq 0 -and (Get-Date) -lt $deadline){Start-Sleep -Milliseconds 250;$p.Refresh()};' +
        'if($p -and $p.MainWindowHandle -ne 0){$null=$p.CloseMainWindow()}'
    )
    const timeout = delay(10000).then(() => 'timeout' as const)
    const result = await Promise.race([
      (this.mirrorExitPromise ?? Promise.resolve()).then(() => 'closed' as const),
      timeout
    ])
    if (result === 'timeout') {
      try {
        child.kill()
      } catch {
        // 进程可能已经退出
      }
      return { ok: false, message: '关闭投屏超时，请手动关闭窗口' }
    }
    return { ok: true, message: '投屏已关闭' }
  }

  getMirroringState(): MirroringState {
    return { ...this.mirrorState }
  }

  async stopRecording(): Promise<CaptureResult> {
    const child = this.child
    if (!child || !child.pid) {
      return { ok: false, message: '当前没有录屏' }
    }

    this.stopRequested = true
    const pid = child.pid
    await runPowerShell(
      '$p=Get-Process -Id ' + String(pid) + ' -ErrorAction SilentlyContinue;' +
        '$deadline=(Get-Date).AddSeconds(5);' +
        'while($p -and $p.MainWindowHandle -eq 0 -and (Get-Date) -lt $deadline){Start-Sleep -Milliseconds 250;$p.Refresh()};' +
        'if($p -and $p.MainWindowHandle -ne 0){$null=$p.CloseMainWindow()}'
    )

    const pending =
      this.finalizePromise ??
      Promise.resolve({ ok: false, message: '录屏正在收尾，请稍后再试' } as CaptureResult)
    const timeout = delay(STOP_TIMEOUT_MS).then(
      () => ({ ok: false, message: '停止录屏超时，请稍后再试' }) as CaptureResult
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

  getState(): RecordingState {
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
    if (this.mirrorChild) {
      try {
        this.mirrorChild.kill()
      } catch {
        // 进程可能已经退出
      }
    }
    this.child = null
    this.localPath = null
    this.finalPath = null
    this.mirrorChild = null
    this.mirrorExitResolve?.()
    this.mirrorExitResolve = null
    this.mirrorExitPromise = null
    this.state = { recording: false }
    this.mirrorState = { mirroring: false }
  }

  private async captureExecOut(adbPath: string, serial: string): Promise<Buffer | null> {
    return new Promise((resolve) => {
      let child: ChildProcess
      try {
        child = spawn(adbPath, ['-s', serial, 'exec-out', 'screencap', '-p'], {
          windowsHide: true,
          stdio: ['ignore', 'pipe', 'pipe']
        })
      } catch {
        resolve(null)
        return
      }
      const chunks: Buffer[] = []
      let settled = false
      const timer = setTimeout(() => {
        try {
          child.kill()
        } catch {
          // 进程可能已经退出
        }
        if (!settled) {
          settled = true
          resolve(null)
        }
      }, SCREENSHOT_TIMEOUT)

      child.stdout?.on('data', (chunk: Buffer) => {
        chunks.push(chunk)
      })
      child.on('error', () => {
        if (!settled) {
          settled = true
          clearTimeout(timer)
          resolve(null)
        }
      })
      child.on('close', (code) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        if (code === 0 && chunks.length > 0) resolve(Buffer.concat(chunks))
        else resolve(null)
      })
    })
  }

  private finishMirroring(
    child: ChildProcess,
    code: number | null,
    errorText?: string
  ): void {
    if (this.mirrorChild !== child) return
    this.mirrorChild = null
    const serial = this.mirrorSerial
    const startedAt = this.mirrorStartedAt
    const stoppedByUser = this.mirrorStopRequested
    const rawError = (errorText ?? '').trim() || this.mirrorStderr.trim()
    this.mirrorSerial = null
    this.mirrorStartedAt = null
    this.mirrorStopRequested = false
    this.mirrorStderr = ''
    const error =
      !stoppedByUser && code !== 0
        ? rawError || '投屏已结束（退出码 ' + String(code) + '）'
        : undefined
    this.mirrorState = {
      mirroring: false,
      serial: serial ?? undefined,
      startedAt: startedAt ?? undefined,
      error
    }
    this.mirrorExitResolve?.()
    this.mirrorExitResolve = null
    this.mirrorExitPromise = null
  }

  private async finishRecording(
    child: ChildProcess,
    code: number | null,
    errorText?: string
  ): Promise<void> {
    if (this.child !== child) return
    this.child = null
    const localPath = this.localPath
    const finalPath = this.finalPath
    const serial = this.childSerial
    const startedAt = this.startedAt
    const stoppedByUser = this.stopRequested
    const rawError = (errorText ?? '').trim() || this.stderr.trim()
    this.localPath = null
    this.finalPath = null
    this.childSerial = null
    this.startedAt = null
    this.stopRequested = false
    this.stderr = ''

    let result: CaptureResult = { ok: false, message: '录屏保存失败' }
    if (localPath && finalPath) {
      await delay(FINALIZE_WAIT_MS)
      try {
        const info = await stat(localPath)
        if (info.size > 0) {
          await mkdir(dirname(finalPath), { recursive: true })
          await copyFile(localPath, finalPath)
          const error =
            !stoppedByUser && code !== null && code !== 0
              ? rawError || '录屏异常退出（退出码 ' + String(code) + '）'
              : undefined
          result = { ok: true, message: '录屏已保存', filePath: finalPath }
          this.state = {
            recording: false,
            serial: serial ?? undefined,
            startedAt: startedAt ?? undefined,
            filePath: finalPath,
            error
          }
        } else {
          result = { ok: false, message: '录屏文件为空：' + (rawError || 'scrcpy 未生成有效文件') }
          this.state = {
            recording: false,
            serial: serial ?? undefined,
            startedAt: startedAt ?? undefined,
            error: result.message
          }
        }
      } catch {
        result = { ok: false, message: '录屏失败：' + (rawError || '没有生成 MP4 文件') }
        this.state = {
          recording: false,
          serial: serial ?? undefined,
          startedAt: startedAt ?? undefined,
          error: result.message
        }
      }
    } else {
      this.state = { recording: false, error: rawError || '录屏结束，但文件信息丢失' }
    }

    this.finalizeResolve?.(result)
    this.finalizeResolve = null
    this.finalizePromise = null
  }
}

export const captureService = new CaptureService()
