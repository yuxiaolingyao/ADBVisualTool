import { chromium } from 'playwright-core'
import { execFileSync } from 'node:child_process'
const serial = '3B1F66E9ZUZ661VN'
const browser = await chromium.connectOverCDP('http://127.0.0.1:9224')
const page = browser.contexts().flatMap((context) => context.pages())[0]
const ps = (script) => {
  try {
    return execFileSync('powershell.exe', ['-NoProfile', '-Command', script], { encoding: 'utf8' })
  } catch (error) {
    return String(error?.stdout ?? '')
  }
}
try {
  await page.getByText('ADB 工具箱').first().waitFor({ timeout: 15000 })
  await page.evaluate((target) => window.api.selectDevice(target), serial)
  await page.waitForTimeout(1000)
  await page.locator('.ant-menu-item').filter({ hasText: '截图录屏' }).first().click()
  await page.getByText('截图录屏', { exact: true }).first().waitFor({ timeout: 10000 })
  await page.locator('button').filter({ hasText: '打开投屏' }).first().click()
  await page.getByText('投屏中').first().waitFor({ timeout: 20000 })
  await page.waitForTimeout(3000)
  const proc = ps("Get-Process scrcpy -ErrorAction SilentlyContinue | Select-Object Id,MainWindowTitle | Format-List")
  console.log('SCRCPY_PROC=' + proc.replace(/\s+/g, ' ').slice(0, 500))
  if (!/Id\s*:/.test(proc)) throw new Error('scrcpy 窗口没有启动')
  console.log('BODY=' + (await page.locator('body').innerText()).replace(/\s+/g, ' ').slice(-900))
  await page.screenshot({ path: 'tests/e2e/live-mirroring.png', fullPage: true })

  await page.locator('button').filter({ hasText: '关闭投屏' }).first().click()
  await page.getByText('未投屏').first().waitFor({ timeout: 20000 })
  await page.waitForTimeout(1000)
  const after = ps("Get-Process scrcpy -ErrorAction SilentlyContinue | Select-Object Id,MainWindowTitle | Format-List")
  console.log('AFTER=' + after.replace(/\s+/g, ' ').slice(0, 300))
  if (after.trim()) throw new Error('关闭后 scrcpy 仍在')
  console.log('MIRRORING E2E OK')
  process.exit(0)
} catch (error) {
  console.error('MIRRORING E2E FAILED:', error)
  try { await page.screenshot({ path: 'tests/e2e/live-mirroring.png', fullPage: true }) } catch {}
  process.exit(1)
}
