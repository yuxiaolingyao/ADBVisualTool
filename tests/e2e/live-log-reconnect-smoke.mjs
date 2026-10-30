import { chromium } from 'playwright-core'
import { execFileSync } from 'node:child_process'
const serial = '3B1F66E9ZUZ661VN'
const adb = 'D:\\Apply\\platform-tools\\adb.exe'
const browser = await chromium.connectOverCDP('http://127.0.0.1:9223')
const page = browser.contexts().flatMap((context) => context.pages())[0]
try {
  await page.getByText('ADB 工具箱').first().waitFor({ timeout: 15000 })
  await page.evaluate((target) => window.api.selectDevice(target), serial)
  await page.waitForTimeout(1000)
  await page.locator('.ant-menu-item').filter({ hasText: '日志中心' }).first().click()
  await page.getByText('日志中心', { exact: true }).first().waitFor({ timeout: 10000 })
  await page.waitForTimeout(500)
  await page.getByPlaceholder('包名').fill('com.tencent.tmgp.sgame')
  await page.locator('button').filter({ hasText: '抓此应用日志' }).first().click()
  await page.getByText(/抓取中/).first().waitFor({ timeout: 15000 })
  console.log('STARTED')
  await page.waitForTimeout(1000)

  execFileSync(adb, ['kill-server'], { timeout: 15000 })
  await page.waitForTimeout(3500)
  const lost = (await page.locator('body').innerText()).replace(/\s+/g, ' ')
  console.log('AFTER_KILL=' + lost.slice(0, 900))
  if (!lost.includes('设备已断开') && !lost.includes('日志已断开') && !lost.includes('重试')) {
    throw new Error('掉线后没有重连状态')
  }

  execFileSync(adb, ['start-server'], { timeout: 15000 })
  await page.waitForTimeout(4000)
  await page.evaluate((target) => window.api.selectDevice(target), serial).catch(() => undefined)
  await page.waitForTimeout(5000)
  const back = (await page.locator('body').innerText()).replace(/\s+/g, ' ')
  console.log('AFTER_RESTART=' + back.slice(0, 1200))
  if (!back.includes('抓取中') && !back.includes('日志已重连')) throw new Error('设备回来后没有自动重连')
  await page.screenshot({ path: 'tests/e2e/live-log-reconnect.png', fullPage: true })
  console.log('LOG RECONNECT E2E OK')
  process.exit(0)
} catch (error) {
  console.error('LOG RECONNECT E2E FAILED:', error)
  try { await page.screenshot({ path: 'tests/e2e/live-log-reconnect.png', fullPage: true }) } catch {}
  process.exit(1)
}
