import { chromium } from 'playwright-core'
import { execFileSync } from 'node:child_process'

const serial = '839b71d8'
const adb = 'D:\\Apply\\platform-tools\\adb.exe'
const folder = 'adb-ops-folder'
const folderRenamed = 'adb-ops-folder-renamed'
const file = 'adb-file-ops-test.txt'
const fileRenamed = 'adb-file-ops-renamed.txt'
const browser = await chromium.connectOverCDP('http://127.0.0.1:9223')
const page = browser.contexts().flatMap((context) => context.pages())[0]
if (!page) throw new Error('没有找到 Electron 页面')

const exists = (path) => {
  try {
    execFileSync(adb, ['-s', serial, 'shell', 'test', '-e', path], { timeout: 10000 })
    return true
  } catch {
    return false
  }
}

const waitFor = async (predicate, timeout = 15000) => {
  const end = Date.now() + timeout
  while (Date.now() < end) {
    if (predicate()) return
    await page.waitForTimeout(250)
  }
  throw new Error('等待文件状态超时')
}

const selectRow = async (name) => {
  const search = page.getByPlaceholder('筛选当前目录')
  await search.fill(name)
  await page.waitForTimeout(400)
  const row = page.locator('.ant-table-tbody .ant-table-row').filter({ hasText: name }).first()
  await row.waitFor({ timeout: 10000 })
  await row.locator('.ant-radio-input').click({ force: true })
  await page.getByText(/已选中：/).first().waitFor({ timeout: 5000 })
}

const openToolbar = async (name) => {
  await page.locator('button').filter({ hasText: name }).first().click()
  const modal = page.locator('.ant-modal-content').last()
  await modal.waitFor({ timeout: 5000 })
  return modal
}

const modalButton = (modal) => modal.locator('.ant-modal-footer button:last-child').first()

try {
  await page.getByText('ADB 工具箱').first().waitFor({ timeout: 15000 })
  await page.keyboard.press('Escape').catch(() => undefined)
  await page.evaluate((target) => window.api.selectDevice(target), serial)
  await page.waitForTimeout(1200)
  await page.locator('.ant-menu-item').filter({ hasText: '文件管理' }).first().click()
  await page.waitForFunction(() => document.querySelectorAll('.ant-table-tbody .ant-table-row').length > 0, null, { timeout: 30000 })

  let modal = await openToolbar('新建目录')
  await modal.getByPlaceholder('目录名').fill(folder)
  await modalButton(modal).click()
  await page.getByText('目录已创建').first().waitFor({ timeout: 10000 })
  await waitFor(() => exists('/sdcard/Download/' + folder))

  await selectRow(folder)
  modal = await openToolbar('重命名')
  await modal.getByPlaceholder('新名称').fill(folderRenamed)
  await modalButton(modal).click()
  await page.getByText('重命名成功').first().waitFor({ timeout: 10000 })
  await waitFor(() => exists('/sdcard/Download/' + folderRenamed))

  await selectRow(folderRenamed)
  modal = await openToolbar('删除')
  await modalButton(modal).click()
  await page.getByText('删除成功').first().waitFor({ timeout: 10000 })
  await waitFor(() => !exists('/sdcard/Download/' + folderRenamed))

  await selectRow(file)
  modal = await openToolbar('重命名')
  await modal.getByPlaceholder('新名称').fill(fileRenamed)
  await modalButton(modal).click()
  await page.getByText('重命名成功').first().waitFor({ timeout: 10000 })
  await waitFor(() => exists('/sdcard/Download/' + fileRenamed))

  await selectRow(fileRenamed)
  modal = await openToolbar('删除')
  await modalButton(modal).click()
  await page.getByText('删除成功').first().waitFor({ timeout: 10000 })
  await waitFor(() => !exists('/sdcard/Download/' + fileRenamed))

  await page.screenshot({ path: 'tests/e2e/live-file-ops-screenshot.png', fullPage: true })
  console.log('FILE OPS E2E OK')
  process.exit(0)
} catch (error) {
  console.error('FILE OPS E2E FAILED:', error)
  try {
    await page.screenshot({ path: 'tests/e2e/live-file-ops-screenshot.png', fullPage: true })
  } catch {
    // 截图失败不覆盖原始错误
  }
  process.exit(1)
}
