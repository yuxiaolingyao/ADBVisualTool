import type {
  AppDetail,
  AppDetailResult,
  AppFilter,
  AppListItem,
  AppListResult
} from '@shared/types'
import { adbFailureMessage, runAdb } from './adb-client'

function parsePackages(output: string): string[] {
  const result = new Set<string>()
  for (const line of output.split(/\r?\n/)) {
    const match = line.match(/^package:(\S+)/)
    if (match) result.add(match[1])
  }
  return Array.from(result)
}

function hasPackage(output: string, packageName: string): boolean {
  return output.includes('Package [' + packageName + ']') || output.includes('package:' + packageName)
}
export class AppService {
  async listApps(
    adbPath: string,
    serial: string,
    filter: AppFilter
  ): Promise<AppListResult> {
    try {
      const groups: Array<{ type: 'user' | 'system'; args: string[] }> = []
      if (filter === 'all' || filter === 'user') {
        groups.push({ type: 'user', args: ['-s', serial, 'shell', 'pm', 'list', 'packages', '-3'] })
      }
      if (filter === 'all' || filter === 'system') {
        groups.push({ type: 'system', args: ['-s', serial, 'shell', 'pm', 'list', 'packages', '-s'] })
      }
      const apps: AppListItem[] = []
      for (const group of groups) {
        const result = await runAdb(adbPath, group.args, { timeoutMs: 30000 })
        if (!result.ok) return { ok: false, message: adbFailureMessage(result) }
        for (const packageName of parsePackages(result.stdout)) {
          apps.push({ packageName, type: group.type })
        }
      }
      apps.sort((a, b) => a.packageName.localeCompare(b.packageName))
      return { ok: true, message: '共 ' + apps.length + ' 个应用', apps }
    } catch (error) {
      return { ok: false, message: '读取应用列表失败：' + String(error) }
    }
  }

  async getAppDetail(
    adbPath: string,
    serial: string,
    packageName: string
  ): Promise<AppDetailResult> {
    try {
      const output = await runAdb(
        adbPath,
        ['-s', serial, 'shell', 'dumpsys', 'package', packageName],
        { timeoutMs: 30000 }
      )
      if (!output.ok) return { ok: false, message: adbFailureMessage(output) }
      if (!hasPackage(output.stdout, packageName)) {
        return { ok: false, message: '没有找到应用：' + packageName }
      }

      const activity = await runAdb(
        adbPath,
        [
          '-s', serial, 'shell', 'cmd', 'package', 'resolve-activity',
          '--brief', packageName
        ],
        { timeoutMs: 15000 }
      )
      let launcherActivity: string | undefined
      if (activity.ok) {
        const line = activity.stdout
          .split(/\r?\n/)
          .map((item) => item.trim())
          .filter((item) => item.includes('/') && item.includes(packageName))
          .pop()
        launcherActivity = line
      }

      const text = output.stdout
      const versionName = text.match(/versionName=([^\s]+)/)?.[1]
      const versionCode = text.match(/versionCode=(\d+)/)?.[1]
      const codePath = text.match(/codePath=([^\s]+)/)?.[1]
      const dataDir = text.match(/dataDir=([^\s]+)/)?.[1]
      const firstInstallTime = text.match(/firstInstallTime=(.+)/)?.[1]?.trim()
      const lastUpdateTime = text.match(/lastUpdateTime=(.+)/)?.[1]?.trim()
      const permissionSection = text.split(/requested permissions:/)[1] ?? ''
      const permissionText = permissionSection.split(/\n\s*install permissions:/)[0] ?? ''
      const permissions = Array.from(
        new Set(
          Array.from(permissionText.matchAll(/^\s*(android\.permission\.[\w.]+)\s*$/gm)).map(
            (item) => item[1]
          )
        )
      ).sort()

      const detail: AppDetail = {
        packageName,
        versionName,
        versionCode,
        codePath,
        dataDir,
        launcherActivity,
        permissions,
        firstInstallTime,
        lastUpdateTime
      }
      return { ok: true, message: '应用详情已读取', detail }
    } catch (error) {
      return { ok: false, message: '读取应用详情失败：' + String(error) }
    }
  }
}

export const appService = new AppService()