import { chromium } from 'playwright-core'
import fs from 'node:fs/promises'

const browser = await chromium.connectOverCDP('http://127.0.0.1:9222')
const page = browser.contexts().flatMap((context) => context.pages())[0]
if (!page) throw new Error('没有找到 Electron 页面')

try {
  await page.getByText('ADB 工具箱').first().waitFor({ timeout: 15000 })
  const close = page.locator('.ant-modal-close')
  if (await close.isVisible().catch(() => false)) await close.click()
  await page.locator('.ant-menu-item').filter({ hasText: '截图录屏' }).first().click()
  await page.getByRole('button', { name: '一键截图' }).waitFor({ timeout: 10000 })

  await page.getByRole('button', { name: '一键截图' }).click()
  await page.getByText('截图已保存').first().waitFor({ timeout: 20000 })
  await page.waitForFunction(() => {
    const items = Array.from(document.querySelectorAll('.ant-descriptions-item'))
    const item = items.find((element) => element.textContent?.includes('最后截图'))
    return Boolean(item && /\.png/.test(item.textContent ?? ''))
  }, null, { timeout: 10000 })
  const shotPath = await page.evaluate(() => {
    const items = Array.from(document.querySelectorAll('.ant-descriptions-item'))
    const item = items.find((element) => element.textContent?.includes('最后截图'))
    return item?.querySelector('.ant-descriptions-item-content')?.textContent?.trim() ?? ''
  })
  const shot = await fs.readFile(shotPath)
  const pngSignature = shot.subarray(0, 8).toString('hex')
  console.log('SCREENSHOT=' + shotPath + ' bytes=' + shot.length + ' sig=' + pngSignature)
  if (!shotPath.endsWith('.png')) throw new Error('截图路径不是 png')
  if (shot.length < 1000) throw new Error('截图文件太小')
  if (pngSignature !== '89504e470d0a1a0a') throw new Error('截图不是合法 PNG')

  await page.getByRole('button', { name: '开始录屏' }).click()
  await page.getByText('开始录屏').first().waitFor({ timeout: 10000 }).catch(() => undefined)
  await page.waitForTimeout(3000)
  const during = await page.evaluate(() => window.api.getRecordingState())
  console.log('RECORDING STATE=' + JSON.stringify(during))
  if (!during.recording) throw new Error('点击开始后没有进入录屏状态')

  await page.getByRole('button', { name: '停止并保存' }).click()
  await page.getByText('录屏已保存').first().waitFor({ timeout: 20000 })
  await page.waitForTimeout(500)
  const stopped = await page.evaluate(() => window.api.getRecordingState())
  console.log('STOPPED STATE=' + JSON.stringify(stopped))
  if (!stopped.filePath) throw new Error('停止后没有录屏文件路径')
  const video = await fs.readFile(stopped.filePath)
  const ftyp = video.subarray(4, 8).toString('utf8')
  console.log('RECORDING=' + stopped.filePath + ' bytes=' + video.length + ' box=' + ftyp)
  if (video.length < 1000) throw new Error('录屏文件太小')
  if (ftyp !== 'ftyp') throw new Error('录屏不是合法 MP4')

  await page.screenshot({ path: 'tests/e2e/live-capture-screenshot.png', fullPage: true })
  console.log('CAPTURE E2E OK')
  process.exit(0)
} catch (error) {
  console.error('CAPTURE E2E FAILED:', error)
  try {
    await page.screenshot({ path: 'tests/e2e/live-capture-screenshot.png', fullPage: true })
  } catch {
    // 截图失败不覆盖原始错误
  }
  process.exit(1)
}
