import { spawn } from 'node:child_process'
import { statSync } from 'node:fs'
import { parseAdbVersion } from '@shared/parsers'
import type { AdbValidationResult } from '@shared/types'

export interface AdbRunOptions {
  timeoutMs?: number
  maxOutputBytes?: number
}

export interface AdbRunResult {
  ok: boolean
  code: number | null
  stdout: string
  stderr: string
  durationMs: number
  timedOut: boolean
  error?: string
}

export function isFakeAdb(): boolean {
  return Boolean(process.env.ADB_FAKE_SCRIPT)
}

function spawnSpec(adbPath: string, args: string[]): {
  command: string
  args: string[]
  env: NodeJS.ProcessEnv
} {
  if (isFakeAdb()) {
    return {
      command: process.execPath,
      args: [process.env.ADB_FAKE_SCRIPT as string, ...args],
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }
    }
  }
  return { command: adbPath, args, env: process.env }
}

export function runAdb(
  adbPath: string,
  args: string[],
  options: AdbRunOptions = {}
): Promise<AdbRunResult> {
  const startedAt = Date.now()
  const timeoutMs = options.timeoutMs ?? 15000
  const maxBytes = options.maxOutputBytes ?? 4 * 1024 * 1024

  return new Promise((resolvePromise) => {
    let child
    let stdout = ''
    let stderr = ''
    let stdoutBytes = 0
    let stderrBytes = 0
    let timedOut = false
    let settled = false
    let killTimer: NodeJS.Timeout | null = null
    let hardTimer: NodeJS.Timeout | null = null

    const finish = (code: number | null, error?: string) => {
      if (settled) return
      settled = true
      if (killTimer) clearTimeout(killTimer)
      if (hardTimer) clearTimeout(hardTimer)
      if (stdoutBytes >= maxBytes) stdout += '\n...[输出已截断]'
      if (stderrBytes >= maxBytes) stderr += '\n...[输出已截断]'
      resolvePromise({
        ok: code === 0 && !error,
        code,
        stdout,
        stderr,
        durationMs: Date.now() - startedAt,
        timedOut,
        error
      })
    }

    try {
      const spec = spawnSpec(adbPath, args)
      child = spawn(spec.command, spec.args, {
        windowsHide: true,
        env: spec.env,
        stdio: ['ignore', 'pipe', 'pipe']
      })
    } catch (error) {
      finish(-1, error instanceof Error ? error.message : String(error))
      return
    }

    killTimer = setTimeout(() => {
      timedOut = true
      try {
        child.kill()
      } catch {
        // 进程可能已退出
      }
      setTimeout(() => {
        try {
          child.kill('SIGKILL')
        } catch {
          // 进程可能已退出
        }
      }, 2000)
    }, timeoutMs)

    hardTimer = setTimeout(() => {
      timedOut = true
      finish(-1, '命令执行超时')
    }, timeoutMs + 4000)

    const collect = (which: 'stdout' | 'stderr') => (chunk: Buffer) => {
      const text = chunk.toString('utf8')
      if (which === 'stdout') {
        if (stdoutBytes < maxBytes) {
          stdout += text
          stdoutBytes += Buffer.byteLength(text)
        }
      } else if (stderrBytes < maxBytes) {
        stderr += text
        stderrBytes += Buffer.byteLength(text)
      }
    }

    child.stdout?.on('data', collect('stdout'))
    child.stderr?.on('data', collect('stderr'))
    child.on('error', (error) => {
      finish(-1, error.message)
    })
    child.on('close', (code) => {
      finish(code ?? -1)
    })
  })
}

export function adbFailureMessage(result: AdbRunResult): string {
  const raw = (result.stderr || result.stdout || result.error || '').trim()
  if (/cannot bind|5037/i.test(raw)) {
    return 'ADB Server 启动失败：5037 端口可能被其他工具占用。'
  }
  if (/server version/i.test(raw)) {
    return 'ADB Server 版本不匹配，请尝试重启 ADB Server。'
  }
  if (/ENOENT|not found|cannot find/i.test(raw)) {
    return '找不到 adb.exe，请重新选择 platform-tools 目录下的 adb.exe。'
  }
  if (/permission denied/i.test(raw)) {
    return '没有权限执行 adb，请检查文件权限或安全软件拦截。'
  }
  const firstLine = raw.split(/\r?\n/).find((line) => line.trim().length > 0)
  return firstLine ? firstLine.trim() : 'adb 命令执行失败'
}

export async function validateAdbPath(adbPath: string): Promise<AdbValidationResult> {
  const trimmed = adbPath.trim()
  if (!trimmed) {
    return { ok: false, version: null, build: null, message: '请选择 adb.exe 文件' }
  }
  if (!isFakeAdb()) {
    try {
      if (!statSync(trimmed).isFile()) {
        return { ok: false, version: null, build: null, message: '选择的路径不是文件' }
      }
    } catch {
      return {
        ok: false,
        version: null,
        build: null,
        message: '找不到该文件，请确认 adb.exe 路径'
      }
    }
  }
  const result = await runAdb(trimmed, ['version'], { timeoutMs: 12000 })
  if (!result.ok) {
    return {
      ok: false,
      version: null,
      build: null,
      message: adbFailureMessage(result),
      raw: result.stderr || result.stdout || result.error
    }
  }
  const parsed = parseAdbVersion(result.stdout + '\n' + result.stderr)
  if (!parsed.version) {
    return {
      ok: false,
      version: null,
      build: null,
      message: 'adb 返回的内容无法识别，请确认选择的是正确的 adb.exe',
      raw: result.stdout || result.stderr
    }
  }
  return {
    ok: true,
    version: parsed.version,
    build: parsed.build,
    message: 'ADB 可用',
    raw: result.stdout
  }
}
