import { app, BrowserWindow } from 'electron'
import { createMainWindow, getMainWindow, setHideOnClose } from './window'
import { createTray, disposeTray } from './tray'
import { registerIpc } from './ipc'
import { captureService } from './services/capture-service'
import { logService } from './services/log-service'
import { monkeyService } from './services/monkey-service'
import { clearDevelopmentEnv } from './services/runtime-guard'
import { appState } from './state'

// 打包后不再接受开发/测试环境变量；必须在 setPath、创建窗口和调用 adb 之前执行
const clearedEnvKeys = clearDevelopmentEnv(app.isPackaged)
if (clearedEnvKeys.length > 0) {
  console.warn('[main] 生产环境已忽略开发/测试环境变量：' + clearedEnvKeys.join(', '))
}

if (process.env.ADB_TOOL_USER_DATA) {
  app.setPath('userData', process.env.ADB_TOOL_USER_DATA)
}

app.setName('ADB工具箱')
app.setAppUserModelId('com.local.adbvisualtool')

process.on('uncaughtException', (error) => {
  console.error('[main] uncaughtException', error)
})

process.on('unhandledRejection', (reason) => {
  console.error('[main] unhandledRejection', reason)
})

const gotSingleInstanceLock = app.requestSingleInstanceLock()

if (!gotSingleInstanceLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    const window = getMainWindow()
    if (!window) return
    if (window.isMinimized()) window.restore()
    window.show()
    window.focus()
  })

  app
    .whenReady()
    .then(() => {
      try {
        appState.initialize()
      } catch (error) {
        console.error('[main] 初始化配置失败', error)
      }
      registerIpc()
      createMainWindow()
      if (!createTray()) {
        console.warn('[main] 托盘创建失败，关闭窗口将直接退出')
      }
      void appState.bootstrap().catch((error) => {
        console.error('[main] 启动设备轮询失败', error)
      })

      app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
      })
    })
    .catch((error) => {
      console.error('[main] 启动失败', error)
    })

  app.on('before-quit', () => {
    setHideOnClose(false)
    disposeTray()
    monkeyService.dispose()
    captureService.dispose()
    logService.dispose()
    appState.dispose()
  })

  app.on('window-all-closed', () => {
    monkeyService.dispose()
    captureService.dispose()
    logService.dispose()
    appState.dispose()
    if (process.platform !== 'darwin') app.quit()
  })
}
