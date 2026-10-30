import { describe, expect, it } from 'vitest'
import { clearDevelopmentEnv, resolveRendererUrl } from '../src/main/services/runtime-guard'

const DEV_KEYS = [
  'ADB_FAKE_SCRIPT',
  'ELECTRON_RENDERER_URL',
  'ADB_TOOL_USER_DATA',
  'ADB_TOOL_DEVTOOLS',
  'ADB_TOOL_ADB_PATH'
]

describe('clearDevelopmentEnv', () => {
  it('打包环境清除全部开发/测试变量', () => {
    const env: NodeJS.ProcessEnv = {
      ADB_FAKE_SCRIPT: 'fake.mjs',
      ELECTRON_RENDERER_URL: 'http://localhost:5173/',
      ADB_TOOL_USER_DATA: 'C:\\tmp\\user-data',
      ADB_TOOL_DEVTOOLS: '1',
      ADB_TOOL_ADB_PATH: 'FAKE_ADB',
      PATH: 'C:\\Windows'
    }

    const cleared = clearDevelopmentEnv(true, env)
    expect(cleared).toEqual(DEV_KEYS)
    for (const key of DEV_KEYS) {
      expect(env[key]).toBeUndefined()
    }
    expect(env.PATH).toBe('C:\\Windows')
  })

  it('开发环境保留变量', () => {
    const env: NodeJS.ProcessEnv = {
      ADB_FAKE_SCRIPT: 'fake.mjs',
      ELECTRON_RENDERER_URL: 'http://localhost:5173/'
    }

    expect(clearDevelopmentEnv(false, env)).toEqual([])
    expect(env.ADB_FAKE_SCRIPT).toBe('fake.mjs')
    expect(env.ELECTRON_RENDERER_URL).toBe('http://localhost:5173/')
  })
})

describe('resolveRendererUrl', () => {
  it('开发环境只允许本机 dev server', () => {
    expect(resolveRendererUrl('http://localhost:5173/', false)).toBe('http://localhost:5173/')
    expect(resolveRendererUrl('http://127.0.0.1:5173/', false)).toBe('http://127.0.0.1:5173/')
    expect(resolveRendererUrl('https://localhost:5173/', false)).toBe('https://localhost:5173/')
    expect(resolveRendererUrl('http://[::1]:5173/', false)).toBe('http://[::1]:5173/')
  })

  it('拒绝远端地址和非 http(s) 地址', () => {
    expect(resolveRendererUrl('https://example.com/', false)).toBeNull()
    expect(resolveRendererUrl('http://localhost.evil.com:5173/', false)).toBeNull()
    expect(resolveRendererUrl('file:///C:/tmp/index.html', false)).toBeNull()
    expect(resolveRendererUrl('not-a-url', false)).toBeNull()
    expect(resolveRendererUrl(undefined, false)).toBeNull()
  })

  it('打包环境一律拒绝 dev URL', () => {
    expect(resolveRendererUrl('http://localhost:5173/', true)).toBeNull()
    expect(resolveRendererUrl('http://127.0.0.1:5173/', true)).toBeNull()
  })
})
