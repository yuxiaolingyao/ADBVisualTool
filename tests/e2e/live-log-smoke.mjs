import { chromium } from 'playwright-core'

const screenshotPath = 'tests/e2e/live-log-screenshot.png'
let browser
try {
  browser = await chromium.connectOverCDP('http://127.0.0.1:9222')
  const pages = browser.contexts().flatMap((context) => context.pages())
  console.log('PAGES:', pages.map((page) => page.url()).join(' | '))
  const page = pages.find((item) => item.url().includes('index.html')) ?? pages[0]
  if (!page) throw new Error('没有找到 Electron 页面')

  await page.getByText('ADB 工具箱').first().waitFor({ timeout: 15000 })
  await page.locator('.ant-menu-item').filter({ hasText: '日志中心' }).first().click()
  await page.getByRole('button', { name: '开始抓取' }).waitFor({ timeout: 10000 })
  await page.waitForFunction(() => {
    const buttons = Array.from(document.querySelectorAll('button'))
    const start = buttons.find((button) => button.textContent?.includes('开始抓取'))
    return Boolean(start && !start.disabled)
  }, null, { timeout: 20000 })

  await page.getByRole('button', { name: '开始抓取' }).click()
  await page.waitForFunction(() => document.querySelectorAll('.log-row').length > 0, null, {
    timeout: 20000
  })
  const rowsAfterStart = await page.locator('.log-row').count()
  const countAfterStart = await page
    .locator('.ant-card-extra')
    .filter({ hasText: '已接收' })
    .first()
    .innerText()
  console.log('STARTED rows=' + rowsAfterStart + ' count=' + countAfterStart.replace(/\s+/g, ' '))

  await page.getByRole('button', { name: '暂停' }).click()
  await page.waitForTimeout(1500)
  const countWhilePaused = await page
    .locator('.ant-card-extra')
    .filter({ hasText: '已接收' })
    .first()
    .innerText()
  console.log('PAUSED count=' + countWhilePaused.replace(/\s+/g, ' '))

  await page.getByRole('button', { name: '清空显示' }).click()
  await page.getByText('还没有日志。选设备后点“开始抓取”。').waitFor({ timeout: 5000 })
  console.log('CLEARED ok')

  await page.getByRole('button', { name: '继续' }).click()
  await page.waitForFunction(() => document.querySelectorAll('.log-row').length > 0, null, {
    timeout: 10000
  })
  await page.waitForTimeout(1000)
  await page.screenshot({ path: screenshotPath, fullPage: true })
  const finalCount = await page
    .locator('.ant-card-extra')
    .filter({ hasText: '已接收' })
    .first()
    .innerText()
  console.log('FINAL count=' + finalCount.replace(/\s+/g, ' '))
  console.log('LIVE LOG E2E OK')
  process.exit(0)
} catch (error) {
  console.error('LIVE LOG E2E FAILED:', error)
  try {
    if (browser) {
      const pages = browser.contexts().flatMap((context) => context.pages())
      if (pages[0]) await pages[0].screenshot({ path: screenshotPath, fullPage: true })
    }
  } catch {
    // 截图失败不覆盖原始错误
  }
  process.exit(1)
}
