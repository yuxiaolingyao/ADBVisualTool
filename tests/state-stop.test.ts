import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AppConfig, DeviceDetail, DeviceSummary } from '../src/shared/types'

const mocks = vi.hoisted(() => ({
  loadConfig: vi.fn(),
  saveConfig: vi.fn(),
  getConfigSnapshot: vi.fn(),
  getAppInfo: vi.fn(),
  applyConfigPatch: vi.fn(),
  runAdb: vi.fn(),
  adbFailureMessage: vi.fn(),
  detectAdb: vi.fn(),
  validateAdbPath: vi.fn(),
  listDevices: vi.fn(),
  getDeviceDetail: vi.fn(),
  getForegroundApp: vi.fn(),
  send: vi.fn()
}))

vi.mock('electron', () => ({
  nativeTheme: { themeSource: 'dark' }
}))

vi.mock('../src/main/window', () => ({
  getMainWindow: () => ({
    isDestroyed: () => false,
    webContents: { send: mocks.send }
  })
}))

vi.mock('../src/main/services/config-service', () => ({
  loadConfig: mocks.loadConfig,
  saveConfig: mocks.saveConfig,
  getConfigSnapshot: mocks.getConfigSnapshot,
  getAppInfo: mocks.getAppInfo,
  applyConfigPatch: mocks.applyConfigPatch
}))

vi.mock('../src/main/services/adb-client', () => ({
  runAdb: mocks.runAdb,
  adbFailureMessage: mocks.adbFailureMessage
}))

vi.mock('../src/main/services/adb-locator', () => ({
  detectAdb: mocks.detectAdb,
  validateAdbPath: mocks.validateAdbPath
}))

vi.mock('../src/main/services/device-service', () => ({
  listDevices: mocks.listDevices,
  getDeviceDetail: mocks.getDeviceDetail,
  getForegroundApp: mocks.getForegroundApp
}))

import { AppState } from '../src/main/state'

const fakeConfig: AppConfig = {
  adbPath: 'FAKE_ADB',
  autoDetectAdb: false,
  selectedSerial: 'FAKE123456',
  log: { bufferLines: 50000, saveDir: 'C:\\tmp\\logs', autoScroll: true },
  capture: {
    screenshotDir: 'C:\\tmp\\screenshots',
    recordDir: 'C:\\tmp\\records',
    bitRate: 4000000,
    timeLimit: 180
  },
  monkey: { outputDir: 'C:\\tmp\\monkey', defaultCount: 1000 },
  ui: { theme: 'dark' },
  firstRunDone: true
}

const fakeDevice: DeviceSummary = {
  serial: 'FAKE123456',
  state: 'device',
  product: 'test_device',
  model: 'Pixel_7',
  device: 'panther',
  transportId: '1'
}

const fakeDetail: DeviceDetail = {
  brand: 'TestBrand',
  manufacturer: 'TestManufacturer',
  model: 'Pixel 7',
  androidVersion: '14',
  sdk: '34'
}

const okResult = {
  ok: true,
  code: 0,
  stdout: '',
  stderr: '',
  durationMs: 1,
  timedOut: false
}

const states: AppState[] = []

function makeState(): AppState {
  const state = new AppState()
  states.push(state)
  state.initialize()
  return state
}

async function makeReadyState(): Promise<AppState> {
  const state = makeState()
  await state.setAdbPath('FAKE_ADB')
  return state
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.loadConfig.mockReturnValue({ ...fakeConfig })
  mocks.saveConfig.mockImplementation(() => undefined)
  mocks.applyConfigPatch.mockImplementation((base, patch) => ({
    ...base,
    ...patch,
    log: { ...base.log, ...(patch.log ?? {}) },
    capture: { ...base.capture, ...(patch.capture ?? {}) },
    monkey: { ...base.monkey, ...(patch.monkey ?? {}) },
    ui: { ...base.ui, ...(patch.ui ?? {}) }
  }))
  mocks.getConfigSnapshot.mockImplementation((config) => ({
    config,
    configPath: 'C:\\tmp\\config.json',
    appInfo: {
      version: '0.1.0',
      platform: 'win32',
      configPath: 'C:\\tmp\\config.json',
      userDataPath: 'C:\\tmp',
      adbPath: config.adbPath
    }
  }))
  mocks.getAppInfo.mockReturnValue({
    version: '0.1.0',
    platform: 'win32',
    configPath: 'C:\\tmp\\config.json',
    userDataPath: 'C:\\tmp',
    adbPath: 'FAKE_ADB'
  })
  mocks.runAdb.mockResolvedValue(okResult)
  mocks.adbFailureMessage.mockReturnValue('adb failed')
  mocks.detectAdb.mockResolvedValue({
    candidates: [],
    bestPath: null,
    bestVersion: null,
    error: 'not found'
  })
  mocks.validateAdbPath.mockResolvedValue({
    ok: true,
    version: '1.0.41',
    build: '35.0.2-test',
    message: 'ADB 可用'
  })
  mocks.listDevices.mockResolvedValue([fakeDevice])
  mocks.getDeviceDetail.mockResolvedValue(fakeDetail)
  mocks.getForegroundApp.mockResolvedValue(null)
})

afterEach(() => {
  for (const state of states) state.dispose()
  states.length = 0
})

describe('ADB Server 停止语义', () => {
  it('停止后刷新不会自动重启 Server', async () => {
    const state = await makeReadyState()
    expect(state.getState().adb.serverRunning).toBe(true)

    mocks.listDevices.mockClear()
    const stop = await state.adbServer('stop')
    expect(stop.ok).toBe(true)
    expect(state.getState().adb.serverRunning).toBe(false)
    expect(state.getState().devices).toHaveLength(0)

    await state.refresh()
    expect(mocks.listDevices).not.toHaveBeenCalled()
    expect(state.getState().adb.serverRunning).toBe(false)
  })

  it('停止期间的在途 poll 不会覆盖停止状态', async () => {
    const state = await makeReadyState()
    mocks.listDevices.mockClear()

    let resolveDevices: ((value: DeviceSummary[]) => void) | null = null
    const pending = new Promise<DeviceSummary[]>((resolve) => {
      resolveDevices = resolve
    })
    mocks.listDevices.mockImplementationOnce(() => pending)

    const refreshPromise = state.refresh()
    expect(mocks.listDevices).toHaveBeenCalledTimes(1)

    const stop = await state.adbServer('stop')
    expect(stop.ok).toBe(true)

    resolveDevices?.([fakeDevice])
    await refreshPromise

    expect(state.getState().adb.serverRunning).toBe(false)
    expect(state.getState().devices).toHaveLength(0)
  })

  it('停止后点启动可以恢复 Server', async () => {
    const state = await makeReadyState()
    await state.adbServer('stop')
    mocks.listDevices.mockClear()

    const start = await state.adbServer('start')
    expect(start.ok).toBe(true)
    expect(state.getState().adb.serverRunning).toBe(true)
    expect(state.getState().devices).toHaveLength(1)
    expect(mocks.listDevices).toHaveBeenCalledTimes(1)
  })
})
