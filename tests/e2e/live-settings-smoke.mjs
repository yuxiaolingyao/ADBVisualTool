import { chromium } from 'playwright-core'
const browser = await chromium.connectOverCDP('http://127.0.0.1:9223')
const page = browser.contexts().flatMap((context) => context.pages())[0]
if (!page) throw new Error('没有找到 Electron 页面')

try {
  await page.getByText('ADB 工具箱').first().waitFor({ timeout: 15000 })
  await page.evaluate(() => window.api.selectDevice('839b71d8'))
  await page.waitForTimeout(800)
  await page.locator('.app-header button').filter({ hasText: '设置' }).first().click()
  await page.getByText('设置与验收检查').first().waitFor({ timeout: 10000 })

  const modal = page.locator('.ant-modal-content').last()
  const text = (await modal.innerText()).replace(/\s+/g, ' ')
  console.log('MODAL_TEXT=' + text.slice(0, 1200))

  const result = await page.evaluate(() => window.api.healthCheck())
  console.log('HEALTH=' + JSON.stringify(result))
  if (!result.items || result.items.length < 8) throw new Error('整体检查项不足')

  await modal.locator('button').filter({ hasText: /开始检查/ }).first().click()
  await page.getByText(/检查时间：/).first().waitFor({ timeout: 15000 })
  await page.screenshot({ path: 'tests/e2e/live-settings-screenshot.png', fullPage: true })
  console.log('SETTINGS E2E OK')
  process.exit(0)
} catch (error) {
  console.error('SETTINGS E2E FAILED:', error)
  try {
    await page.screenshot({ path: 'tests/e2e/live-settings-screenshot.png', fullPage: true })
  } catch {
    // 截图失败不覆盖原始错误
  }
  process.exit(1)
}
