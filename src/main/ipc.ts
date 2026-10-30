import { app, clipboard, dialog, ipcMain, shell } from 'electron'
import { spawn, type ChildProcess } from 'node:child_process'
import { cpSync, existsSync, mkdirSync } from 'node:fs'
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { IPC } from '@shared/api'
import type { AdbServerAction, CommandResult } from '@shared/types'
import { adbFailureMessage, runAdb } from './services/adb-client'
import { appService } from './services/app-service'
import { captureService } from './services/capture-service'
import { fileService } from './services/file-service'
import { runHealthCheck } from './services/health-service'
import type { ConfigPatch } from './services/config-service'
import { logService } from './services/log-service'
import { monkeyService } from './services/monkey-service'
import { appState } from './state'
import { getMainWindow } from './window'

function requireString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(label + ' 参数无效')
  }
  return value
}

function parsePidOutput(output: string): string[] {
  return Array.from(
    new Set(output.split(/\s+/).filter((item) => /^\d+$/.test(item)))
  )
}

function parsePsPids(output: string, packageName: string): string[] {
  const pids = new Set<string>()
  for (const line of output.split(/\r?\n/)) {
    const match = line.match(/^\s*(\d+)\s+(\S+)\s*$/)
    if (!match) continue
    if (match[2] === packageName || match[2].startsWith(packageName + ':')) {
      pids.add(match[1])
    }
  }
  return Array.from(pids)
}

function resolveScrcpyPath(): string | null {
  if (process.env.SCRCPY_PATH && existsSync(process.env.SCRCPY_PATH)) {
    return process.env.SCRCPY_PATH
  }
  const sourceDir = app.isPackaged
    ? join(process.resourcesPath, 'scrcpy')
    : join(app.getAppPath(), 'vendor', 'scrcpy')
  const targetDir = join(
    process.env.LOCALAPPDATA ?? app.getPath('temp'),
    'adb-tool',
    'scrcpy'
  )
  const targetExe = join(targetDir, 'scrcpy.exe')
  if (!existsSync(targetExe)) {
    if (!existsSync(join(sourceDir, 'scrcpy.exe'))) return null
    try {
      mkdirSync(targetDir, { recursive: true })
      cpSync(sourceDir, targetDir, { recursive: true, force: true })
    } catch {
      return null
    }
  }
  return existsSync(targetExe) ? targetExe : null
}

const KEY_CODES: Record<string, number> = {
  back: 4,
  home: 3,
  recents: 187,
  power: 26,
  volume_up: 24,
  volume_down: 25,
  enter: 66,
  delete: 67
}

function getCommandContext():
  | { adbPath: string; serial: string }
  | { message: string } {
  const config = appState.getConfigSnapshot().config
  const state = appState.getState()
  if (!config.adbPath) return { message: '请先配置 adb.exe' }
  if (!state.selectedSerial) return { message: '请先选择设备' }
  const device = state.devices.find((item) => item.serial === state.selectedSerial)
  if (!device || device.state !== 'device') {
    return { message: '当前设备未连接或未授权' }
  }
  return { adbPath: config.adbPath, serial: state.selectedSerial }
}

function requirePackageName(value: unknown): string {
  if (typeof value !== 'string') throw new Error('包名参数无效')
  const name = value.trim()
  if (!/^[A-Za-z0-9_]+(?:\.[A-Za-z0-9_]+)+$/.test(name)) {
    throw new Error('包名格式不正确，例如 com.example.app')
  }
  return name
}

function commandOutput(result: { stdout: string; stderr: string }): string {
  return [result.stdout, result.stderr].filter(Boolean).join('\n').trim()
}

const MAX_TERMINAL_OUTPUT = 400000
let terminalChild: ChildProcess | null = null
let terminalCancelled = false

function appendTerminalOutput(current: string, chunk: Buffer): string {
  return (current + chunk.toString('utf8')).slice(-MAX_TERMINAL_OUTPUT)
}

async function showOpenDialog(options: Electron.OpenDialogOptions): Promise<string | null> {
  const window = getMainWindow()
  const result = window
    ? await dialog.showOpenDialog(window, options)
    : await dialog.showOpenDialog(options)
  if (result.canceled || result.filePaths.length === 0) return null
  return result.filePaths[0]
}

export function registerIpc(): void {
  ipcMain.handle(IPC.configGet, () => appState.getConfigSnapshot())

  ipcMain.handle(IPC.configUpdate, (_event, patch: unknown) => {
    if (!patch || typeof patch !== 'object') throw new Error('配置参数无效')
    return appState.updateConfig(patch as ConfigPatch)
  })

  ipcMain.handle(IPC.adbDetect, () => appState.detectAdb())

  ipcMain.handle(IPC.adbValidate, (_event, adbPath: unknown) =>
    appState.validateAdb(requireString(adbPath, 'adbPath'))
  )

  ipcMain.handle(IPC.adbSetPath, (_event, adbPath: unknown) => {
    if (adbPath !== null && typeof adbPath !== 'string') throw new Error('adbPath 参数无效')
    return appState.setAdbPath(adbPath as string | null)
  })

  ipcMain.handle(IPC.adbServer, (_event, action: unknown) => {
    const actions: AdbServerAction[] = ['start', 'stop', 'restart']
    if (!actions.includes(action as AdbServerAction)) throw new Error('ADB Server 操作无效')
    return appState.adbServer(action as AdbServerAction)
  })

  ipcMain.handle(IPC.stateGet, () => appState.getState())
  ipcMain.handle(IPC.deviceRefresh, () => appState.refresh())
  ipcMain.handle(IPC.deviceSelect, (_event, serial: unknown) => {
    if (serial !== null && typeof serial !== 'string') throw new Error('设备序列号无效')
    return appState.selectDevice(serial as string | null)
  })

  ipcMain.handle(IPC.logStart, () => {
    const config = appState.getConfigSnapshot().config
    const state = appState.getState()
    if (!config.adbPath) return { ok: false, message: '请先配置 adb.exe' }
    if (!state.selectedSerial) return { ok: false, message: '请先选择设备' }
    const device = state.devices.find((item) => item.serial === state.selectedSerial)
    if (!device || device.state !== 'device') {
      return { ok: false, message: '当前设备未连接或未授权' }
    }
    return logService.start(config.adbPath, state.selectedSerial)
  })

  ipcMain.handle(IPC.logStop, () => {
    logService.stop()
    return { ok: true, message: '已停止抓取' }
  })

  ipcMain.handle(IPC.logClearDevice, async () => {
    const config = appState.getConfigSnapshot().config
    const state = appState.getState()
    if (!config.adbPath) return { ok: false, message: '请先配置 adb.exe' }
    if (!state.selectedSerial) return { ok: false, message: '请先选择设备' }
    const device = state.devices.find((item) => item.serial === state.selectedSerial)
    if (!device || device.state !== 'device') {
      return { ok: false, message: '当前设备未连接或未授权' }
    }
    const result = await runAdb(
      config.adbPath,
      ['-s', state.selectedSerial, 'logcat', '-c'],
      { timeoutMs: 10000 }
    )
    if (!result.ok) {
      return { ok: false, message: adbFailureMessage(result) }
    }
    return { ok: true, message: '手机日志缓冲区已清空' }
  })

  ipcMain.handle(IPC.logClearHistory, () => {
    logService.clearHistory()
  })

  ipcMain.handle(IPC.logResolvePids, async (_event, packageNameValue: unknown) => {
    const packageName = requireString(packageNameValue, '包名').trim()
    if (!/^[A-Za-z0-9_.]+$/.test(packageName)) {
      return { ok: false, pids: [], message: '包名格式不正确' }
    }
    const config = appState.getConfigSnapshot().config
    const state = appState.getState()
    if (!config.adbPath) return { ok: false, pids: [], message: '请先配置 adb.exe' }
    if (!state.selectedSerial) return { ok: false, pids: [], message: '请先选择设备' }
    const device = state.devices.find((item) => item.serial === state.selectedSerial)
    if (!device || device.state !== 'device') {
      return { ok: false, pids: [], message: '当前设备未连接或未授权' }
    }

    const pidof = await runAdb(
      config.adbPath,
      ['-s', state.selectedSerial, 'shell', 'pidof', packageName],
      { timeoutMs: 8000 }
    )
    if (pidof.ok) {
      const pids = parsePidOutput(pidof.stdout)
      if (pids.length > 0) return { ok: true, pids, message: '找到 PID' }
    }

    const ps = await runAdb(
      config.adbPath,
      ['-s', state.selectedSerial, 'shell', 'ps', '-A', '-o', 'PID,NAME'],
      { timeoutMs: 10000 }
    )
    if (!ps.ok) {
      return { ok: false, pids: [], message: adbFailureMessage(ps) }
    }
    const pids = parsePsPids(ps.stdout, packageName)
    if (pids.length === 0) {
      return { ok: false, pids: [], message: '没有找到运行中的进程，先启动应用再查' }
    }
    return { ok: true, pids, message: '找到 PID' }
  })

  ipcMain.handle(IPC.logLoadFile, async () => {
    const window = getMainWindow()
    const options: Electron.OpenDialogOptions = {
      title: '加载历史日志',
      properties: ['openFile'],
      filters: [
        { name: '日志文件', extensions: ['txt', 'log'] },
        { name: '所有文件', extensions: ['*'] }
      ]
    }
    const result = window
      ? await dialog.showOpenDialog(window, options)
      : await dialog.showOpenDialog(options)
    if (result.canceled || result.filePaths.length === 0) return null
    const filePath = result.filePaths[0]
    try {
      const info = await stat(filePath)
      if (info.size > 100 * 1024 * 1024) {
        return { ok: false, message: '日志文件超过 100MB，请先拆分后再加载' }
      }
      const content = await readFile(filePath, 'utf8')
      const allLines = content.split(/\r?\n/)
      while (allLines.length > 0 && allLines[allLines.length - 1] === '') {
        allLines.pop()
      }
      const maxLines = 200000
      const truncated = allLines.length > maxLines
      const lines = truncated ? allLines.slice(-maxLines) : allLines
      return {
        ok: true,
        message: truncated ? '文件较大，已加载最近 200000 行' : '日志已加载',
        filePath,
        lines,
        truncated
      }
    } catch (error) {
      return { ok: false, message: '读取日志文件失败：' + String(error) }
    }
  })

  ipcMain.handle(IPC.logCrash, async () => {
    const config = appState.getConfigSnapshot().config
    const state = appState.getState()
    if (!config.adbPath) return { ok: false, message: '请先配置 adb.exe' }
    if (!state.selectedSerial) return { ok: false, message: '请先选择设备' }
    const device = state.devices.find((item) => item.serial === state.selectedSerial)
    if (!device || device.state !== 'device') {
      return { ok: false, message: '当前设备未连接或未授权' }
    }
    const result = await runAdb(
      config.adbPath,
      ['-s', state.selectedSerial, 'logcat', '-b', 'crash', '-d'],
      { timeoutMs: 15000 }
    )
    if (!result.ok) {
      return { ok: false, message: adbFailureMessage(result), text: result.stderr }
    }
    return { ok: true, message: '崩溃日志已读取', text: result.stdout }
  })

  ipcMain.handle(IPC.logSave, async (_event, request: unknown) => {
    if (!request || typeof request !== 'object') {
      return { ok: false, message: '导出参数无效' }
    }
    const { directory, fileName, lines } = request as {
      directory?: unknown
      fileName?: unknown
      lines?: unknown
    }
    if (typeof directory !== 'string' || directory.trim().length === 0) {
      return { ok: false, message: '请填写保存目录' }
    }
    if (typeof fileName !== 'string' || fileName.trim().length === 0) {
      return { ok: false, message: '请填写文件名' }
    }
    const trimmedName = fileName.trim()
    if (/[\\/]/.test(trimmedName) || trimmedName.includes('..')) {
      return { ok: false, message: '文件名不能包含路径字符' }
    }
    if (
      !Array.isArray(lines) ||
      lines.length > 200000 ||
      lines.some((line) => typeof line !== 'string')
    ) {
      return { ok: false, message: '导出内容无效或过大' }
    }
    const finalName = trimmedName.includes('.') ? trimmedName : trimmedName + '.txt'
    const targetPath = join(directory.trim(), finalName)
    try {
      await stat(targetPath)
      return { ok: false, message: '文件已存在，请换个名字' }
    } catch {
      // 文件不存在，继续
    }
    try {
      await mkdir(directory.trim(), { recursive: true })
      const content = (lines as string[]).join('\n') + (lines.length > 0 ? '\n' : '')
      await writeFile(targetPath, content, 'utf8')
      return { ok: true, message: '日志已导出', filePath: targetPath, lines: lines.length }
    } catch (error) {
      return { ok: false, message: '导出失败：' + String(error) }
    }
  })

  ipcMain.handle(IPC.captureScreenshot, async () => {
    const config = appState.getConfigSnapshot().config
    const state = appState.getState()
    if (!config.adbPath) return { ok: false, message: '请先配置 adb.exe' }
    if (!state.selectedSerial) return { ok: false, message: '请先选择设备' }
    const device = state.devices.find((item) => item.serial === state.selectedSerial)
    if (!device || device.state !== 'device') {
      return { ok: false, message: '当前设备未连接或未授权' }
    }
    return captureService.takeScreenshot(
      config.adbPath,
      state.selectedSerial,
      config.capture.screenshotDir
    )
  })

  ipcMain.handle(IPC.captureStartRecording, (_event, durationSeconds: unknown) => {
    const config = appState.getConfigSnapshot().config
    const state = appState.getState()
    if (!config.adbPath) return { ok: false, message: '请先配置 adb.exe' }
    if (!state.selectedSerial) return { ok: false, message: '请先选择设备' }
    const device = state.devices.find((item) => item.serial === state.selectedSerial)
    if (!device || device.state !== 'device') {
      return { ok: false, message: '当前设备未连接或未授权' }
    }
    const scrcpyPath = resolveScrcpyPath()
    if (!scrcpyPath) {
      return { ok: false, message: '找不到录屏组件 scrcpy，请重新安装软件' }
    }
    const requested =
      typeof durationSeconds === 'number' && Number.isFinite(durationSeconds)
        ? Math.round(durationSeconds)
        : config.capture.timeLimit
    const safeDuration = Math.max(60, Math.min(3600, requested))
    return captureService.startRecording(
      scrcpyPath,
      state.selectedSerial,
      config.capture.recordDir,
      config.capture.bitRate,
      safeDuration
    )
  })

  ipcMain.handle(IPC.captureStopRecording, () => captureService.stopRecording())
  ipcMain.handle(IPC.captureRecordingState, () => captureService.getState())

  ipcMain.handle(IPC.captureStartMirroring, () => {
    const config = appState.getConfigSnapshot().config
    const state = appState.getState()
    if (!config.adbPath) return { ok: false, message: '请先配置 adb.exe' }
    if (!state.selectedSerial) return { ok: false, message: '请先选择设备' }
    const device = state.devices.find((item) => item.serial === state.selectedSerial)
    if (!device || device.state !== 'device') {
      return { ok: false, message: '当前设备未连接或未授权' }
    }
    const scrcpyPath = resolveScrcpyPath()
    if (!scrcpyPath) {
      return { ok: false, message: '找不到投屏组件 scrcpy，请重新安装软件' }
    }
    return captureService.startMirroring(
      scrcpyPath,
      state.selectedSerial,
      config.capture.bitRate
    )
  })

  ipcMain.handle(IPC.captureStopMirroring, () => captureService.stopMirroring())
  ipcMain.handle(IPC.captureMirroringState, () => captureService.getMirroringState())

  ipcMain.handle(IPC.commandInstallApk, async (): Promise<CommandResult> => {
    const context = getCommandContext()
    if ('message' in context) return { ok: false, message: context.message }
    const filePath = await showOpenDialog({
      title: '选择 APK',
      properties: ['openFile'],
      filters: [{ name: 'APK', extensions: ['apk'] }]
    })
    if (!filePath) return { ok: false, message: '已取消选择' }
    const result = await runAdb(
      context.adbPath,
      ['-s', context.serial, 'install', '-r', filePath],
      { timeoutMs: 180000 }
    )
    return {
      ok: result.ok,
      message: result.ok ? 'APK 安装成功' : adbFailureMessage(result),
      output: commandOutput(result),
      command: 'adb install -r ' + filePath
    }
  })

  ipcMain.handle(IPC.commandStartPackage, async (_event, value: unknown): Promise<CommandResult> => {
    const context = getCommandContext()
    if ('message' in context) return { ok: false, message: context.message }
    const packageName = requirePackageName(value)
    const args = [
      '-s', context.serial, 'shell', 'monkey',
      '-p', packageName, '-c', 'android.intent.category.LAUNCHER', '1'
    ]
    const result = await runAdb(context.adbPath, args, { timeoutMs: 15000 })
    const output = commandOutput(result)
    const failed = !result.ok || /No activities found|monkey aborted/i.test(output)
    return {
      ok: !failed,
      message: !failed ? '应用已启动' : adbFailureMessage(result) || output || '启动失败',
      output,
      command: 'adb shell ' + args.slice(2).join(' ')
    }
  })

  ipcMain.handle(IPC.commandForceStop, async (_event, value: unknown): Promise<CommandResult> => {
    const context = getCommandContext()
    if ('message' in context) return { ok: false, message: context.message }
    const packageName = requirePackageName(value)
    const result = await runAdb(
      context.adbPath,
      ['-s', context.serial, 'shell', 'am', 'force-stop', packageName],
      { timeoutMs: 15000 }
    )
    return {
      ok: result.ok,
      message: result.ok ? '应用已强制停止' : adbFailureMessage(result),
      output: commandOutput(result),
      command: 'adb shell am force-stop ' + packageName
    }
  })

  ipcMain.handle(IPC.commandUninstall, async (_event, value: unknown): Promise<CommandResult> => {
    const context = getCommandContext()
    if ('message' in context) return { ok: false, message: context.message }
    const packageName = requirePackageName(value)
    const result = await runAdb(
      context.adbPath,
      ['-s', context.serial, 'uninstall', packageName],
      { timeoutMs: 60000 }
    )
    return {
      ok: result.ok,
      message: result.ok ? '应用已卸载' : adbFailureMessage(result),
      output: commandOutput(result),
      command: 'adb uninstall ' + packageName
    }
  })

  ipcMain.handle(IPC.commandClearData, async (_event, value: unknown): Promise<CommandResult> => {
    const context = getCommandContext()
    if ('message' in context) return { ok: false, message: context.message }
    const packageName = requirePackageName(value)
    const result = await runAdb(
      context.adbPath,
      ['-s', context.serial, 'shell', 'pm', 'clear', packageName],
      { timeoutMs: 30000 }
    )
    return {
      ok: result.ok,
      message: result.ok ? '应用数据已清除' : adbFailureMessage(result),
      output: commandOutput(result),
      command: 'adb shell pm clear ' + packageName
    }
  })

  ipcMain.handle(IPC.commandKeyEvent, async (_event, value: unknown): Promise<CommandResult> => {
    const context = getCommandContext()
    if ('message' in context) return { ok: false, message: context.message }
    if (typeof value !== 'string' || !(value in KEY_CODES)) {
      return { ok: false, message: '不支持的按键' }
    }
    const code = KEY_CODES[value]
    const result = await runAdb(
      context.adbPath,
      ['-s', context.serial, 'shell', 'input', 'keyevent', String(code)],
      { timeoutMs: 15000 }
    )
    return {
      ok: result.ok,
      message: result.ok ? '按键已发送' : adbFailureMessage(result),
      output: commandOutput(result),
      command: 'adb shell input keyevent ' + code
    }
  })

  ipcMain.handle(IPC.commandInputText, async (_event, value: unknown): Promise<CommandResult> => {
    const context = getCommandContext()
    if ('message' in context) return { ok: false, message: context.message }
    if (typeof value !== 'string') return { ok: false, message: '文本参数无效' }
    const text = value.replace(/\r?\n/g, ' ').trim()
    if (!text) return { ok: false, message: '请输入要发送的文本' }
    if (text.length > 500) return { ok: false, message: '文本最多 500 个字符' }
    if (!/^[A-Za-z0-9 ._@:-]+$/.test(text)) {
      return { ok: false, message: '暂只支持英文、数字、空格和 . _ @ : -' }
    }
    const encoded = text.replace(/ /g, '%s')
    const result = await runAdb(
      context.adbPath,
      ['-s', context.serial, 'shell', 'input', 'text', encoded],
      { timeoutMs: 15000 }
    )
    return {
      ok: result.ok,
      message: result.ok ? '文本已发送' : adbFailureMessage(result),
      output: commandOutput(result),
      command: 'adb shell input text ' + encoded
    }
  })

  ipcMain.handle(IPC.monkeyStart, async (
    _event,
    value: unknown,
    countValue: unknown,
    throttleValue: unknown,
    seedValue: unknown
  ): Promise<CommandResult> => {
    const context = getCommandContext()
    if ('message' in context) return { ok: false, message: context.message }
    let packageName: string
    try {
      packageName = requirePackageName(value)
    } catch (error) {
      return { ok: false, message: String(error) }
    }
    const count = typeof countValue === 'number' ? countValue : NaN
    const throttle = typeof throttleValue === 'number' ? throttleValue : NaN
    if (!Number.isFinite(count) || count < 1) {
      return { ok: false, message: '事件数必须是大于 0 的数字' }
    }
    if (!Number.isFinite(throttle) || throttle < 0) {
      return { ok: false, message: '间隔必须是不小于 0 的数字' }
    }
    const seed =
      typeof seedValue === 'number' && Number.isFinite(seedValue)
        ? Math.round(seedValue)
        : undefined
    const config = appState.getConfigSnapshot().config
    return monkeyService.start(
      context.adbPath,
      context.serial,
      packageName,
      count,
      throttle,
      seed,
      config.monkey.outputDir
    )
  })

  ipcMain.handle(IPC.monkeyStop, () => monkeyService.stop())
  ipcMain.handle(IPC.monkeyState, () => monkeyService.getState())

  ipcMain.handle(IPC.appsList, async (_event, filter: unknown) => {
    const context = getCommandContext()
    if ('message' in context) return { ok: false, message: context.message }
    const allowed = ['user', 'system', 'all']
    const safeFilter = typeof filter === 'string' && allowed.includes(filter) ? filter : 'all'
    return appService.listApps(context.adbPath, context.serial, safeFilter as 'user' | 'system' | 'all')
  })

  ipcMain.handle(IPC.appsDetail, async (_event, value: unknown) => {
    const context = getCommandContext()
    if ('message' in context) return { ok: false, message: context.message }
    let packageName: string
    try {
      packageName = requirePackageName(value)
    } catch (error) {
      return { ok: false, message: String(error) }
    }
    return appService.getAppDetail(context.adbPath, context.serial, packageName)
  })

  ipcMain.handle(IPC.filesList, async (_event, value: unknown) => {
    const context = getCommandContext()
    if ('message' in context) return { ok: false, message: context.message }
    if (typeof value !== 'string') return { ok: false, message: '目录参数无效' }
    return fileService.listFiles(context.adbPath, context.serial, value)
  })

  ipcMain.handle(IPC.filesDownload, async (_event, value: unknown) => {
    const context = getCommandContext()
    if ('message' in context) return { ok: false, message: context.message }
    if (typeof value !== 'string') return { ok: false, message: '文件路径无效' }
    return fileService.downloadFile(context.adbPath, context.serial, value)
  })

  ipcMain.handle(IPC.filesMkdir, async (_event, value: unknown, name: unknown) => {
    const context = getCommandContext()
    if ('message' in context) return { ok: false, message: context.message }
    if (typeof value !== 'string' || typeof name !== 'string') {
      return { ok: false, message: '目录参数无效' }
    }
    return fileService.createFolder(context.adbPath, context.serial, value, name)
  })

  ipcMain.handle(IPC.filesRename, async (_event, value: unknown, newName: unknown) => {
    const context = getCommandContext()
    if ('message' in context) return { ok: false, message: context.message }
    if (typeof value !== 'string' || typeof newName !== 'string') {
      return { ok: false, message: '重命名参数无效' }
    }
    return fileService.rename(context.adbPath, context.serial, value, newName)
  })

  ipcMain.handle(IPC.filesDelete, async (_event, value: unknown) => {
    const context = getCommandContext()
    if ('message' in context) return { ok: false, message: context.message }
    if (typeof value !== 'string') return { ok: false, message: '文件路径无效' }
    return fileService.deletePath(context.adbPath, context.serial, value)
  })

  ipcMain.handle(IPC.filesUpload, async (_event, value: unknown) => {
    const context = getCommandContext()
    if ('message' in context) return { ok: false, message: context.message }
    if (typeof value !== 'string') return { ok: false, message: '目录参数无效' }
    const window = getMainWindow()
    const options: Electron.OpenDialogOptions = {
      title: '选择要上传的文件',
      properties: ['openFile', 'multiSelections']
    }
    const result = window
      ? await dialog.showOpenDialog(window, options)
      : await dialog.showOpenDialog(options)
    if (result.canceled || result.filePaths.length === 0) {
      return { ok: false, message: '已取消选择' }
    }
    return fileService.uploadFiles(
      context.adbPath,
      context.serial,
      value,
      result.filePaths
    )
  })

  ipcMain.handle(IPC.terminalRun, async (_event, value: unknown) => {
    const context = getCommandContext()
    if ('message' in context) return { ok: false, message: context.message }
    if (typeof value !== 'string') return { ok: false, message: '命令参数无效' }
    const command = value.trim()
    if (!command) return { ok: false, message: '命令不能为空' }
    if (command.length > 2000) return { ok: false, message: '命令最长 2000 个字符' }
    if (terminalChild) return { ok: false, message: '已有命令正在运行，请先终止' }

    return new Promise((resolve) => {
      let stdout = ''
      let stderr = ''
      let settled = false
      let timedOut = false
      const child = spawn(
        context.adbPath,
        ['-s', context.serial, 'shell', command],
        { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }
      )
      terminalChild = child
      terminalCancelled = false

      const finish = (ok: boolean, message: string): void => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        if (terminalChild === child) terminalChild = null
        terminalCancelled = false
        resolve({
          ok,
          message,
          output: [stdout, stderr].filter(Boolean).join('\n').trim(),
          command: 'adb shell ' + command
        })
      }

      const timer = setTimeout(() => {
        timedOut = true
        try {
          child.kill()
        } catch {
          // 进程可能已经退出
        }
      }, 60000)

      const emitOutput = (chunk: Buffer): void => {
        const window = getMainWindow()
        if (!window || window.isDestroyed()) return
        window.webContents.send(IPC.terminalOutput, chunk.toString('utf8'))
      }
      child.stdout?.on('data', (chunk: Buffer) => {
        stdout = appendTerminalOutput(stdout, chunk)
        emitOutput(chunk)
      })
      child.stderr?.on('data', (chunk: Buffer) => {
        stderr = appendTerminalOutput(stderr, chunk)
        emitOutput(chunk)
      })
      child.on('error', (error) => {
        finish(false, '执行失败：' + error.message)
      })
      child.on('close', (code) => {
        if (terminalCancelled) {
          finish(false, '已终止')
        } else if (timedOut) {
          finish(false, '命令超过 60 秒，已终止')
        } else if (code === 0) {
          finish(true, '执行完成')
        } else {
          finish(false, stderr.trim() || '命令退出（退出码 ' + String(code) + '）')
        }
      })
    })
  })

  ipcMain.handle(IPC.terminalCancel, () => {
    if (!terminalChild) return { ok: false, message: '当前没有运行中的命令' }
    terminalCancelled = true
    try {
      terminalChild.kill()
    } catch {
      // 进程可能已经退出
    }
    return { ok: true, message: '已发送终止' }
  })

  ipcMain.handle(IPC.dialogPickAdb, async () => {
    const filters =
      process.platform === 'win32'
        ? [
            { name: 'adb.exe', extensions: ['exe'] },
            { name: '所有文件', extensions: ['*'] }
          ]
        : [{ name: '所有文件', extensions: ['*'] }]
    return showOpenDialog({
      title: '选择 adb.exe',
      properties: ['openFile'],
      filters
    })
  })

  ipcMain.handle(IPC.dialogPickDirectory, async () =>
    showOpenDialog({
      title: '选择目录',
      properties: ['openDirectory', 'createDirectory']
    })
  )

  ipcMain.handle(IPC.shellOpenPath, async (_event, target: unknown) => {
    const path = requireString(target, '路径')
    const message = await shell.openPath(path)
    return { ok: message.length === 0, message: message || '已打开' }
  })

  ipcMain.handle(IPC.clipboardWrite, (_event, text: unknown) => {
    clipboard.writeText(requireString(text, '文本'))
  })

  ipcMain.handle(IPC.appGetInfo, () => appState.getAppInfo())

  ipcMain.handle(IPC.appHealthCheck, async () => runHealthCheck())

  ipcMain.handle('app:version', () => app.getVersion())
}