import { chromium } from 'playwright-core'

const serial = '839b71d8'
const packageName = 'com.tencent.tmgp.sgame'
const browser = await chromium.connectOverCDP('http://127.0.0.1:9223')
const page = browser.contexts().flatMap((context) => context.pages())[0]
if (!page) throw new Error('没有找到 Electron 页面')

try {
  await page.getByText('ADB 工具箱').first().waitFor({ timeout: 15000 })
  await page.evaluate((target) => window.api.selectDevice(target), serial)
  await page.waitForTimeout(1200)
  await page.locator('.ant-menu-item').filter({ hasText: '应用管理' }).first().click()
  await page.getByText('应用管理', { exact: true }).first().waitFor({ timeout: 10000 })
  await page.waitForFunction(() => document.querySelectorAll('.ant-table-tbody .ant-table-row').length > 0, null, { timeout: 30000 })

  const filterInput = page.getByPlaceholder('按包名搜索')
  await filterInput.fill(packageName)
  await page.getByText(packageName, { exact: true }).first().waitFor({ timeout: 10000 })
  const rows = await page.locator('.ant-table-tbody .ant-table-row').count()
  console.log('ROWS=' + rows)

  await page.locator('.ant-table-tbody .ant-table-row').first().click({ position: { x: 20, y: 10 } })
  await page.locator('.ant-drawer-content').waitFor({ timeout: 10000 })
  await page.getByText('版本名', { exact: true }).waitFor({ timeout: 10000 })
  const drawerText = await page.locator('.ant-drawer-content').innerText()
  console.log('DETAIL=' + drawerText.replace(/\s+/g, ' ').slice(0, 700))
  if (!drawerText.includes('版本名') || !drawerText.includes('启动 Activity')) {
    throw new Error('详情缺少版本或 Activity')
  }
  if (!/android\.permission\./.test(drawerText)) {
    throw new Error('详情没有读取到权限')
  }

  await page.screenshot({ path: 'tests/e2e/live-apps-screenshot.png', fullPage: true })
  console.log('APPS E2E OK')
  process.exit(0)
} catch (error) {
  console.error('APPS E2E FAILED:', error)
  try {
    await page.screenshot({ path: 'tests/e2e/live-apps-screenshot.png', fullPage: true })
  } catch {
    // 截图失败不覆盖原始错误
  }
  process.exit(1)
}