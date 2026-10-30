import { chromium } from 'playwright-core'
const browser = await chromium.connectOverCDP('http://127.0.0.1:9223')
const page = browser.contexts().flatMap((context) => context.pages())[0]
if (!page) throw new Error('没有找到 Electron 页面')

const clickButton = async (name) => {
  const buttons = page.locator('button')
  const count = await buttons.count()
  for (let index = 0; index < count; index += 1) {
    const text = (await buttons.nth(index).innerText()).replace(/\s+/g, '')
    if (text === name) {
      await buttons.nth(index).click()
      return
    }
  }
  throw new Error('button not found: ' + name)
}

try {
  await page.getByText('ADB 工具箱').first().waitFor({ timeout: 15000 })
  await page.evaluate(() => window.api.selectDevice('839b71d8'))
  await page.waitForTimeout(800)
  await page.locator('.ant-menu-item').filter({ hasText: '测试工具' }).first().click()
  await page.getByText('测试工具', { exact: true }).first().waitFor({ timeout: 10000 })

  const body = await page.locator('body').innerText()
  if (body.includes('应用操作')) throw new Error('测试工具里仍包含重复的应用操作')
  for (const label of ['设备诊断', '界面操作', 'Monkey 测试', '常用按键', '输入文本']) {
    if (!body.includes(label)) throw new Error('缺少模块：' + label)
  }

  await clickButton('当前界面')
  await page.getByText('当前界面', { exact: true }).last().waitFor({ timeout: 30000 })
  await page.waitForTimeout(800)
  console.log('CURRENT_SCREEN_RESULT=' + (await page.locator('.command-output').last().innerText()).slice(0, 500).replace(/\s+/g, ' '))

  await clickButton('电池')
  await page.waitForTimeout(1000)
  await clickButton('分辨率/密度')
  await page.waitForTimeout(1000)
  const resultText = await page.locator('.command-output').last().innerText()
  console.log('RESOLUTION_RESULT=' + resultText.slice(0, 300).replace(/\s+/g, ' '))

  await page.locator('.ant-menu-item').filter({ hasText: '终端' }).first().click()
  await page.waitForTimeout(1000)
  const terminalBody = await page.locator('body').innerText()
  if (terminalBody.includes('模板')) throw new Error('终端仍包含模板入口')

  await page.locator('.ant-menu-item').filter({ hasText: '应用管理' }).first().click()
  await page.waitForTimeout(1000)
  const search = page.locator('input[placeholder*="搜索"]').first()
  await search.fill('com.tencent.tmgp.sgame')
  await page.waitForTimeout(800)
  const row = page.locator('.ant-table-tbody .ant-table-row').first()
  await row.waitFor({ timeout: 10000 })
  await row.click({ position: { x: 20, y: 10 } })
  await page.waitForTimeout(1000)
  await clickButton('冷启动耗时')
  await page.getByText('冷启动结果').first().waitFor({ timeout: 40000 })
  const cold = await page.locator('.command-output').last().innerText()
  console.log('COLD_START_RESULT=' + cold.slice(0, 500).replace(/\s+/g, ' '))
  if (!cold.includes('TotalTime') && !cold.includes('WaitTime')) throw new Error('冷启动结果缺少耗时字段')

  await page.screenshot({ path: 'tests/e2e/live-test-tools-screenshot.png', fullPage: true })
  console.log('TEST TOOLS E2E OK')
  process.exit(0)
} catch (error) {
  console.error('TEST TOOLS E2E FAILED:', error)
  try {
    await page.screenshot({ path: 'tests/e2e/live-test-tools-screenshot.png', fullPage: true })
  } catch {
    // 截图失败不覆盖原始错误
  }
  process.exit(1)
}
