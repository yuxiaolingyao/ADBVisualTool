import { chromium } from 'playwright-core'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'

const tmpDir = 'C:\\Users\\yulingxiaoyao\\AppData\\Local\\Temp'
const browser = await chromium.connectOverCDP('http://127.0.0.1:9222')
const page = browser.contexts().flatMap((context) => context.pages())[0]
if (!page) throw new Error('没有找到 Electron 页面')

async function openLogPage() {
  await page.getByText('ADB 工具箱').first().waitFor({ timeout: 15000 })
  const existingClose = page.locator('.ant-modal-close')
  if (await existingClose.isVisible().catch(() => false)) await existingClose.click()
  await page.locator('.ant-menu-item').filter({ hasText: '日志中心' }).first().click()
  await page.getByRole('button', { name: '开始抓取' }).waitFor({ timeout: 10000 })
  await page.getByRole('button', { name: '重置过滤' }).click()
}

async function startCapture() {
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
}

async function exportViaMenu(scopeLabel, fileName) {
  await page.getByRole('button', { name: '导出' }).first().click()
  await page.getByText(scopeLabel, { exact: true }).click()
  const modal = page.locator('.ant-modal-content').filter({ hasText: '导出日志' })
  await modal.waitFor({ timeout: 10000 })
  const nameInput = modal
    .locator('.ant-form-item')
    .filter({ hasText: '文件名' })
    .locator('input')
  const dirInput = modal
    .locator('.ant-form-item')
    .filter({ hasText: '保存目录' })
    .locator('input')
  await nameInput.fill(fileName)
  await dirInput.fill(tmpDir)
  await modal.locator('.ant-modal-footer .ant-btn-primary').click()
  await page.getByText(/已导出/).first().waitFor({ timeout: 15000 })
  const output = path.join(tmpDir, fileName)
  const content = await fs.readFile(output, 'utf8')
  const lines = content.split(/\r?\n/).filter(Boolean)
  console.log('EXPORT ' + scopeLabel + ' lines=' + lines.length + ' file=' + output)
  return { output, lines }
}

try {
  await openLogPage()
  await startCapture()
  await page.getByRole('button', { name: '停止' }).click()
  await page.getByText('未抓取').first().waitFor({ timeout: 10000 })

  await page.evaluate(() => {
    const row = document.querySelector('.log-row[title^="10-"]')
    if (!row) throw new Error('没有可右键的日志行')
    row.dispatchEvent(
      new MouseEvent('contextmenu', {
        bubbles: true,
        cancelable: true,
        clientX: 500,
        clientY: 500,
        button: 2
      })
    )
  })
  await page.locator('.log-context-menu').waitFor({ timeout: 5000 })
  await page.getByText('复制此行', { exact: true }).click()
  await page.getByText('已复制此行').first().waitFor({ timeout: 10000 })
  const clipboard = execFileSync('powershell.exe', ['-NoProfile', '-Command', 'Get-Clipboard'], {
    encoding: 'utf8',
    timeout: 10000
  })
  console.log('CONTEXT COPY=' + clipboard.replace(/\s+/g, ' ').slice(0, 120))
  if (!/\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}\.\d{3}/.test(clipboard)) {
    throw new Error('右键复制此行内容不像日志')
  }

  await page.getByPlaceholder('关键字').fill('Cwb')
  await page.waitForTimeout(1200)
  const filtered = await exportViaMenu('导出筛选日志', 'adb-tool-export-filtered-' + Date.now() + '.txt')
  if (filtered.lines.length === 0) throw new Error('筛选导出没有内容')
  if (!filtered.lines.every((line) => /cwb/i.test(line))) {
    throw new Error('筛选导出包含不匹配行')
  }

  const all = await exportViaMenu('导出全部日志', 'adb-tool-export-all-' + Date.now() + '.txt')
  if (all.lines.length < filtered.lines.length) {
    throw new Error('全量导出行数小于筛选导出')
  }

  const finalStop = page.getByRole('button', { name: '停止' })
  if (await finalStop.isEnabled()) {
    await finalStop.click()
    await page.getByText('未抓取').first().waitFor({ timeout: 10000 })
  }
  console.log('EXPORT + CONTEXT COPY E2E OK')
  process.exit(0)
} catch (error) {
  console.error('EXPORT + CONTEXT COPY E2E FAILED:', error)
  try {
    await page.screenshot({ path: 'tests/e2e/live-log-export-screenshot.png', fullPage: true })
  } catch {
    // 截图失败不覆盖原始错误
  }
  process.exit(1)
}
