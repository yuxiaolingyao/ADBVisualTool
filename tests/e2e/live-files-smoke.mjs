import { chromium } from 'playwright-core'
import fs from 'node:fs/promises'

const serial = '839b71d8'
const name = 'adb-file-test.txt'
const localPath = 'C:/Users/yulingxiaoyao/Downloads/ADB工具箱/files/' + name
const browser = await chromium.connectOverCDP('http://127.0.0.1:9223')
const page = browser.contexts().flatMap((context) => context.pages())[0]
if (!page) throw new Error('没有找到 Electron 页面')

try {
  await page.getByText('ADB 工具箱').first().waitFor({ timeout: 15000 })
  await page.evaluate((target) => window.api.selectDevice(target), serial)
  await page.waitForTimeout(1200)
  await page.locator('.ant-menu-item').filter({ hasText: '文件管理' }).first().click()
  await page.getByText('文件管理', { exact: true }).first().waitFor({ timeout: 10000 })
  await page.waitForFunction(() => document.querySelectorAll('.ant-table-tbody .ant-table-row').length > 0, null, { timeout: 30000 })

  const search = page.getByPlaceholder('筛选当前目录')
  await search.fill(name)
  await page.getByText(name, { exact: true }).first().waitFor({ timeout: 10000 })
  await page.locator('.ant-table-tbody .ant-table-row').first().click({ position: { x: 20, y: 10 } })
  await page.getByRole('button', { name: '下载选中' }).click()
  await page.getByText(/下载完成/).first().waitFor({ timeout: 30000 })
  await page.waitForTimeout(500)
  const content = await fs.readFile(localPath, 'utf8')
  console.log('DOWNLOAD=' + localPath + ' BYTES=' + Buffer.byteLength(content) + ' CONTENT=' + content.trim())
  if (!content.includes('adb-file-manager-test')) throw new Error('下载内容不匹配')
  await page.screenshot({ path: 'tests/e2e/live-files-screenshot.png', fullPage: true })
  console.log('FILES E2E OK')
  process.exit(0)
} catch (error) {
  console.error('FILES E2E FAILED:', error)
  try {
    await page.screenshot({ path: 'tests/e2e/live-files-screenshot.png', fullPage: true })
  } catch {
    // 截图失败不覆盖原始错误
  }
  process.exit(1)
}
