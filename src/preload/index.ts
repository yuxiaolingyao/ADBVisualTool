import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type { AppApi } from '../shared/api'
import { IPC } from '../shared/api'
import type {
  FileProgress,
  LogBatchPayload,
  LogStatusPayload,
  RuntimeState
} from '../shared/types'

const api: AppApi = {
  getConfig: () => ipcRenderer.invoke(IPC.configGet),
  updateConfig: (patch) => ipcRenderer.invoke(IPC.configUpdate, patch),
  detectAdb: () => ipcRenderer.invoke(IPC.adbDetect),
  validateAdb: (adbPath) => ipcRenderer.invoke(IPC.adbValidate, adbPath),
  setAdbPath: (adbPath) => ipcRenderer.invoke(IPC.adbSetPath, adbPath),
  adbServer: (action) => ipcRenderer.invoke(IPC.adbServer, action),
  getState: () => ipcRenderer.invoke(IPC.stateGet),
  refreshDevices: () => ipcRenderer.invoke(IPC.deviceRefresh),
  selectDevice: (serial) => ipcRenderer.invoke(IPC.deviceSelect, serial),
  pickAdbFile: () => ipcRenderer.invoke(IPC.dialogPickAdb),
  pickDirectory: () => ipcRenderer.invoke(IPC.dialogPickDirectory),
  openPath: (target) => ipcRenderer.invoke(IPC.shellOpenPath, target),
  copyText: (text) => ipcRenderer.invoke(IPC.clipboardWrite, text),
  getAppInfo: () => ipcRenderer.invoke(IPC.appGetInfo),
  startLog: () => ipcRenderer.invoke(IPC.logStart),
  stopLog: () => ipcRenderer.invoke(IPC.logStop),
  clearDeviceLog: () => ipcRenderer.invoke(IPC.logClearDevice),
  clearLogHistory: () => ipcRenderer.invoke(IPC.logClearHistory),
  takeScreenshot: () => ipcRenderer.invoke(IPC.captureScreenshot),
  startRecording: (durationSeconds) => ipcRenderer.invoke(IPC.captureStartRecording, durationSeconds),
  stopRecording: () => ipcRenderer.invoke(IPC.captureStopRecording),
  getRecordingState: () => ipcRenderer.invoke(IPC.captureRecordingState),
  startMirroring: () => ipcRenderer.invoke(IPC.captureStartMirroring),
  stopMirroring: () => ipcRenderer.invoke(IPC.captureStopMirroring),
  getMirroringState: () => ipcRenderer.invoke(IPC.captureMirroringState),
  installApk: () => ipcRenderer.invoke(IPC.commandInstallApk),
  startPackage: (packageName) => ipcRenderer.invoke(IPC.commandStartPackage, packageName),
  forceStopPackage: (packageName) => ipcRenderer.invoke(IPC.commandForceStop, packageName),
  uninstallPackage: (packageName) => ipcRenderer.invoke(IPC.commandUninstall, packageName),
  clearPackageData: (packageName) => ipcRenderer.invoke(IPC.commandClearData, packageName),
  sendKeyEvent: (key) => ipcRenderer.invoke(IPC.commandKeyEvent, key),
  inputText: (text) => ipcRenderer.invoke(IPC.commandInputText, text),
  startMonkey: (packageName, count, throttle, seed) =>
    ipcRenderer.invoke(IPC.monkeyStart, packageName, count, throttle, seed),
  stopMonkey: () => ipcRenderer.invoke(IPC.monkeyStop),
  getMonkeyState: () => ipcRenderer.invoke(IPC.monkeyState),
  listApps: (filter) => ipcRenderer.invoke(IPC.appsList, filter),
  getAppDetail: (packageName) => ipcRenderer.invoke(IPC.appsDetail, packageName),
  listFiles: (remotePath) => ipcRenderer.invoke(IPC.filesList, remotePath),
  downloadFile: (remotePath) => ipcRenderer.invoke(IPC.filesDownload, remotePath),
  uploadFiles: (remoteDir) => ipcRenderer.invoke(IPC.filesUpload, remoteDir),
  createFolder: (remoteDir, name) => ipcRenderer.invoke(IPC.filesMkdir, remoteDir, name),
  renameFile: (remotePath, newName) => ipcRenderer.invoke(IPC.filesRename, remotePath, newName),
  deleteFile: (remotePath) => ipcRenderer.invoke(IPC.filesDelete, remotePath),
  runShell: (command) => ipcRenderer.invoke(IPC.terminalRun, command),
  cancelShell: () => ipcRenderer.invoke(IPC.terminalCancel),
  onTerminalOutput: (callback) => {
    const listener = (_event: IpcRendererEvent, chunk: string): void => {
      callback(chunk)
    }
    ipcRenderer.on(IPC.terminalOutput, listener)
    return () => {
      ipcRenderer.removeListener(IPC.terminalOutput, listener)
    }
  },
  healthCheck: () => ipcRenderer.invoke(IPC.appHealthCheck),
  onFileProgress: (callback) => {
    const listener = (_event: IpcRendererEvent, progress: FileProgress): void => {
      callback(progress)
    }
    ipcRenderer.on(IPC.filesProgress, listener)
    return () => {
      ipcRenderer.removeListener(IPC.filesProgress, listener)
    }
  },
  resolveLogPids: (packageName) => ipcRenderer.invoke(IPC.logResolvePids, packageName),
  saveLog: (request) => ipcRenderer.invoke(IPC.logSave, request),
  loadLogFile: () => ipcRenderer.invoke(IPC.logLoadFile),
  getCrashLog: () => ipcRenderer.invoke(IPC.logCrash),
  onLogBatch: (callback: (batch: LogBatchPayload) => void) => {
    const listener = (_event: IpcRendererEvent, batch: LogBatchPayload): void => {
      callback(batch)
    }
    ipcRenderer.on(IPC.logBatch, listener)
    return () => {
      ipcRenderer.removeListener(IPC.logBatch, listener)
    }
  },
  onLogStatus: (callback: (status: LogStatusPayload) => void) => {
    const listener = (_event: IpcRendererEvent, status: LogStatusPayload): void => {
      callback(status)
    }
    ipcRenderer.on(IPC.logStatus, listener)
    return () => {
      ipcRenderer.removeListener(IPC.logStatus, listener)
    }
  },
  onStateChanged: (callback: (state: RuntimeState) => void) => {
    const listener = (_event: IpcRendererEvent, state: RuntimeState): void => {
      callback(state)
    }
    ipcRenderer.on(IPC.stateChanged, listener)
    return () => {
      ipcRenderer.removeListener(IPC.stateChanged, listener)
    }
  }
}

contextBridge.exposeInMainWorld('api', api)
