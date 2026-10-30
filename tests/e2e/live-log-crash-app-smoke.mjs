import { chromium } from 'playwright-core'

const crashShot = 'tests/e2e/live-log-crash-screenshot.png'
const appShot = 'tests/e2e/live-log-app-screenshot.png'
const browser = await chromium.connectOverCDP('http://127.0.0.1:9222')
const page = browser.contexts().flatMap((context) => context.pages())[0]
if (!page) throw new Error('没有找到 Electron 页面')

try {
  await page.getByText('ADB 工具箱').first().waitFor({ timeout: 15000 })
  const existingClose = page.locator('.ant-modal-close')
  if (await existingClose.isVisible().catch(() => false)) {
    await existingClose.click()
    await page.locator('.ant-modal').waitFor({ state: 'hidden', timeout: 5000 }).catch(() => undefined)
  }
  await page.locator('.ant-menu-item').filter({ hasText: '日志中心' }).first().click()
  await page.getByRole('button', { name: '开始抓取' }).waitFor({ timeout: 10000 })
  await page.getByRole('button', { name: '重置过滤' }).click()

  await page.getByRole('button', { name: '崩溃日志' }).click()
  await page.locator('.crash-log').waitFor({ timeout: 10000 })
  const crashText = await page.locator('.crash-log').innerText()
  console.log('CRASH MODAL TEXT=' + crashText.replace(/\s+/g, ' ').slice(0, 120))
  await page.screenshot({ path: crashShot, fullPage: true })
  await page.locator('.ant-modal-close').click()
  await page.locator('.ant-modal').waitFor({ state: 'hidden', timeout: 5000 }).catch(() => undefined)

  await page.getByPlaceholder('包名').fill('com.android.systemui')
  await page.getByRole('button', { name: '抓此应用日志' }).click()
  await page.waitForFunction(() => {
    const input = document.querySelector('input[placeholder="PID（逗号分隔）"]')
    return Boolean(input && input.value.trim().length > 0)
  }, null, { timeout: 15000 })
  await page.waitForFunction(() => document.querySelectorAll('.log-row').length > 0, null, {
    timeout: 20000
  })

  const pidValue = await page.getByPlaceholder('PID（逗号分隔）').inputValue()
  const pids = pidValue.split(',').map((pid) => pid.trim()).filter(Boolean)
  const summary = await page.locator('.log-filter-summary').innerText()
  const rows = await page.locator('.log-row').allTextContents()
  console.log('APP PIDS=' + pids.join(',') + ' SUMMARY=' + summary.replace(/\s+/g, ' '))
  console.log('APP ROWS=' + rows.length + ' FIRST=' + (rows[0] ?? '').slice(0, 90))
  if (pids.length === 0) throw new Error('抓此应用日志没有查到 PID')
  if (rows.length === 0) throw new Error('抓此应用日志没有产生日志')
  if (!rows.every((text) => pids.some((pid) => text.includes('(' + pid + ')')))) {
    throw new Error('抓此应用日志后出现不匹配日志')
  }
  await page.screenshot({ path: appShot, fullPage: true })
  await page.getByRole('button', { name: '停止' }).click()
  await page.getByText('未抓取').first().waitFor({ timeout: 10000 })
  console.log('CRASH + APP LOG E2E OK')
  process.exit(0)
} catch (error) {
  console.error('CRASH + APP LOG E2E FAILED:', error)
  try {
    await page.screenshot({ path: appShot, fullPage: true })
  } catch {
    // 截图失败不覆盖原始错误
  }
  process.exit(1)
}
