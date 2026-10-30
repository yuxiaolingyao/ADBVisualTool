import type {
  AdbServerAction,
  AdbValidationResult,
  AppConfig,
  AppDetailResult,
  AppFilter,
  AppInfo,
  AppListResult,
  CaptureResult,
  FileActionResult,
  FileListResult,
  FileProgress,
  FileTransferResult,
  HealthCheckResult,
  CommandResult,
  ConfigSnapshot,
  DetectedAdb,
  LogActionResult,
  LogBatchPayload,
  LogExportRequest,
  LogFileResult,
  LogPidResult,
  LogSaveResult,
  LogStatusPayload,
  LogTextResult,
  MirroringState,
  MonkeyStatus,
  RecordingState,
  RuntimeState,
  ServerActionResult
} from './types'

export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P]
}

export interface AppApi {
  getConfig(): Promise<ConfigSnapshot>
  updateConfig(patch: DeepPartial<AppConfig>): Promise<ConfigSnapshot>
  detectAdb(): Promise<DetectedAdb>
  validateAdb(adbPath: string): Promise<AdbValidationResult>
  setAdbPath(adbPath: string | null): Promise<ConfigSnapshot>
  adbServer(action: AdbServerAction): Promise<ServerActionResult>
  getState(): Promise<RuntimeState>
  refreshDevices(): Promise<RuntimeState>
  selectDevice(serial: string | null): Promise<RuntimeState>
  pickAdbFile(): Promise<string | null>
  pickDirectory(): Promise<string | null>
  openPath(target: string): Promise<{ ok: boolean; message: string }>
  copyText(text: string): Promise<void>
  getAppInfo(): Promise<AppInfo>
  startLog(): Promise<LogActionResult>
  stopLog(): Promise<LogActionResult>
  clearDeviceLog(): Promise<LogActionResult>
  clearLogHistory(): Promise<void>
  resolveLogPids(packageName: string): Promise<LogPidResult>
  saveLog(request: LogExportRequest): Promise<LogSaveResult>
  loadLogFile(): Promise<LogFileResult | null>
  getCrashLog(): Promise<LogTextResult>
  onLogBatch(callback: (batch: LogBatchPayload) => void): () => void
  onLogStatus(callback: (status: LogStatusPayload) => void): () => void
  takeScreenshot(): Promise<CaptureResult>
  startRecording(durationSeconds?: number): Promise<CaptureResult>
  stopRecording(): Promise<CaptureResult>
  getRecordingState(): Promise<RecordingState>
  startMirroring(): Promise<CaptureResult>
  stopMirroring(): Promise<CaptureResult>
  getMirroringState(): Promise<MirroringState>
  installApk(): Promise<CommandResult>
  startPackage(packageName: string): Promise<CommandResult>
  forceStopPackage(packageName: string): Promise<CommandResult>
  uninstallPackage(packageName: string): Promise<CommandResult>
  clearPackageData(packageName: string): Promise<CommandResult>
  sendKeyEvent(key: string): Promise<CommandResult>
  inputText(text: string): Promise<CommandResult>
  startMonkey(
    packageName: string,
    count: number,
    throttle: number,
    seed?: number
  ): Promise<CommandResult>
  stopMonkey(): Promise<CommandResult>
  getMonkeyState(): Promise<MonkeyStatus>
  listApps(filter: AppFilter): Promise<AppListResult>
  getAppDetail(packageName: string): Promise<AppDetailResult>
  listFiles(remotePath: string): Promise<FileListResult>
  downloadFile(remotePath: string): Promise<FileTransferResult>
  uploadFiles(remoteDir: string): Promise<FileTransferResult>
  createFolder(remoteDir: string, name: string): Promise<FileActionResult>
  renameFile(remotePath: string, newName: string): Promise<FileActionResult>
  deleteFile(remotePath: string): Promise<FileActionResult>
  runShell(command: string): Promise<CommandResult>
  cancelShell(): Promise<{ ok: boolean; message: string }>
  onTerminalOutput(callback: (chunk: string) => void): () => void
  healthCheck(): Promise<HealthCheckResult>
  onFileProgress(callback: (progress: FileProgress) => void): () => void
  onStateChanged(callback: (state: RuntimeState) => void): () => void
}

export const IPC = {
  configGet: 'config:get',
  configUpdate: 'config:update',
  adbDetect: 'adb:detect',
  adbValidate: 'adb:validate',
  adbSetPath: 'adb:set-path',
  adbServer: 'adb:server',
  stateGet: 'app:get-state',
  deviceRefresh: 'device:refresh',
  deviceSelect: 'device:select',
  dialogPickAdb: 'dialog:pick-adb',
  dialogPickDirectory: 'dialog:pick-directory',
  shellOpenPath: 'shell:open-path',
  clipboardWrite: 'clipboard:write',
  appGetInfo: 'app:get-info',
  logStart: 'log:start',
  logStop: 'log:stop',
  logClearDevice: 'log:clear-device',
  logClearHistory: 'log:clear-history',
  logResolvePids: 'log:resolve-pids',
  logSave: 'log:save',
  logLoadFile: 'log:load-file',
  logCrash: 'log:crash',
  logBatch: 'log:batch',
  logStatus: 'log:status',
  captureScreenshot: 'capture:screenshot',
  captureStartRecording: 'capture:start-recording',
  captureStopRecording: 'capture:stop-recording',
  captureRecordingState: 'capture:recording-state',
  captureStartMirroring: 'capture:start-mirroring',
  captureStopMirroring: 'capture:stop-mirroring',
  captureMirroringState: 'capture:mirroring-state',
  commandInstallApk: 'command:install-apk',
  commandStartPackage: 'command:start-package',
  commandForceStop: 'command:force-stop',
  commandUninstall: 'command:uninstall',
  commandClearData: 'command:clear-data',
  commandKeyEvent: 'command:key-event',
  commandInputText: 'command:input-text',
  monkeyStart: 'monkey:start',
  monkeyStop: 'monkey:stop',
  monkeyState: 'monkey:state',
  appsList: 'apps:list',
  appsDetail: 'apps:detail',
  filesList: 'files:list',
  filesDownload: 'files:download',
  filesUpload: 'files:upload',
  filesMkdir: 'files:mkdir',
  filesRename: 'files:rename',
  filesDelete: 'files:delete',
  filesProgress: 'files:progress',
  terminalRun: 'terminal:run',
  terminalCancel: 'terminal:cancel',
  terminalOutput: 'terminal:output',
  appHealthCheck: 'app:health-check',
  stateChanged: 'state:changed'
} as const
