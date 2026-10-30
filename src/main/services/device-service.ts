import type { DeviceDetail, DeviceSummary, ForegroundApp } from '@shared/types'
import { buildDeviceDetail, parseDevicesL, parseForegroundApp, parseGetprop } from '@shared/parsers'
import { adbFailureMessage, runAdb, type AdbRunResult } from './adb-client'

function commandFailure(result: AdbRunResult): string {
  return adbFailureMessage(result)
}

export async function listDevices(adbPath: string): Promise<DeviceSummary[]> {
  const result = await runAdb(adbPath, ['devices', '-l'], { timeoutMs: 12000 })
  if (!result.ok) throw new Error(commandFailure(result))
  return parseDevicesL(result.stdout)
}

export async function getDeviceDetail(adbPath: string, serial: string): Promise<DeviceDetail> {
  const result = await runAdb(adbPath, ['-s', serial, 'shell', 'getprop'], {
    timeoutMs: 12000
  })
  if (!result.ok) throw new Error(commandFailure(result))
  return buildDeviceDetail(parseGetprop(result.stdout))
}

export async function getForegroundApp(
  adbPath: string,
  serial: string
): Promise<ForegroundApp | null> {
  const commands = [
    "dumpsys window | grep -E 'mCurrentFocus|mFocusedApp'",
    "dumpsys activity activities | grep -E 'mResumedActivity|topResumedActivity'"
  ]
  for (const command of commands) {
    const result = await runAdb(adbPath, ['-s', serial, 'shell', command], {
      timeoutMs: 8000
    })
    if (!result.ok) continue
    const parsed = parseForegroundApp(result.stdout)
    if (parsed) return parsed
  }
  return null
}
