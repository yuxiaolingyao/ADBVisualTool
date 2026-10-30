import type {
  DeviceDetail,
  DeviceStateKind,
  DeviceSummary,
  ForegroundApp,
  ParsedLogLine
} from './types'

export interface AdbVersionInfo {
  version: string | null
  build: string | null
}

export function parseAdbVersion(output: string): AdbVersionInfo {
  const versionMatch = output.match(/Android Debug Bridge version\s+([^\s]+)/i)
  const buildMatch = output.match(/^Version\s+(\S+)/im)
  return {
    version: versionMatch ? versionMatch[1] : null,
    build: buildMatch ? buildMatch[1] : null
  }
}

export function parseDevicesL(output: string): DeviceSummary[] {
  const devices: DeviceSummary[] = []
  for (const rawLine of output.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line) continue
    if (/^List of devices attached/i.test(line)) continue
    if (line.startsWith('*')) continue
    if (/^adb server/i.test(line)) continue

    const serialMatch = line.match(/^(\S+)\s+(.+)$/)
    if (!serialMatch) continue
    const serial = serialMatch[1]
    const rest = serialMatch[2]
    const attrMatch = rest.match(/\s(product|model|device|transport_id):/)
    const statePart =
      attrMatch && attrMatch.index !== undefined ? rest.slice(0, attrMatch.index) : rest
    const state = statePart.trim()
    const attrs: Record<string, string> = {}
    if (attrMatch && attrMatch.index !== undefined) {
      const attrText = rest.slice(attrMatch.index)
      const attrRe = /(product|model|device|transport_id):(\S+)/g
      let m: RegExpExecArray | null = attrRe.exec(attrText)
      while (m !== null) {
        attrs[m[1]] = m[2]
        m = attrRe.exec(attrText)
      }
    }
    devices.push({
      serial,
      state,
      product: attrs.product,
      model: attrs.model,
      device: attrs.device,
      transportId: attrs.transport_id
    })
  }
  return devices
}

export function parseGetprop(output: string): Record<string, string> {
  const props: Record<string, string> = {}
  for (const line of output.split(/\r?\n/)) {
    const match = line.match(/^\[([^\]]+)\]:\s*\[(.*)\]\s*$/)
    if (match) props[match[1]] = match[2]
  }
  return props
}

export function buildDeviceDetail(props: Record<string, string>): DeviceDetail {
  return {
    brand: props['ro.product.brand'] || props['ro.product.manufacturer'],
    manufacturer: props['ro.product.manufacturer'],
    model: props['ro.product.model'],
    androidVersion: props['ro.build.version.release'],
    sdk: props['ro.build.version.sdk'],
    fingerprint: props['ro.build.fingerprint']
  }
}

const componentRe =
  /([A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z0-9_]+)+)\/([A-Za-z0-9_$.]+)/

const preferredKeys = ['mCurrentFocus', 'mFocusedApp', 'mResumedActivity', 'topResumedActivity']

function parseComponentLine(line: string): ForegroundApp | null {
  const match = line.match(componentRe)
  if (!match) return null
  const packageName = match[1]
  let activity = match[2]
  if (activity.startsWith('.')) activity = packageName + activity
  else if (!activity.includes('.')) activity = packageName + '.' + activity
  return { packageName, activity, raw: line.trim() }
}

export function parseForegroundApp(output: string): ForegroundApp | null {
  const lines = output.split(/\r?\n/).filter((line) => line.trim().length > 0)
  for (const key of preferredKeys) {
    const line = lines.find((item) => item.includes(key))
    if (line) {
      const parsed = parseComponentLine(line)
      if (parsed) return parsed
    }
  }
  for (const line of lines) {
    const parsed = parseComponentLine(line)
    if (parsed) return parsed
  }
  return null
}

export function deviceStateKind(state: string): DeviceStateKind {
  const normalized = state.trim().toLowerCase()
  if (normalized === 'device') return 'device'
  if (normalized === 'unauthorized') return 'unauthorized'
  if (normalized === 'offline') return 'offline'
  if (normalized.startsWith('no permissions')) return 'no-permissions'
  return 'unknown'
}

export function deviceStateLabel(state: string): string {
  switch (deviceStateKind(state)) {
    case 'device':
      return '已连接'
    case 'unauthorized':
      return '未授权'
    case 'offline':
      return '离线'
    case 'no-permissions':
      return '无权限'
    default:
      return state || '未知'
  }
}

const logcatTimeRe =
  /^(\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}\.\d{3})\s+([VDIWEF])\/([^(]+?)\s*\(\s*(\d+)\):\s?(.*)$/

const logcatThreadTimeRe =
  /^(\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}\.\d{3})\s+(\d+)\s+(\d+)\s+([VDIWEF])\s+(.+?):\s?(.*)$/

export function parseLogcatLine(raw: string): ParsedLogLine {
  const timeMatch = raw.match(logcatTimeRe)
  if (timeMatch) {
    return {
      time: timeMatch[1],
      level: timeMatch[2],
      tag: timeMatch[3].trim(),
      pid: timeMatch[4],
      message: timeMatch[5]
    }
  }
  const threadMatch = raw.match(logcatThreadTimeRe)
  if (threadMatch) {
    return {
      time: threadMatch[1],
      level: threadMatch[4],
      tag: threadMatch[5].trim(),
      pid: threadMatch[2],
      message: threadMatch[6]
    }
  }
  return { time: '', level: '', tag: '', pid: '', message: raw }
}
