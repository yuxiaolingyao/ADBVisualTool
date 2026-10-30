import { chromium } from 'playwright-core'
import fs from 'node:fs/promises'

const serial = '839b71d8'
const browser = await chromium.connectOverCDP('http://127.0.0.1:9223')
const page = browser.contexts().flatMap((context) => context.pages())[0]
if (!page) throw new Error('没有找到 Electron 页面')

try {
  await page.getByText('ADB 工具箱').first().waitFor({ timeout: 15000 })
  await page.evaluate((target) => window.api.selectDevice(target), serial)
  await page.waitForTimeout(1500)
  const close = page.locator('.ant-modal-close')
  if (await close.isVisible().catch(() => false)) await close.click()
  await page.locator('.ant-menu-item').filter({ hasText: '截图录屏' }).first().click()
  await page.getByRole('button', { name: '开始录屏' }).waitFor({ timeout: 10000 })

  const durationInput = page.locator('.record-duration input')
  await durationInput.fill('1')
  await durationInput.press('Enter')
  await page.waitForTimeout(300)

  await page.getByRole('button', { name: '开始录屏' }).click()
  await page.getByText('开始录屏').first().waitFor({ timeout: 10000 }).catch(() => undefined)
  await page.waitForTimeout(8000)

  const during = await page.evaluate(() => window.api.getRecordingState())
  console.log('DURING=' + JSON.stringify(during))
  if (!during.recording) throw new Error('没有进入录屏状态')

  await page.getByRole('button', { name: '停止并保存' }).click()
  await page.waitForFunction(() => {
    const body = document.body.innerText
    return body.includes('录屏已保存') || body.includes('录屏失败') || body.includes('停止录屏超时')
  }, null, { timeout: 25000 })
  const stopped = await page.evaluate(() => window.api.getRecordingState())
  console.log('STOPPED=' + JSON.stringify(stopped))
  if (!stopped.filePath) throw new Error('停止后没有文件')

  const video = await fs.readFile(stopped.filePath)
  const ftyp = video.subarray(4, 8).toString('utf8')
  console.log('VIDEO=' + stopped.filePath + ' bytes=' + video.length + ' box=' + ftyp)
  if (video.length < 1000 || ftyp !== 'ftyp') throw new Error('录屏不是有效 MP4')

  await page.screenshot({ path: 'tests/e2e/live-scrcpy-record-screenshot.png', fullPage: true })
  console.log('SCRCPY RECORD E2E OK')
  process.exit(0)
} catch (error) {
  console.error('SCRCPY RECORD E2E FAILED:', error)
  try {
    await page.screenshot({ path: 'tests/e2e/live-scrcpy-record-screenshot.png', fullPage: true })
  } catch {
    // 截图失败不覆盖原始错误
  }
  process.exit(1)
}
