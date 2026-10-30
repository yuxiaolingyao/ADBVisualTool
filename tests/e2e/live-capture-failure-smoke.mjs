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
  const shotPath = await page.evaluate(() => {
    const items = Array.from(document.querySelectorAll('.ant-descriptions-item'))
    const item = items.find((element) => element.textContent?.includes('最后截图'))
    return item?.querySelector('.ant-descriptions-item-content')?.textContent?.trim() ?? ''
  })
  const shot = await fs.readFile(shotPath)
  console.log('SCREENSHOT=' + shotPath + ' bytes=' + shot.length)
  if (shot.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') throw new Error('截图不是 PNG')

  await page.getByRole('button', { name: '开始录屏' }).click()
  await page.waitForTimeout(2500)
  const state = await page.evaluate(() => window.api.getRecordingState())
  console.log('RECORDING STATE=' + JSON.stringify(state))
  if (state.recording) throw new Error('录屏意外保持运行，需要手动停止')
  if (!state.error || !state.error.includes('权限监控')) {
    throw new Error('没有显示权限监控的处理提示')
  }
  await page.getByText(/权限监控/).first().waitFor({ timeout: 10000 })
  await page.screenshot({ path: 'tests/e2e/live-capture-failure-screenshot.png', fullPage: true })
  console.log('CAPTURE SCREENSHOT + ERROR GUIDANCE OK')
  process.exit(0)
} catch (error) {
  console.error('CAPTURE FAILURE E2E FAILED:', error)
  try {
    await page.screenshot({ path: 'tests/e2e/live-capture-failure-screenshot.png', fullPage: true })
  } catch {
    // 截图失败不覆盖原始错误
  }
  process.exit(1)
}
