const DEVELOPMENT_ONLY_ENV_KEYS = [
  'ADB_FAKE_SCRIPT',
  'ELECTRON_RENDERER_URL',
  'ADB_TOOL_USER_DATA',
  'ADB_TOOL_DEVTOOLS',
  'ADB_TOOL_ADB_PATH'
] as const

export function clearDevelopmentEnv(
  isPackaged: boolean,
  env: NodeJS.ProcessEnv = process.env
): string[] {
  if (!isPackaged) return []
  const cleared: string[] = []
  for (const key of DEVELOPMENT_ONLY_ENV_KEYS) {
    if (Object.prototype.hasOwnProperty.call(env, key)) {
      delete env[key]
      cleared.push(key)
    }
  }
  return cleared
}

export function resolveRendererUrl(
  rawUrl: string | undefined,
  isPackaged: boolean
): string | null {
  if (!rawUrl || isPackaged) return null
  try {
    const parsed = new URL(rawUrl)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null
    const host = parsed.hostname.toLowerCase()
    const allowed =
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '::1' ||
      host === '[::1]'
    return allowed ? rawUrl : null
  } catch {
    return null
  }
}
