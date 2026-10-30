import { create } from 'zustand'
import type { DeepPartial } from '@shared/api'
import type {
  AdbServerAction,
  AppConfig,
  AppInfo,
  DetectedAdb,
  RuntimeState
} from '@shared/types'

interface AppStore {
  config: AppConfig | null
  configPath: string
  appInfo: AppInfo | null
  state: RuntimeState | null
  detected: DetectedAdb | null
  initializing: boolean
  settingsOpen: boolean
  initialize: () => Promise<void>
  setState: (state: RuntimeState) => void
  refreshDevices: () => Promise<void>
  selectDevice: (serial: string | null) => Promise<void>
  detectAdb: () => Promise<DetectedAdb>
  setAdbPath: (path: string | null) => Promise<void>
  updateConfig: (patch: DeepPartial<AppConfig>) => Promise<void>
  adbServer: (action: AdbServerAction) => Promise<{ ok: boolean; message: string }>
  openSettings: () => void
  closeSettings: () => void
}

export const useAppStore = create<AppStore>((set) => ({
  config: null,
  configPath: '',
  appInfo: null,
  state: null,
  detected: null,
  initializing: true,
  settingsOpen: false,

  initialize: async () => {
    try {
      const snapshot = await window.api.getConfig()
      const state = await window.api.getState()
      set({
        config: snapshot.config,
        configPath: snapshot.configPath,
        appInfo: snapshot.appInfo,
        state,
        initializing: false
      })
    } catch (error) {
      set({ initializing: false })
      throw error
    }
  },

  setState: (state) => set({ state }),

  refreshDevices: async () => {
    const state = await window.api.refreshDevices()
    set({ state })
  },

  selectDevice: async (serial) => {
    const state = await window.api.selectDevice(serial)
    set({ state })
  },

  detectAdb: async () => {
    const detected = await window.api.detectAdb()
    set({ detected })
    return detected
  },

  setAdbPath: async (path) => {
    const snapshot = await window.api.setAdbPath(path)
    const state = await window.api.getState()
    set({ config: snapshot.config, state })
  },

  updateConfig: async (patch) => {
    const snapshot = await window.api.updateConfig(patch)
    set({ config: snapshot.config })
  },

  adbServer: async (action) => {
    const result = await window.api.adbServer(action)
    const state = await window.api.getState()
    set({ state })
    return result
  },

  openSettings: () => set({ settingsOpen: true }),
  closeSettings: () => set({ settingsOpen: false })
}))
