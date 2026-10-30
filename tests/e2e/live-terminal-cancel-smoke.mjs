import { chromium } from 'playwright-core'
const browser = await chromium.connectOverCDP('http://127.0.0.1:9224')
const page = browser.contexts().flatMap((context) => context.pages())[0]
const button = (name) => page.locator('button').filter({ hasText: name }).first()
try {
  await page.getByText('ADB 工具箱').first().waitFor({ timeout: 15000 })
  await page.evaluate(() => window.api.selectDevice('3B1F66E9ZUZ661VN'))
  await page.waitForTimeout(800)
  await page.locator('.ant-menu-item').filter({ hasText: '终端' }).first().click()
  await page.getByText('终端', { exact: true }).first().waitFor({ timeout: 10000 })
  const input = page.getByPlaceholder(/输入 adb shell 命令/)
  await input.fill('sleep 30')
  const started = Date.now()
  await button('执行').click()
  await page.waitForTimeout(1200)
  if (await button('终止').isDisabled()) throw new Error('终止按钮没有启用')
  await button('终止').click()
  await page.waitForFunction(() => document.querySelectorAll('.terminal-entry').length > 0, null, { timeout: 8000 })
  const elapsed = Date.now() - started
  const body = (await page.locator('body').innerText()).replace(/\s+/g, ' ')
  console.log('ELAPSED_MS=' + elapsed + ' BODY=' + body.slice(-600))
  if (!body.includes('已终止')) throw new Error('没有显示已终止')
  if (elapsed > 8000) throw new Error('终止太慢')
  await input.fill('getprop ro.product.model')
  await button('执行').click()
  await page.waitForFunction(() => document.querySelectorAll('.terminal-entry').length >= 2, null, { timeout: 10000 })
  console.log('NEXT_COMMAND_OK')
  await page.screenshot({ path: 'tests/e2e/live-terminal-cancel.png', fullPage: true })
  console.log('TERMINAL CANCEL E2E OK')
  process.exit(0)
} catch (error) {
  console.error('TERMINAL CANCEL E2E FAILED:', error)
  try { await page.screenshot({ path: 'tests/e2e/live-terminal-cancel.png', fullPage: true }) } catch {}
  process.exit(1)
}
