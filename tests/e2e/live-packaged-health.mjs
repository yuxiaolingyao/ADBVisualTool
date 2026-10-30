import { chromium } from 'playwright-core'
const browser = await chromium.connectOverCDP('http://127.0.0.1:9224')
const page = browser.contexts().flatMap((context) => context.pages())[0]
await page.getByText('ADB 工具箱').first().waitFor({ timeout: 15000 })
const health = await page.evaluate(() => window.api.healthCheck())
const info = await page.evaluate(() => window.api.getAppInfo())
console.log(JSON.stringify({ version: info.version, configPath: info.configPath, healthOk: health.ok, items: health.items.map(i => ({label:i.label, ok:i.ok, detail:i.detail})) }))
await page.screenshot({ path: 'tests/e2e/live-packaged-health.png', fullPage: true })
process.exit(0)
