import { app } from 'electron'
import { constants, existsSync } from 'node:fs'
import { access, mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { HealthCheckItem, HealthCheckResult } from '@shared/types'
import { appState } from '../state'

async function checkDirectory(path: string): Promise<string> {
  try {
    await mkdir(path, { recursive: true })
    await access(path, constants.W_OK)
    return ''
  } catch (error) {
    return String(error)
  }
}

export async function runHealthCheck(): Promise<HealthCheckResult> {
  const items: HealthCheckItem[] = []
  const add = (key: string, label: string, ok: boolean, detail: string): void => {
    items.push({ key, label, ok, detail })
  }

  try {
    const snapshot = appState.getConfigSnapshot()
    const state = appState.getState()
    const config = snapshot.config
    const adbPath = config.adbPath

    add(
      'adb-path',
      'ADB 路径',
      Boolean(adbPath && existsSync(adbPath)),
      adbPath ? (existsSync(adbPath) ? adbPath : '文件不存在：' + adbPath) : '尚未配置 adb.exe'
    )
    add(
      'adb-ready',
      'ADB 可用',
      state.adb.health === 'ready',
      state.adb.health === 'ready'
        ? '版本 ' + (state.adb.version ?? '未知')
        : state.adb.message ?? 'ADB 状态：' + state.adb.health
    )
    add(
      'adb-server',
      'ADB Server',
      state.adb.serverRunning,
      state.adb.serverRunning ? '运行中' : '未运行'
    )
    add(
      'device',
      '测试设备',
      state.devices.some((device) => device.state === 'device'),
      state.devices.length === 0
        ? '没有检测到设备'
        : state.devices
            .map((device) => (device.model ?? device.serial) + '：' + device.state)
            .join('；')
    )

    const directories: Array<[string, string, string]> = [
      ['log-dir', '日志保存目录', config.log.saveDir],
      ['screenshot-dir', '截图保存目录', config.capture.screenshotDir],
      ['record-dir', '录屏保存目录', config.capture.recordDir],
      ['monkey-dir', 'Monkey 输出目录', config.monkey.outputDir]
    ]
    for (const [key, label, path] of directories) {
      const error = await checkDirectory(path)
      add(key, label, !error, error ? '不可写：' + path : path)
    }

    const configError = await checkDirectory(dirname(snapshot.configPath))
    add(
      'config-dir',
      '配置目录',
      !configError,
      configError ? '不可写：' + dirname(snapshot.configPath) : snapshot.configPath
    )

    const scrcpyPath = app.isPackaged
      ? join(process.resourcesPath, 'scrcpy', 'scrcpy.exe')
      : join(app.getAppPath(), 'vendor', 'scrcpy', 'scrcpy.exe')
    add(
      'scrcpy',
      '录屏组件',
      existsSync(scrcpyPath),
      existsSync(scrcpyPath) ? scrcpyPath : '缺少 scrcpy.exe：' + scrcpyPath
    )
  } catch (error) {
    add('internal', '检查程序', false, String(error))
  }

  return {
    ok: items.length > 0 && items.every((item) => item.ok),
    checkedAt: new Date().toLocaleString('zh-CN'),
    items
  }
}
