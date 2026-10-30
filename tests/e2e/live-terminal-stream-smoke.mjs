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
  await input.fill('logcat -v time')
  await button('执行').click()
  await page.waitForTimeout(2500)
  const during = await page.locator('.terminal-entry').last().innerText()
  console.log('DURING=' + during.replace(/\s+/g, ' ').slice(0, 600))
  if (!during.includes('执行中')) throw new Error('没有执行中状态')
  if (during.replace(/\s+/g, ' ').length < 80) throw new Error('没有实时输出')
  if (await button('终止').isDisabled()) throw new Error('终止按钮未启用')
  await button('终止').click()
  await page.waitForTimeout(1200)
  const after = await page.locator('.terminal-entry').last().innerText()
  console.log('AFTER=' + after.replace(/\s+/g, ' ').slice(0, 500))
  if (!after.includes('已终止')) throw new Error('没有显示已终止')
  await page.screenshot({ path: 'tests/e2e/live-terminal-stream.png', fullPage: true })
  console.log('TERMINAL STREAM E2E OK')
  process.exit(0)
} catch (error) {
  console.error('TERMINAL STREAM E2E FAILED:', error)
  try { await page.screenshot({ path: 'tests/e2e/live-terminal-stream.png', fullPage: true }) } catch {}
  process.exit(1)
}
