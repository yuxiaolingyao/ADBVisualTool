import { existsSync, statSync } from 'node:fs'
import { delimiter, join } from 'node:path'
import type { AdbCandidate, DetectedAdb } from '@shared/types'
import { isFakeAdb, validateAdbPath } from './adb-client'

function fileExists(target: string): boolean {
  if (isFakeAdb()) return true
  try {
    return existsSync(target) && statSync(target).isFile()
  } catch {
    return false
  }
}

function adbName(): string {
  return process.platform === 'win32' ? 'adb.exe' : 'adb'
}

export function collectAdbCandidates(configuredPath: string | null): AdbCandidate[] {
  const raw: Array<{ path: string; source: string }> = []
  const add = (target: string | null | undefined, source: string): void => {
    if (target && target.trim()) raw.push({ path: target, source })
  }

  add(configuredPath, '已配置')
  add(process.env.ADB_TOOL_ADB_PATH, '环境变量 ADB_TOOL_ADB_PATH')

  for (const envKey of ['ANDROID_HOME', 'ANDROID_SDK_ROOT']) {
    const root = process.env[envKey]
    if (root) add(join(root, 'platform-tools', adbName()), envKey)
  }

  const pathValue = process.env.PATH ?? ''
  for (const dir of pathValue.split(delimiter)) {
    if (dir.trim()) add(join(dir, adbName()), 'PATH')
  }

  const localAppData = process.env.LOCALAPPDATA
  const userProfile = process.env.USERPROFILE
  const programFiles = process.env.ProgramFiles
  const common: Array<string | null | undefined> = [
    localAppData ? join(localAppData, 'Android', 'Sdk', 'platform-tools', adbName()) : null,
    userProfile
      ? join(userProfile, 'AppData', 'Local', 'Android', 'Sdk', 'platform-tools', adbName())
      : null,
    'C:\\Android\\platform-tools\\adb.exe',
    'C:\\Android\\Sdk\\platform-tools\\adb.exe',
    'C:\\platform-tools\\adb.exe',
    'D:\\Android\\platform-tools\\adb.exe',
    'D:\\Android\\Sdk\\platform-tools\\adb.exe',
    'D:\\SDK\\platform-tools\\adb.exe',
    'D:\\platform-tools\\adb.exe',
    programFiles ? join(programFiles, 'Android', 'platform-tools', adbName()) : null
  ]
  for (const target of common) add(target, '常见路径')

  const seen = new Set<string>()
  const candidates: AdbCandidate[] = []
  for (const item of raw) {
    const key = process.platform === 'win32' ? item.path.toLowerCase() : item.path
    if (seen.has(key)) continue
    seen.add(key)
    candidates.push({
      path: item.path,
      source: item.source,
      exists: fileExists(item.path)
    })
  }
  return candidates
}

export async function detectAdb(configuredPath: string | null): Promise<DetectedAdb> {
  const candidates = collectAdbCandidates(configuredPath)
  let bestPath: string | null = null
  let bestVersion: string | null = null
  let lastError: string | undefined
  let attempts = 0

  for (const candidate of candidates) {
    if (!candidate.exists) continue
    if (bestPath) break
    if (attempts >= 8) break
    attempts += 1
    const validation = await validateAdbPath(candidate.path)
    candidate.valid = validation.ok
    candidate.version = validation.version ?? undefined
    candidate.error = validation.ok ? undefined : validation.message
    if (validation.ok) {
      bestPath = candidate.path
      bestVersion = validation.version
      break
    }
    lastError = validation.message
  }

  return {
    candidates,
    bestPath,
    bestVersion,
    error: bestPath ? undefined : lastError ?? '未找到可用的 adb.exe'
  }
}

export { validateAdbPath } from './adb-client'
