import { _electron as electron } from 'playwright-core'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const projectRoot = process.cwd()
const userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'adb-tool-e2e-'))
const fakeAdb = path.resolve(projectRoot, 'tests/fixtures/fake-adb.mjs')
const executablePath = path.resolve(
  projectRoot,
  'node_modules/electron/dist/electron.exe'
)
const screenshotPath = path.resolve(projectRoot, 'tests/e2e/screenshot.png')

const electronEnv = {
  ...process.env,
  ADB_TOOL_USER_DATA: userDataDir,
  ADB_FAKE_SCRIPT: fakeAdb,
  ADB_TOOL_ADB_PATH: 'FAKE_ADB'
}
// 当前运行环境可能带着 ELECTRON_RUN_AS_NODE，必须去掉，否则 Electron 会按 Node 执行
delete electronEnv.ELECTRON_RUN_AS_NODE

let electronApp
try {
  electronApp = await electron.launch({
    executablePath,
    args: ['.'],
    cwd: projectRoot,
    env: electronEnv
  })

  const page = await electronApp.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  await page.getByText('ADB 工具箱').first().waitFor({ timeout: 20000 })
  await page.getByText('FAKE123456').first().waitFor({ timeout: 20000 })
  await page.getByText('TestBrand').first().waitFor({ timeout: 20000 })
  await page.screenshot({ path: screenshotPath, fullPage: true })
  console.log('E2E OK: 设备列表、设备详情与 ADB 状态已渲染')
} catch (error) {
  if (electronApp) {
    try {
      const page = await electronApp.firstWindow()
      await page.screenshot({ path: screenshotPath, fullPage: true })
    } catch {
      // 截图失败不覆盖原始错误
    }
  }
  console.error('E2E FAILED:', error)
  process.exitCode = 1
} finally {
  if (electronApp) await electronApp.close()
}
