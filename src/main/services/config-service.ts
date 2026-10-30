import { app } from 'electron'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync
} from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { z } from 'zod'
import type { AppConfig, AppInfo, ConfigSnapshot } from '@shared/types'

export type ConfigPatch = Partial<Omit<AppConfig, 'log' | 'capture' | 'monkey' | 'ui'>> & {
  log?: Partial<AppConfig['log']>
  capture?: Partial<AppConfig['capture']>
  monkey?: Partial<AppConfig['monkey']>
  ui?: Partial<AppConfig['ui']>
}

const configSchema = z.object({
  adbPath: z.string().nullable(),
  autoDetectAdb: z.boolean(),
  selectedSerial: z.string().nullable(),
  log: z.object({
    bufferLines: z.number().int().min(1000).max(500000),
    saveDir: z.string().min(1),
    autoScroll: z.boolean()
  }),
  capture: z.object({
    screenshotDir: z.string().min(1),
    recordDir: z.string().min(1),
    bitRate: z.number().int().positive(),
    timeLimit: z.number().int().min(1).max(3600)
  }),
  monkey: z.object({
    outputDir: z.string().min(1),
    defaultCount: z.number().int().positive()
  }),
  ui: z.object({
    theme: z.enum(['dark', 'light'])
  }),
  firstRunDone: z.boolean()
})

export function getConfigPath(): string {
  return join(app.getPath('userData'), 'config.json')
}

export function defaultConfig(): AppConfig {
  const baseDir = join(app.getPath('documents'), 'ADB工具箱')
  return {
    adbPath: process.env.ADB_TOOL_ADB_PATH || null,
    autoDetectAdb: true,
    selectedSerial: null,
    log: {
      bufferLines: 50000,
      saveDir: join(baseDir, 'logs'),
      autoScroll: true
    },
    capture: {
      screenshotDir: join(baseDir, 'screenshots'),
      recordDir: join(baseDir, 'records'),
      bitRate: 4000000,
      timeLimit: 3600
    },
    monkey: {
      outputDir: join(baseDir, 'monkey'),
      defaultCount: 1000
    },
    ui: {
      theme: 'dark'
    },
    firstRunDone: false
  }
}

export function applyConfigPatch(base: AppConfig, patch: ConfigPatch): AppConfig {
  return {
    ...base,
    adbPath: patch.adbPath !== undefined ? patch.adbPath : base.adbPath,
    autoDetectAdb: patch.autoDetectAdb !== undefined ? patch.autoDetectAdb : base.autoDetectAdb,
    selectedSerial:
      patch.selectedSerial !== undefined ? patch.selectedSerial : base.selectedSerial,
    firstRunDone: patch.firstRunDone !== undefined ? patch.firstRunDone : base.firstRunDone,
    log: { ...base.log, ...(patch.log ?? {}) },
    capture: { ...base.capture, ...(patch.capture ?? {}) },
    monkey: { ...base.monkey, ...(patch.monkey ?? {}) },
    ui: { ...base.ui, ...(patch.ui ?? {}) }
  }
}

export function ensureDirectories(config: AppConfig): void {
  for (const dir of [
    config.log.saveDir,
    config.capture.screenshotDir,
    config.capture.recordDir,
    config.monkey.outputDir
  ]) {
    try {
      mkdirSync(dir, { recursive: true })
    } catch {
      // 目录创建失败不阻塞启动，使用时会再次报错提示
    }
  }
}

function backupInvalidConfig(filePath: string): void {
  try {
    const target = join(dirname(filePath), 'config.invalid-' + Date.now() + '.json')
    copyFileSync(filePath, target)
  } catch {
    // 备份失败不阻塞，仍使用默认配置
  }
}

const CONFIG_BACKUP_SUFFIX = '.bak'

function cleanupConfigTemps(filePath: string): void {
  const directory = dirname(filePath)
  const prefix = basename(filePath) + '.tmp'
  try {
    for (const name of readdirSync(directory)) {
      if (!name.startsWith(prefix)) continue
      try {
        unlinkSync(join(directory, name))
      } catch {
        // 临时文件被占用时跳过，下次再清
      }
    }
  } catch {
    // 配置目录尚不存在时无需清理
  }
}

function readValidConfig(filePath: string, defaults: AppConfig): AppConfig | null {
  if (!existsSync(filePath)) return null
  try {
    const raw = JSON.parse(readFileSync(filePath, 'utf8')) as unknown
    const objectPatch =
      raw && typeof raw === 'object' ? (raw as ConfigPatch) : ({} as ConfigPatch)
    const merged = applyConfigPatch(defaults, objectPatch)
    const parsed = configSchema.safeParse(merged)
    if (!parsed.success) return null
    ensureDirectories(parsed.data)
    return parsed.data
  } catch {
    return null
  }
}

function restoreConfig(filePath: string, config: AppConfig): void {
  const tempPath = filePath + '.tmp'
  mkdirSync(dirname(filePath), { recursive: true })
  writeFileSync(tempPath, JSON.stringify(config, null, 2), 'utf8')
  renameSync(tempPath, filePath)
}

export function saveConfig(config: AppConfig): void {
  const validated = configSchema.parse(config)
  ensureDirectories(validated)
  const filePath = getConfigPath()
  mkdirSync(dirname(filePath), { recursive: true })
  cleanupConfigTemps(filePath)
  const tempPath = filePath + '.tmp'
  writeFileSync(tempPath, JSON.stringify(validated, null, 2), 'utf8')
  if (existsSync(filePath)) {
    try {
      copyFileSync(filePath, filePath + CONFIG_BACKUP_SUFFIX)
    } catch {
      // 备份失败不阻塞本次保存
    }
  }
  renameSync(tempPath, filePath)
}

export function loadConfig(): AppConfig {
  const defaults = defaultConfig()
  const filePath = getConfigPath()
  cleanupConfigTemps(filePath)

  const primary = readValidConfig(filePath, defaults)
  if (primary) return primary

  if (existsSync(filePath)) backupInvalidConfig(filePath)

  const backupPath = filePath + CONFIG_BACKUP_SUFFIX
  const backup = readValidConfig(backupPath, defaults)
  if (backup) {
    try {
      restoreConfig(filePath, backup)
    } catch {
      // 恢复失败时仍使用读取到的有效配置
    }
    return backup
  }

  if (!existsSync(filePath)) {
    saveConfig(defaults)
    return defaults
  }

  saveConfig(defaults)
  return defaults
}

export function getConfigSnapshot(config: AppConfig): ConfigSnapshot {
  return {
    config,
    configPath: getConfigPath(),
    appInfo: getAppInfo(config)
  }
}

export function getAppInfo(config: AppConfig): AppInfo {
  return {
    version: app.getVersion(),
    platform: process.platform,
    configPath: getConfigPath(),
    userDataPath: app.getPath('userData'),
    adbPath: config.adbPath,
    electronVersion: process.versions.electron,
    chromeVersion: process.versions.chrome,
    nodeVersion: process.versions.node
  }
}
