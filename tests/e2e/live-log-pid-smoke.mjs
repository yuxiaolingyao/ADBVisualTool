import { chromium } from 'playwright-core'

const screenshotPath = 'tests/e2e/live-log-pid-screenshot.png'
const browser = await chromium.connectOverCDP('http://127.0.0.1:9222')
const page = browser.contexts().flatMap((context) => context.pages())[0]
if (!page) throw new Error('没有找到 Electron 页面')

try {
  await page.getByText('ADB 工具箱').first().waitFor({ timeout: 15000 })
  await page.keyboard.press('Escape').catch(() => undefined)
  await page.locator('.ant-menu-item').filter({ hasText: '日志中心' }).first().click()
  await page.getByRole('button', { name: '开始抓取' }).waitFor({ timeout: 10000 })
  await page.getByRole('button', { name: '重置过滤' }).click()

  const stopButton = page.getByRole('button', { name: '停止' })
  if (await stopButton.isEnabled()) {
    await stopButton.click()
    await page.getByText('未抓取').first().waitFor({ timeout: 10000 })
  }
  await page.waitForFunction(() => {
    const buttons = Array.from(document.querySelectorAll('button'))
    const start = buttons.find((button) => button.textContent?.includes('开始抓取'))
    return Boolean(start && !start.disabled)
  }, null, { timeout: 20000 })
  await page.getByRole('button', { name: '开始抓取' }).click()
  await page.waitForFunction(() => document.querySelectorAll('.log-row').length > 0, null, {
    timeout: 20000
  })

  await page.getByPlaceholder('包名').fill('com.android.systemui')
  await page.getByRole('button', { name: '查 PID' }).click()
  await page.waitForFunction(() => {
    const input = document.querySelector('input[placeholder="PID（逗号分隔）"]')
    return Boolean(input && input.value.trim().length > 0)
  }, null, { timeout: 15000 })

  const pidValue = await page.getByPlaceholder('PID（逗号分隔）').inputValue()
  const pids = pidValue.split(',').map((pid) => pid.trim()).filter(Boolean)
  const summary = await page.locator('.log-filter-summary').innerText()
  console.log('PIDS=' + pids.join(',') + ' SUMMARY=' + summary.replace(/\s+/g, ' '))
  if (pids.length === 0) throw new Error('没有查到 PID')
  if (!summary.includes('PID ')) throw new Error('过滤摘要没有 PID')

  await page.waitForTimeout(1200)
  const rows = await page.locator('.log-row').allTextContents()
  console.log('ROWS=' + rows.length + ' FIRST=' + (rows[0] ?? '').slice(0, 90))
  if (rows.length === 0) throw new Error('PID 过滤后没有日志')
  if (!rows.every((text) => pids.some((pid) => text.includes('(' + pid + ')')))) {
    throw new Error('PID 过滤后出现不匹配日志')
  }

  await page.screenshot({ path: screenshotPath, fullPage: true })
  await page.getByRole('button', { name: '停止' }).click()
  await page.getByText('未抓取').first().waitFor({ timeout: 10000 })
  console.log('PID FILTER E2E OK')
  process.exit(0)
} catch (error) {
  console.error('PID FILTER E2E FAILED:', error)
  try {
    await page.screenshot({ path: screenshotPath, fullPage: true })
  } catch {
    // 截图失败不覆盖原始错误
  }
  process.exit(1)
}
