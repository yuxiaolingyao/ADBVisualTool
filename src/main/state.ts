import { nativeTheme } from 'electron'
import type {
  AdbServerAction,
  AdbStatus,
  AdbValidationResult,
  AppConfig,
  AppInfo,
  ConfigSnapshot,
  DetectedAdb,
  DeviceDetail,
  DeviceSummary,
  ForegroundApp,
  RuntimeError,
  RuntimeState,
  ServerActionResult
} from '@shared/types'
import { IPC } from '@shared/api'
import {
  applyConfigPatch,
  getAppInfo,
  getConfigSnapshot,
  loadConfig,
  saveConfig,
  type ConfigPatch
} from './services/config-service'
import { adbFailureMessage, runAdb } from './services/adb-client'
import { detectAdb, validateAdbPath } from './services/adb-locator'
import { getDeviceDetail, getForegroundApp, listDevices } from './services/device-service'
import { getMainWindow } from './window'

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export class AppState {
  private config: AppConfig | null = null
  private adb: AdbStatus = {
    path: null,
    version: null,
    build: null,
    serverRunning: false,
    health: 'checking'
  }
  private devices: DeviceSummary[] = []
  private selectedSerial: string | null = null
  private selectedDetail: DeviceDetail | null = null
  private foregroundApp: ForegroundApp | null = null
  private runtimeError: RuntimeError | null = null
  private timer: NodeJS.Timeout | null = null
  private polling = false
  private lastEmitted = ''
  private detailFetchedAt = 0
  private detailFetchedSerial: string | null = null
  private manuallyStopped = false
  private serverBusy = false
  private generation = 0

  initialize(): void {
    this.config = loadConfig()
    nativeTheme.themeSource = this.config.ui.theme
    if (this.config.adbPath) {
      this.adb = {
        path: this.config.adbPath,
        version: null,
        build: null,
        serverRunning: false,
        health: 'checking',
        message: '正在检测 ADB...'
      }
    } else {
      this.adb = {
        path: null,
        version: null,
        build: null,
        serverRunning: false,
        health: 'not-configured',
        message: '还没有配置 adb.exe'
      }
    }
  }

  async bootstrap(): Promise<void> {
    let config: AppConfig
    try {
      config = this.requireConfig()
    } catch (error) {
      this.adb = { ...this.adb, health: 'error', message: errorMessage(error) }
      this.emitIfChanged()
      return
    }
    try {
      let validation: AdbValidationResult | null = null
      if (config.adbPath) validation = await this.validateAdb(config.adbPath)

      if (validation && validation.ok && config.adbPath) {
        this.adb = {
          path: config.adbPath,
          version: validation.version,
          build: validation.build,
          serverRunning: false,
          health: 'ready',
          message: 'ADB 可用'
        }
      } else if (config.autoDetectAdb) {
        const detected = await this.detectAdb()
        if (detected.bestPath) {
          const detectedValidation = await this.validateAdb(detected.bestPath)
          config.adbPath = detected.bestPath
          saveConfig(config)
          this.adb = {
            path: detected.bestPath,
            version: detectedValidation.ok ? detectedValidation.version : detected.bestVersion,
            build: detectedValidation.ok ? detectedValidation.build : null,
            serverRunning: false,
            health: 'ready',
            message: '已自动检测到 ADB'
          }
        } else if (validation && config.adbPath) {
          this.adb = {
            path: config.adbPath,
            version: null,
            build: null,
            serverRunning: false,
            health: 'invalid',
            message: validation.message,
            raw: validation.raw
          }
        } else {
          this.adb = {
            path: null,
            version: null,
            build: null,
            serverRunning: false,
            health: 'not-configured',
            message: detected.error ?? '未找到 adb.exe'
          }
        }
      } else if (validation && config.adbPath) {
        this.adb = {
          path: config.adbPath,
          version: null,
          build: null,
          serverRunning: false,
          health: 'invalid',
          message: validation.message,
          raw: validation.raw
        }
      }
    } catch (error) {
      this.adb = { ...this.adb, health: 'error', message: errorMessage(error) }
    }

    this.emitIfChanged()
    if (this.adb.health === 'ready') {
      await this.poll(true)
    }
    this.startPolling()
  }

  getConfigSnapshot(): ConfigSnapshot {
    return getConfigSnapshot(this.requireConfig())
  }

  getAppInfo(): AppInfo {
    return getAppInfo(this.requireConfig())
  }

  getState(): RuntimeState {
    return {
      adb: { ...this.adb },
      devices: this.devices.map((device) => ({ ...device })),
      selectedSerial: this.selectedSerial,
      selectedDetail: this.selectedDetail ? { ...this.selectedDetail } : null,
      foregroundApp: this.foregroundApp ? { ...this.foregroundApp } : null,
      lastUpdated: Date.now(),
      error: this.runtimeError ? { ...this.runtimeError } : null
    }
  }

  async refresh(): Promise<RuntimeState> {
    if (this.manuallyStopped || this.serverBusy) {
      this.emitIfChanged()
      return this.getState()
    }
    this.startPolling()
    return this.poll(true)
  }

  async selectDevice(serial: string | null): Promise<RuntimeState> {
    const config = this.requireConfig()
    config.selectedSerial = serial
    saveConfig(config)
    this.selectedSerial = serial
    this.selectedDetail = null
    this.foregroundApp = null
    this.detailFetchedSerial = null
    this.emitIfChanged()
    if (serial) return this.poll(true)
    return this.getState()
  }

  async detectAdb(): Promise<DetectedAdb> {
    return detectAdb(this.config?.adbPath ?? null)
  }

  async validateAdb(adbPath: string): Promise<AdbValidationResult> {
    return validateAdbPath(adbPath)
  }

  async setAdbPath(adbPath: string | null): Promise<ConfigSnapshot> {
    const config = this.requireConfig()
    const normalized = adbPath ? adbPath.trim() || null : null
    config.adbPath = normalized

    if (!normalized) {
      this.adb = {
        path: null,
        version: null,
        build: null,
        serverRunning: false,
        health: 'not-configured',
        message: '还没有配置 adb.exe'
      }
      this.devices = []
      this.selectedSerial = null
      this.selectedDetail = null
      this.foregroundApp = null
      this.stopPolling()
      saveConfig(config)
      this.emitIfChanged()
      return getConfigSnapshot(config)
    }

    const validation = await this.validateAdb(normalized)
    if (validation.ok) {
      this.adb = {
        path: normalized,
        version: validation.version,
        build: validation.build,
        serverRunning: false,
        health: 'ready',
        message: 'ADB 可用'
      }
      this.manuallyStopped = false
      saveConfig(config)
      this.emitIfChanged()
      this.startPolling()
      await this.poll(true)
    } else {
      this.adb = {
        path: normalized,
        version: null,
        build: null,
        serverRunning: false,
        health: 'invalid',
        message: validation.message,
        raw: validation.raw
      }
      this.devices = []
      this.selectedSerial = null
      this.selectedDetail = null
      this.foregroundApp = null
      saveConfig(config)
      this.emitIfChanged()
    }
    return getConfigSnapshot(config)
  }

  updateConfig(patch: ConfigPatch): ConfigSnapshot {
    const config = this.requireConfig()
    this.config = applyConfigPatch(config, patch)
    saveConfig(this.config)
    if (patch.ui?.theme) nativeTheme.themeSource = patch.ui.theme
    this.emitIfChanged()
    return getConfigSnapshot(this.config)
  }

  async adbServer(action: AdbServerAction): Promise<ServerActionResult> {
    const config = this.requireConfig()
    if (!config.adbPath) {
      return { ok: false, message: '请先配置 adb.exe' }
    }
    if (this.serverBusy) {
      return { ok: false, message: 'ADB Server 正在操作中，请稍候' }
    }

    this.serverBusy = true
    this.generation += 1
    const generation = this.generation
    this.stopPolling()

    try {
      if (action === 'stop') {
        const wasStopped = this.manuallyStopped
        const wasRunning = this.adb.serverRunning
        // 先锁状态再执行 kill，防止 2 秒轮询或刷新把 Server 重新拉起
        this.manuallyStopped = true
        this.adb = { ...this.adb, message: '正在停止 ADB Server...' }
        this.emitIfChanged()

        const result = await runAdb(config.adbPath, ['kill-server'], { timeoutMs: 12000 })
        if (generation !== this.generation) {
          return { ok: false, message: 'ADB Server 操作已被新的操作取代' }
        }
        if (!result.ok) {
          this.manuallyStopped = wasStopped
          this.adb = {
            ...this.adb,
            serverRunning: wasRunning,
            health: 'ready',
            message: adbFailureMessage(result)
          }
          this.emitIfChanged()
          if (!wasStopped) this.startPolling()
          return {
            ok: false,
            message: adbFailureMessage(result),
            detail: result.stderr
          }
        }

        this.adb = {
          ...this.adb,
          serverRunning: false,
          health: 'ready',
          message: 'ADB Server 已停止'
        }
        this.devices = []
        this.selectedSerial = null
        this.selectedDetail = null
        this.foregroundApp = null
        this.runtimeError = null
        this.emitIfChanged()
        return { ok: true, message: 'ADB Server 已停止' }
      }

      if (action === 'restart') {
        await runAdb(config.adbPath, ['kill-server'], { timeoutMs: 12000 })
      }
      const result = await runAdb(config.adbPath, ['start-server'], { timeoutMs: 15000 })
      if (generation !== this.generation) {
        return { ok: false, message: 'ADB Server 操作已被新的操作取代' }
      }
      if (!result.ok) {
        this.adb = {
          ...this.adb,
          health: 'error',
          message: adbFailureMessage(result)
        }
        this.emitIfChanged()
        return {
          ok: false,
          message: adbFailureMessage(result),
          detail: result.stderr || result.stdout
        }
      }

      this.manuallyStopped = false
      this.adb = {
        ...this.adb,
        serverRunning: true,
        health: 'ready',
        message: action === 'restart' ? 'ADB Server 已重启' : 'ADB Server 已启动'
      }
      this.startPolling()
      await this.poll(true)
      return {
        ok: true,
        message: action === 'restart' ? 'ADB Server 已重启' : 'ADB Server 已启动'
      }
    } finally {
      this.serverBusy = false
    }
  }

  dispose(): void {
    this.stopPolling()
  }

  private requireConfig(): AppConfig {
    if (!this.config) this.config = loadConfig()
    return this.config
  }

  private async poll(force = false): Promise<RuntimeState> {
    if (this.manuallyStopped) {
      this.emitIfChanged()
      return this.getState()
    }
    const config = this.config
    if (!config || !config.adbPath) {
      this.emitIfChanged()
      return this.getState()
    }
    if (this.adb.health === 'invalid' || this.adb.health === 'not-configured') {
      this.emitIfChanged()
      return this.getState()
    }
    if (this.polling) return this.getState()
    this.polling = true
    const generation = this.generation
    let stale = false

    try {
      const devices = await listDevices(config.adbPath)
      if (this.isStalePoll(generation)) {
        stale = true
        return this.getState()
      }
      this.devices = devices
      this.adb = {
        ...this.adb,
        path: config.adbPath,
        serverRunning: true,
        health: 'ready',
        message: undefined,
        raw: undefined
      }
      this.runtimeError = null
      this.resolveSelection()

      const selected = this.selectedSerial
        ? devices.find((device) => device.serial === this.selectedSerial)
        : undefined
      if (selected && selected.state === 'device') {
        const now = Date.now()
        if (
          force ||
          this.detailFetchedSerial !== selected.serial ||
          now - this.detailFetchedAt > 15000
        ) {
          try {
            const detail = await getDeviceDetail(config.adbPath, selected.serial)
            if (this.isStalePoll(generation)) {
              stale = true
              return this.getState()
            }
            this.selectedDetail = detail
            this.detailFetchedSerial = selected.serial
            this.detailFetchedAt = now
          } catch (error) {
            this.runtimeError = {
              code: 'DEVICE_DETAIL_FAILED',
              message: '读取设备信息失败：' + errorMessage(error)
            }
          }
        }
        try {
          const foreground = await getForegroundApp(config.adbPath, selected.serial)
          if (this.isStalePoll(generation)) {
            stale = true
            return this.getState()
          }
          this.foregroundApp = foreground
        } catch {
          if (this.isStalePoll(generation)) {
            stale = true
            return this.getState()
          }
          this.foregroundApp = null
        }
      } else {
        this.selectedDetail = null
        this.foregroundApp = null
        this.detailFetchedSerial = null
      }
    } catch (error) {
      if (this.isStalePoll(generation)) {
        stale = true
        return this.getState()
      }
      this.adb = {
        ...this.adb,
        serverRunning: false,
        health: 'error',
        message: errorMessage(error)
      }
      this.runtimeError = {
        code: 'DEVICE_QUERY_FAILED',
        message: errorMessage(error)
      }
      this.devices = []
      this.selectedSerial = null
      this.selectedDetail = null
      this.foregroundApp = null
    } finally {
      this.polling = false
      if (!stale) this.emitIfChanged()
    }

    return this.getState()
  }

  private isStalePoll(generation: number): boolean {
    return this.manuallyStopped || this.generation !== generation
  }

  private resolveSelection(): void {
    const config = this.requireConfig()
    const desired = config.selectedSerial
    if (desired && this.devices.some((device) => device.serial === desired)) {
      this.selectedSerial = desired
      return
    }
    this.selectedSerial = null
    if (this.devices.length === 1) {
      this.selectedSerial = this.devices[0].serial
      config.selectedSerial = this.selectedSerial
      saveConfig(config)
    }
  }

  private startPolling(): void {
    if (this.timer) return
    this.timer = setInterval(() => {
      void this.poll()
    }, 2000)
  }

  private stopPolling(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
  }

  private emitIfChanged(): void {
    const state = this.getState()
    const key = JSON.stringify({ ...state, lastUpdated: 0 })
    if (key === this.lastEmitted) return
    this.lastEmitted = key
    const window = getMainWindow()
    if (window && !window.isDestroyed()) {
      window.webContents.send(IPC.stateChanged, state)
    }
  }
}

export const appState = new AppState()
