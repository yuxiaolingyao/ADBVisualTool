import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { resolve } from 'node:path'
import { runAdb, validateAdbPath } from '../src/main/services/adb-client'
import { detectAdb } from '../src/main/services/adb-locator'
import {
  getDeviceDetail,
  getForegroundApp,
  listDevices
} from '../src/main/services/device-service'

const fakeScript = resolve('tests/fixtures/fake-adb.mjs')
const FAKE_ADB = 'FAKE_ADB'

beforeAll(() => {
  process.env.ADB_FAKE_SCRIPT = fakeScript
  process.env.ADB_TOOL_ADB_PATH = FAKE_ADB
})

afterAll(() => {
  delete process.env.ADB_FAKE_SCRIPT
  delete process.env.ADB_TOOL_ADB_PATH
})

describe('ADB 子进程集成', () => {
  it('validateAdbPath 能识别假 adb 版本', async () => {
    const result = await validateAdbPath(FAKE_ADB)
    expect(result.ok).toBe(true)
    expect(result.version).toBe('1.0.41')
    expect(result.build).toBe('35.0.2-fake')
  })

  it('runAdb 能拿到 devices -l 输出', async () => {
    const result = await runAdb(FAKE_ADB, ['devices', '-l'])
    expect(result.ok).toBe(true)
    expect(result.code).toBe(0)
    expect(result.stdout).toContain('FAKE123456')
  })

  it('listDevices 能解析出设备并读取详情/前台应用', async () => {
    const devices = await listDevices(FAKE_ADB)
    expect(devices).toHaveLength(1)
    expect(devices[0]).toMatchObject({
      serial: 'FAKE123456',
      state: 'device',
      model: 'Pixel_7'
    })

    const detail = await getDeviceDetail(FAKE_ADB, 'FAKE123456')
    expect(detail.brand).toBe('TestBrand')
    expect(detail.androidVersion).toBe('14')
    expect(detail.sdk).toBe('34')

    const foreground = await getForegroundApp(FAKE_ADB, 'FAKE123456')
    expect(foreground).toMatchObject({
      packageName: 'com.android.settings',
      activity: 'com.android.settings.Settings'
    })
  })

  it('detectAdb 能在假 adb 环境中找到可用路径', async () => {
    const detected = await detectAdb(FAKE_ADB)
    expect(detected.bestPath).toBe(FAKE_ADB)
    expect(detected.bestVersion).toBe('1.0.41')
  })
})
