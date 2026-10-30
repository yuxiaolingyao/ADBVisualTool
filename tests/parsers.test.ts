import { describe, expect, it } from 'vitest'
import {
  buildDeviceDetail,
  deviceStateKind,
  deviceStateLabel,
  parseAdbVersion,
  parseDevicesL,
  parseForegroundApp,
  parseGetprop,
  parseLogcatLine
} from '../src/shared/parsers'

describe('parseDevicesL', () => {
  const output = [
    'List of devices attached',
    'R58M123ABC\tdevice product:beyond1lte model:SM_G973F device:beyond1 transport_id:1',
    '192.168.1.5:5555\toffline',
    'ABCD1234\tunauthorized',
    'XYZ789\tno permissions (user in plugdev group; are your udev rules wrong?); see [http://developer.android.com/tools/device.html]',
    ''
  ].join('\n')

  it('解析已连接设备与属性', () => {
    const devices = parseDevicesL(output)
    expect(devices).toHaveLength(4)
    expect(devices[0]).toMatchObject({
      serial: 'R58M123ABC',
      state: 'device',
      product: 'beyond1lte',
      model: 'SM_G973F',
      device: 'beyond1',
      transportId: '1'
    })
  })

  it('保留网络设备、未授权和无权限状态', () => {
    const devices = parseDevicesL(output)
    expect(devices[1]).toMatchObject({ serial: '192.168.1.5:5555', state: 'offline' })
    expect(devices[2]).toMatchObject({ serial: 'ABCD1234', state: 'unauthorized' })
    expect(devices[3].state.startsWith('no permissions')).toBe(true)
    expect(deviceStateKind(devices[3].state)).toBe('no-permissions')
    expect(deviceStateLabel(devices[2].state)).toBe('未授权')
  })
})

describe('parseGetprop', () => {
  const output = [
    '[ro.product.brand]: [TestBrand]',
    '[ro.product.manufacturer]: [TestManufacturer]',
    '[ro.product.model]: [Pixel 7]',
    '[ro.build.version.release]: [14]',
    '[ro.build.version.sdk]: [34]',
    '[ro.build.fingerprint]: [TestBrand/panther/panther:14/UP1A/1:user/release-keys]',
    ''
  ].join('\n')

  it('解析属性并生成设备详情', () => {
    const props = parseGetprop(output)
    expect(props['ro.product.brand']).toBe('TestBrand')
    expect(props['ro.build.version.sdk']).toBe('34')
    const detail = buildDeviceDetail(props)
    expect(detail.brand).toBe('TestBrand')
    expect(detail.model).toBe('Pixel 7')
    expect(detail.androidVersion).toBe('14')
    expect(detail.sdk).toBe('34')
  })
})

describe('parseForegroundApp', () => {
  it('解析 mCurrentFocus', () => {
    const output =
      '  mCurrentFocus=Window{2f3 u0 com.android.settings/com.android.settings.Settings}'
    expect(parseForegroundApp(output)).toMatchObject({
      packageName: 'com.android.settings',
      activity: 'com.android.settings.Settings'
    })
  })

  it('解析 mResumedActivity 并补全 .Activity', () => {
    const output =
      '  mResumedActivity: ActivityRecord{123 u0 com.tencent.mm/.ui.LauncherUI t45}'
    expect(parseForegroundApp(output)).toMatchObject({
      packageName: 'com.tencent.mm',
      activity: 'com.tencent.mm.ui.LauncherUI'
    })
  })

  it('没有应用时返回 null', () => {
    expect(parseForegroundApp('  mCurrentFocus=Window{abc u0 NotificationShade}')).toBeNull()
  })
})

describe('parseAdbVersion', () => {
  it('解析版本和构建号', () => {
    const output = 'Android Debug Bridge version 1.0.41\nVersion 35.0.2-12723878\n'
    expect(parseAdbVersion(output)).toEqual({
      version: '1.0.41',
      build: '35.0.2-12723878'
    })
  })
})

describe('parseLogcatLine', () => {
  it('解析 -v time 格式', () => {
    const line = '10-30 20:00:00.123 I/ActivityManager( 1234): Start proc com.example'
    expect(parseLogcatLine(line)).toEqual({
      time: '10-30 20:00:00.123',
      level: 'I',
      tag: 'ActivityManager',
      pid: '1234',
      message: 'Start proc com.example'
    })
  })

  it('兼容 threadtime 格式', () => {
    const line = '10-30 20:00:00.123  1234  5678 E AndroidRuntime: FATAL EXCEPTION'
    expect(parseLogcatLine(line)).toMatchObject({
      level: 'E',
      tag: 'AndroidRuntime',
      pid: '1234',
      message: 'FATAL EXCEPTION'
    })
  })

  it('无法解析时保留原文', () => {
    const line = '--------- beginning of main'
    expect(parseLogcatLine(line)).toEqual({
      time: '',
      level: '',
      tag: '',
      pid: '',
      message: line
    })
  })
})
