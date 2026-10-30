import { chromium } from 'playwright-core'
const browser = await chromium.connectOverCDP('http://127.0.0.1:9224')
const page = browser.contexts().flatMap((context) => context.pages())[0]
await page.getByText('ADB 工具箱').first().waitFor({ timeout: 15000 })
await page.evaluate(() => window.api.selectDevice('3B1F66E9ZUZ661VN'))
await page.waitForTimeout(800)
await page.locator('.ant-menu-item').filter({ hasText: '测试工具' }).first().click()
await page.getByText('测试工具', { exact: true }).first().waitFor({ timeout: 10000 })
const metrics = await page.evaluate(() => {
  const content = document.querySelector('.app-content')
  const left = document.querySelector('.tool-left')
  const right = document.querySelector('.tool-result-col')
  return {
    innerHeight: window.innerHeight,
    content: content ? { clientHeight: content.clientHeight, scrollHeight: content.scrollHeight, scrollTop: content.scrollTop } : null,
    left: left ? { clientWidth: left.clientWidth, clientHeight: left.clientHeight, scrollHeight: left.scrollHeight } : null,
    right: right ? { clientWidth: right.clientWidth, clientHeight: right.clientHeight } : null,
    leftBox: left ? left.getBoundingClientRect().toJSON() : null,
    rightBox: right ? right.getBoundingClientRect().toJSON() : null
  }
})
console.log('METRICS=' + JSON.stringify(metrics))
await page.locator('button').filter({ hasText: '当前界面' }).first().click()
await page.waitForTimeout(1500)
const output = page.locator('.tool-result-output')
const outMetrics = await output.evaluate(el => ({ clientHeight: el.clientHeight, scrollHeight: el.scrollHeight, overflow: getComputedStyle(el).overflow }))
console.log('OUTPUT=' + JSON.stringify(outMetrics))
const scrollY = await page.evaluate(() => window.scrollY)
console.log('WINDOW_SCROLL=' + scrollY)
await page.screenshot({ path: 'tests/e2e/live-tool-scroll.png', fullPage: true })
if (!metrics.left || !metrics.right) throw new Error('左右列不存在')
if (Math.abs(metrics.leftBox.width - metrics.rightBox.width) > 4) throw new Error('左右不是 50/50')
if (metrics.content && metrics.content.scrollHeight > metrics.content.clientHeight + 2) throw new Error('整页还在滚动')
if (metrics.left.scrollHeight <= metrics.left.clientHeight) throw new Error('左栏没有独立滚动')
if (outMetrics.overflow !== 'auto' && outMetrics.overflow !== 'scroll') throw new Error('结果输出没有独立滚动')
console.log('TOOL SCROLL E2E OK')
process.exit(0)
