export interface DeviceSummary {
  serial: string
  state: string
  product?: string
  model?: string
  device?: string
  transportId?: string
}

export interface DeviceDetail {
  brand?: string
  manufacturer?: string
  model?: string
  androidVersion?: string
  sdk?: string
  fingerprint?: string
}

export interface ForegroundApp {
  packageName: string
  activity?: string
  raw?: string
}

export type AdbHealth = 'checking' | 'ready' | 'not-configured' | 'invalid' | 'error'

export interface AdbStatus {
  path: string | null
  version: string | null
  build: string | null
  serverRunning: boolean
  health: AdbHealth
  message?: string
  raw?: string
}

export interface AdbCandidate {
  path: string
  source: string
  exists: boolean
  valid?: boolean
  version?: string
  error?: string
}

export interface DetectedAdb {
  candidates: AdbCandidate[]
  bestPath: string | null
  bestVersion: string | null
  error?: string
}

export interface RuntimeError {
  code: string
  message: string
  detail?: string
}

export interface RuntimeState {
  adb: AdbStatus
  devices: DeviceSummary[]
  selectedSerial: string | null
  selectedDetail: DeviceDetail | null
  foregroundApp: ForegroundApp | null
  lastUpdated: number
  error: RuntimeError | null
}

export interface LogSettings {
  bufferLines: number
  saveDir: string
  autoScroll: boolean
}

export interface CaptureSettings {
  screenshotDir: string
  recordDir: string
  bitRate: number
  timeLimit: number
}

export interface MonkeySettings {
  outputDir: string
  defaultCount: number
}

export interface AppConfig {
  adbPath: string | null
  autoDetectAdb: boolean
  selectedSerial: string | null
  log: LogSettings
  capture: CaptureSettings
  monkey: MonkeySettings
  ui: {
    theme: 'dark' | 'light'
  }
  firstRunDone: boolean
}

export type AdbServerAction = 'start' | 'stop' | 'restart'

export interface AppInfo {
  version: string
  platform: string
  configPath: string
  userDataPath: string
  adbPath: string | null
  electronVersion: string
  chromeVersion: string
  nodeVersion: string
}

export interface HealthCheckItem {
  key: string
  label: string
  ok: boolean
  detail: string
}

export interface HealthCheckResult {
  ok: boolean
  checkedAt: string
  items: HealthCheckItem[]
}

export interface ConfigSnapshot {
  config: AppConfig
  configPath: string
  appInfo: AppInfo
}

export interface ServerActionResult {
  ok: boolean
  message: string
  detail?: string
}

export interface AdbValidationResult {
  ok: boolean
  version: string | null
  build: string | null
  message: string
  raw?: string
}

export type DeviceStateKind =
  | 'device'
  | 'unauthorized'
  | 'offline'
  | 'no-permissions'
  | 'unknown'

export interface ParsedLogLine {
  time: string
  level: string
  tag: string
  pid: string
  message: string
}

export interface LogBatchPayload {
  lines: string[]
  receivedAt: number
}

export interface LogStatusPayload {
  running: boolean
  error?: string
}

export interface LogActionResult {
  ok: boolean
  message: string
}

export interface LogPidResult {
  ok: boolean
  pids: string[]
  message: string
}

export interface LogSaveResult {
  ok: boolean
  message: string
  filePath?: string
  lines?: number
}

export type LogExportScope = 'filtered' | 'all'

export interface LogExportRequest {
  directory: string
  fileName: string
  lines: string[]
}

export interface CaptureResult {
  ok: boolean
  message: string
  filePath?: string
}

export interface RecordingState {
  recording: boolean
  serial?: string
  startedAt?: number
  filePath?: string
  error?: string
}

export interface MirroringState {
  mirroring: boolean
  serial?: string
  startedAt?: number
  error?: string
}

export interface CommandResult {
  ok: boolean
  message: string
  output?: string
  command?: string
}

export interface MonkeyStatus {
  running: boolean
  packageName?: string
  startedAt?: number
  count?: number
  output?: string
  reportPath?: string
  logPath?: string
  crashPath?: string
  error?: string
}

export type AppFilter = 'user' | 'system' | 'all'

export interface AppListItem {
  packageName: string
  type: 'user' | 'system'
}

export interface AppDetail {
  packageName: string
  versionName?: string
  versionCode?: string
  codePath?: string
  dataDir?: string
  launcherActivity?: string
  permissions: string[]
  firstInstallTime?: string
  lastUpdateTime?: string
}

export interface AppListResult {
  ok: boolean
  message: string
  apps?: AppListItem[]
}

export interface AppDetailResult {
  ok: boolean
  message: string
  detail?: AppDetail
}

export interface FileEntry {
  name: string
  path: string
  type: 'file' | 'dir' | 'link'
  size: number
  modified: string
}

export interface FileListResult {
  ok: boolean
  message: string
  path?: string
  entries?: FileEntry[]
}

export interface FileTransferResult {
  ok: boolean
  message: string
  filePath?: string
  count?: number
}

export interface FileActionResult {
  ok: boolean
  message: string
  path?: string
}

export interface FileProgress {
  operation: 'upload' | 'download'
  name: string
  percent: number
  message?: string
}

export interface LogTextResult {
  ok: boolean
  message: string
  text?: string
}

export interface LogFileResult {
  ok: boolean
  message: string
  filePath?: string
  lines?: string[]
  truncated?: boolean
}
