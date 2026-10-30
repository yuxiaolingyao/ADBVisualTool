import { chromium } from 'playwright-core'
const browser = await chromium.connectOverCDP('http://127.0.0.1:9224')
const page = browser.contexts().flatMap((context) => context.pages())[0]
await page.getByText('ADB 工具箱').first().waitFor({ timeout: 15000 })
const result = await page.evaluate(() => window.api.updateConfig({ autoDetectAdb: true }))
console.log(JSON.stringify({ configPath: result.configPath, autoDetectAdb: result.config.autoDetectAdb }))
process.exit(0)
