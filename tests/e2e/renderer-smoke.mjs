import { chromium } from 'playwright-core'
import { createServer } from 'node:http'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'

const projectRoot = process.cwd()
const rendererRoot = path.resolve(projectRoot, 'out/renderer')
const screenshotPath = path.resolve(projectRoot, 'tests/e2e/renderer-screenshot.png')
const errorScreenshotPath = path.resolve(projectRoot, 'tests/e2e/renderer-error-screenshot.png')

const browserCandidates = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'
]
const executablePath = browserCandidates.find((candidate) => fs.existsSync(candidate))
if (!executablePath) {
  console.error('没有找到 Edge 或 Chrome，无法执行渲染层检查')
  process.exit(1)
}

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf'
}

const server = createServer(async (request, response) => {
  try {
    const urlPath = decodeURIComponent((request.url ?? '/').split('?')[0])
    const relativePath = urlPath === '/' ? 'index.html' : urlPath.replace(/^\//, '')
    const target = path.resolve(rendererRoot, relativePath)
    if (!target.startsWith(rendererRoot)) {
      response.writeHead(403)
      response.end('forbidden')
      return
    }
    let finalTarget = target
    try {
      const stat = await fsp.stat(finalTarget)
      if (stat.isDirectory()) finalTarget = path.join(finalTarget, 'index.html')
    } catch {
      finalTarget = path.join(rendererRoot, 'index.html')
    }
    const body = await fsp.readFile(finalTarget)
    response.writeHead(200, {
      'Content-Type': mime[path.extname(finalTarget)] ?? 'application/octet-stream'
    })
    response.end(body)
  } catch {
    response.writeHead(404)
    response.end('not found')
  }
})

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
const address = server.address()
const port = typeof address === 'object' && address ? address.port : 0
const url = 'http://127.0.0.1:' + port + '/'

const config = {
  adbPath: 'C:\\Android\\platform-tools\\adb.exe',
  autoDetectAdb: true,
  selectedSerial: 'FAKE123456',
  log: { bufferLines: 50000, saveDir: 'C:\\tmp\\adb-tool\\logs', autoScroll: true },
  capture: {
    screenshotDir: 'C:\\tmp\\adb-tool\\screenshots',
    recordDir: 'C:\\tmp\\adb-tool\\records',
    bitRate: 4000000,
    timeLimit: 180
  },
  monkey: { outputDir: 'C:\\tmp\\adb-tool\\monkey', defaultCount: 1000 },
  ui: { theme: 'dark' },
  firstRunDone: false
}

const runtimeState = {
  adb: {
    path: config.adbPath,
    version: '1.0.41',
    build: '35.0.2-fake',
    serverRunning: true,
    health: 'ready',
    message: 'ADB 可用'
  },
  devices: [
    {
      serial: 'FAKE123456',
      state: 'device',
      product: 'test_device',
      model: 'Pixel_7',
      device: 'panther',
      transportId: '1'
    }
  ],
  selectedSerial: 'FAKE123456',
  selectedDetail: {
    brand: 'TestBrand',
    manufacturer: 'TestManufacturer',
    model: 'Pixel 7',
    androidVersion: '14',
    sdk: '34',
    fingerprint: 'TestBrand/panther/panther:14/UP1A/1:user/release-keys'
  },
  foregroundApp: {
    packageName: 'com.tencent.tmgp.sgame',
    activity: 'com.tencent.tmgp.sgame/.SGameActivity'
  },
  lastUpdated: Date.now(),
  error: null
}

let browser
try {
  browser = await chromium.launch({
    executablePath,
    headless: true,
    args: ['--no-sandbox', '--disable-gpu']
  })
  const page = await browser.newPage({ viewport: { width: 1440, height: 920 } })
  const pageErrors = []
  page.on('pageerror', (error) => pageErrors.push(String(error)))

  await page.addInitScript(
    ({ configValue, stateValue }) => {
      const configPath = 'C:\\Users\\tester\\AppData\\Roaming\\ADB工具箱\\config.json'
      const userDataPath = 'C:\\Users\\tester\\AppData\\Roaming\\ADB工具箱'
      window.api = {
        getConfig: async () => ({
          config: configValue,
          configPath,
          appInfo: {
            version: '0.1.0',
            platform: 'win32',
            configPath,
            userDataPath,
            adbPath: configValue.adbPath
          }
        }),
        getState: async () => stateValue,
        onStateChanged: (callback) => {
          window.__stateChanged = callback
          return () => {}
        },
        updateConfig: async () => ({
          config: configValue,
          configPath,
          appInfo: {
            version: '0.1.0',
            platform: 'win32',
            configPath,
            userDataPath,
            adbPath: configValue.adbPath
          }
        }),
        detectAdb: async () => ({
          candidates: [],
          bestPath: configValue.adbPath,
          bestVersion: '1.0.41'
        }),
        validateAdb: async () => ({
          ok: true,
          version: '1.0.41',
          build: '35.0.2-fake',
          message: 'ADB 可用'
        }),
        setAdbPath: async () => ({
          config: configValue,
          configPath,
          appInfo: {
            version: '0.1.0',
            platform: 'win32',
            configPath,
            userDataPath,
            adbPath: configValue.adbPath
          }
        }),
        adbServer: async () => ({ ok: true, message: 'ok' }),
        refreshDevices: async () => stateValue,
        selectDevice: async () => stateValue,
        pickAdbFile: async () => null,
        pickDirectory: async () => null,
        openPath: async () => ({ ok: true, message: 'ok' }),
        copyText: async () => {},
        getAppInfo: async () => ({
          version: '0.1.0',
          platform: 'win32',
          configPath,
          userDataPath,
          adbPath: configValue.adbPath
        })
      }
    },
    { configValue: config, stateValue: runtimeState }
  )

  await page.goto(url, { waitUntil: 'networkidle' })
  await page.getByText('ADB 工具箱').first().waitFor({ timeout: 20000 })
  await page.getByText('FAKE123456').first().waitFor({ timeout: 20000 })
  await page.getByText('TestBrand').first().waitFor({ timeout: 20000 })
  await page.getByText('com.tencent.tmgp.sgame').first().waitFor({ timeout: 20000 })
  await page.screenshot({ path: screenshotPath, fullPage: true })

  if (pageErrors.length > 0) {
    throw new Error('页面运行错误：' + pageErrors.join(' | '))
  }

  const detailErrorState = {
    ...runtimeState,
    lastUpdated: Date.now(),
    error: {
      code: 'DEVICE_DETAIL_FAILED',
      message: '读取设备信息失败：timeout'
    }
  }
  await page.evaluate((nextState) => {
    window.__stateChanged?.(nextState)
  }, detailErrorState)
  await page.getByText('设备信息读取失败').first().waitFor({ timeout: 10000 })
  await page.getByText(/DEVICE_DETAIL_FAILED/).first().waitFor({ timeout: 10000 })
  await page.screenshot({ path: errorScreenshotPath, fullPage: true })

  console.log('RENDERER E2E OK: 设备列表、设备详情、前台应用、ADB 状态与错误提示已渲染')
} catch (error) {
  console.error('RENDERER E2E FAILED:', error)
  try {
    if (browser) {
      const pages = browser.contexts().flatMap((context) => context.pages())
      if (pages[0]) await pages[0].screenshot({ path: screenshotPath, fullPage: true })
    }
  } catch {
    // 截图失败不覆盖原始错误
  }
  process.exitCode = 1
} finally {
  if (browser) await browser.close()
  server.close()
}
