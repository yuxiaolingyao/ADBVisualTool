import { chromium } from 'playwright-core'
import fs from 'node:fs/promises'

const serial = '839b71d8'
const browser = await chromium.connectOverCDP('http://127.0.0.1:9223')
const page = browser.contexts().flatMap((context) => context.pages())[0]
if (!page) throw new Error('没有找到 Electron 页面')

try {
  await page.getByText('ADB 工具箱').first().waitFor({ timeout: 15000 })
  await page.evaluate((target) => window.api.selectDevice(target), serial)
  await page.waitForTimeout(1200)
  await page.locator('.ant-menu-item').filter({ hasText: '测试工具' }).first().click()
  const monkeyCard = page.locator('.ant-card').filter({ hasText: 'Monkey 测试' }).first()
  await monkeyCard.waitFor({ timeout: 10000 })

  const inputs = monkeyCard.locator('input')
  await inputs.nth(0).fill('com.tencent.tmgp.sgame')
  await inputs.nth(1).fill('10')
  await inputs.nth(2).fill('500')
  await inputs.nth(3).fill('123')
  await monkeyCard.getByRole('button', { name: '开始 Monkey' }).click()
  await page.locator('.ant-modal-confirm-btns .ant-btn-primary').click()

  const waitMonkeyDone = async (timeoutMs) => {
    const end = Date.now() + timeoutMs
    while (Date.now() < end) {
      const state = await page.evaluate(() => window.api.getMonkeyState())
      if (!state.running) return state
      await page.waitForTimeout(500)
    }
    throw new Error('等待 Monkey 结束超时')
  }

  const first = await waitMonkeyDone(60000)
  console.log('FIRST=' + JSON.stringify({ running: first.running, count: first.count, reportPath: first.reportPath, logPath: first.logPath, crashPath: first.crashPath, output: (first.output ?? '').slice(-300) }))
  if (!first.reportPath) throw new Error('没有生成 Monkey 报告')
  if (!first.logPath) throw new Error('没有生成 Monkey logcat')
  if (!first.crashPath) throw new Error('没有生成 Monkey 崩溃日志文件')
  const report = await fs.readFile(first.reportPath, 'utf8')
  const logcat = await fs.readFile(first.logPath, 'utf8')
  const crash = await fs.readFile(first.crashPath, 'utf8')
  console.log('REPORT_BYTES=' + report.length + ' LOGCAT_BYTES=' + logcat.length + ' CRASH_BYTES=' + crash.length)
  if (report.length < 50) throw new Error('Monkey 报告为空')
  if (logcat.length < 100) throw new Error('Monkey logcat 太小')
  if (!/com\.tencent\.tmgp\.sgame|Monkey/i.test(logcat)) throw new Error('Monkey logcat 内容不匹配')

  const startSecond = await page.evaluate(() =>
    window.api.startMonkey('com.tencent.tmgp.sgame', 100, 500, 456)
  )
  console.log('SECOND_START=' + JSON.stringify(startSecond))
  if (!startSecond.ok) throw new Error('第二次 Monkey 启动失败')
  await page.waitForTimeout(2500)
  const during = await page.evaluate(() => window.api.getMonkeyState())
  console.log('SECOND_DURING=' + JSON.stringify({ running: during.running, count: during.count }))
  if (!during.running) throw new Error('第二次 Monkey 没有保持运行')
  const stop = await page.evaluate(() => window.api.stopMonkey())
  console.log('SECOND_STOP=' + JSON.stringify({ ok: stop.ok, message: stop.message }))
  const second = await waitMonkeyDone(20000)
  console.log('SECOND=' + JSON.stringify({ running: second.running, reportPath: second.reportPath, logPath: second.logPath, crashPath: second.crashPath, output: (second.output ?? '').slice(-200) }))
  if (!second.reportPath) throw new Error('停止后没有生成报告')
  if (!second.logPath) throw new Error('停止后没有生成 logcat')
  if (!second.crashPath) throw new Error('停止后没有生成崩溃日志文件')
  const secondLog = await fs.readFile(second.logPath, 'utf8')
  if (secondLog.length < 100) throw new Error('停止后的 logcat 太小')

  await page.screenshot({ path: 'tests/e2e/live-monkey-screenshot.png', fullPage: true })
  console.log('MONKEY E2E OK')
  process.exit(0)
} catch (error) {
  console.error('MONKEY E2E FAILED:', error)
  try {
    await page.screenshot({ path: 'tests/e2e/live-monkey-screenshot.png', fullPage: true })
  } catch {
    // 截图失败不覆盖原始错误
  }
  process.exit(1)
}
