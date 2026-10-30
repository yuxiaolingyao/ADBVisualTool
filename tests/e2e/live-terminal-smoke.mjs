import { chromium } from 'playwright-core'

const serial = '839b71d8'
const browser = await chromium.connectOverCDP('http://127.0.0.1:9223')
const page = browser.contexts().flatMap((context) => context.pages())[0]
if (!page) throw new Error('没有找到 Electron 页面')

try {
  await page.getByText('ADB 工具箱').first().waitFor({ timeout: 15000 })
  await page.evaluate((target) => window.api.selectDevice(target), serial)
  await page.waitForTimeout(1200)
  await page.locator('.ant-menu-item').filter({ hasText: '终端' }).first().click()
  await page.getByPlaceholder(/输入 adb shell 命令/).waitFor({ timeout: 10000 })

  const input = page.getByPlaceholder(/输入 adb shell 命令/)
  const runButton = page.locator('button').filter({ hasText: /执\s*行/ }).first()

  await input.fill('getprop ro.product.model')
  await runButton.click()
  await page.locator('.terminal-entry').first().waitFor({ timeout: 15000 })
  const first = await page.locator('.terminal-entry').last().innerText()
  console.log('FIRST=' + first.replace(/\s+/g, ' ').slice(0, 300))
  if (!first.includes('成功')) throw new Error('第一条命令未成功')

  await input.fill('dumpsys battery')
  await runButton.click()
  await page.waitForFunction(() => document.querySelectorAll('.terminal-entry').length >= 2, null, { timeout: 15000 })
  const second = await page.locator('.terminal-entry').last().innerText()
  console.log('SECOND=' + second.replace(/\s+/g, ' ').slice(0, 300))

  await page.locator('button').filter({ hasText: /清空终端/ }).first().click()
  await page.waitForFunction(() => document.querySelectorAll('.terminal-entry').length === 0, null, { timeout: 5000 })

  await input.fill('rm /sdcard/Download/definitely-not-exist.txt')
  await runButton.click()
  await page.getByText('危险命令确认').first().waitFor({ timeout: 5000 })
  if (await page.locator('.terminal-entry').count() !== 0) throw new Error('危险命令未确认就执行了')
  await page.keyboard.press('Escape')
  await page.getByText('危险命令确认').first().waitFor({ state: 'hidden', timeout: 5000 }).catch(() => undefined)
  console.log('DANGER_CONFIRM_OK')

  await page.screenshot({ path: 'tests/e2e/live-terminal-screenshot.png', fullPage: true })
  console.log('TERMINAL E2E OK')
  process.exit(0)
} catch (error) {
  console.error('TERMINAL E2E FAILED:', error)
  try {
    await page.screenshot({ path: 'tests/e2e/live-terminal-screenshot.png', fullPage: true })
  } catch {
    // 截图失败不覆盖原始错误
  }
  process.exit(1)
}
