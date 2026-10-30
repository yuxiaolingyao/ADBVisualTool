import { chromium } from 'playwright-core'

const screenshotPath = 'tests/e2e/live-log-filter-screenshot.png'
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
  await page.waitForTimeout(800)

  const dCheckbox = page.getByRole('checkbox', { name: 'D' })
  if (await dCheckbox.isChecked()) {
    await dCheckbox.focus()
    await page.keyboard.press('Space')
  }
  await page.waitForTimeout(1200)
  const debugRows = await page.locator('.log-row.log-level-d').count()
  console.log('LEVEL FILTER: D rows after unchecking D = ' + debugRows)
  if (debugRows > 0) throw new Error('取消 D 级别后仍然出现 D 日志')

  await page.getByRole('button', { name: '重置过滤' }).click()
  await page.waitForTimeout(500)

  await page.getByPlaceholder('Tag（逗号分隔）').fill('Cwb')
  await page.waitForTimeout(1200)
  const tagRows = await page.locator('.log-row').allTextContents()
  console.log('TAG FILTER: rows = ' + tagRows.length + ' first=' + (tagRows[0] ?? '').slice(0, 80))
  if (tagRows.length === 0) throw new Error('Tag 过滤后没有日志')
  if (!tagRows.every((text) => /cwb/i.test(text))) throw new Error('Tag 过滤后出现不匹配日志')

  await page.getByRole('button', { name: '重置过滤' }).click()
  await page.waitForTimeout(500)

  await page.getByPlaceholder('关键字').fill('Cwb')
  await page.waitForTimeout(1200)
  const keywordRows = await page.locator('.log-row').allTextContents()
  console.log(
    'KEYWORD FILTER: rows = ' + keywordRows.length + ' first=' + (keywordRows[0] ?? '').slice(0, 80)
  )
  if (keywordRows.length === 0) throw new Error('关键字过滤后没有日志')
  if (!keywordRows.every((text) => /cwb/i.test(text))) {
    throw new Error('关键字过滤后出现不匹配日志')
  }
  const summary = await page.locator('.log-filter-summary').innerText()
  console.log('SUMMARY: ' + summary.replace(/\s+/g, ' '))
  if (!summary.includes('关键字 Cwb')) throw new Error('过滤条件摘要没有更新')
  await page.screenshot({ path: screenshotPath, fullPage: true })

  await page.getByRole('button', { name: '清空手机日志' }).click()
  await page.locator('.ant-modal-confirm-btns .ant-btn-dangerous').click()
  await page.getByText('手机日志缓冲区已清空').first().waitFor({ timeout: 10000 })
  console.log('CLEAR DEVICE LOG OK')

  await page.getByRole('button', { name: '停止' }).click()
  await page.getByText('未抓取').first().waitFor({ timeout: 10000 })
  console.log('FILTER E2E OK')
  process.exit(0)
} catch (error) {
  console.error('FILTER E2E FAILED:', error)
  try {
    await page.screenshot({ path: screenshotPath, fullPage: true })
  } catch {
    // 截图失败不覆盖原始错误
  }
  process.exit(1)
}
