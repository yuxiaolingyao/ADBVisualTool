import { chromium } from 'playwright-core'

const browser = await chromium.connectOverCDP('http://127.0.0.1:9222')
const page = browser.contexts().flatMap((context) => context.pages())[0]
if (!page) throw new Error('没有找到页面')
const stopButton = page.getByRole('button', { name: '停止' })
if (await stopButton.isEnabled()) {
  await stopButton.click()
}
await page.getByText('未抓取').first().waitFor({ timeout: 10000 })
console.log('STOP OK: 日志已停止，状态为未抓取')
process.exit(0)
