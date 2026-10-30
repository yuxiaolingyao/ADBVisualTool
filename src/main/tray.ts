import { app, Menu, nativeImage, shell, Tray } from 'electron'
import { join } from 'node:path'
import { appState } from './state'
import { createMainWindow, getMainWindow, setHideOnClose } from './window'

let tray: Tray | null = null

function trayIconPath(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'icons', 'tray.png')
    : join(app.getAppPath(), 'resources', 'icons', 'tray.png')
}

function showMainWindow(): void {
  const window = getMainWindow() ?? createMainWindow()
  if (window.isMinimized()) window.restore()
  window.show()
  window.focus()
}

export function createTray(): boolean {
  if (tray) return true
  try {
    const image = nativeImage.createFromPath(trayIconPath())
    if (image.isEmpty()) return false
    tray = new Tray(image)
    tray.setToolTip('ADB 工具箱')
    tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: '显示主窗口', click: showMainWindow },
        {
          label: '隐藏到托盘',
          click: () => {
            getMainWindow()?.hide()
          }
        },
        { type: 'separator' },
        {
          label: '刷新设备',
          click: () => {
            void appState.refresh().catch(() => undefined)
          }
        },
        {
          label: '打开日志目录',
          click: () => {
            void shell.openPath(app.getPath('logs'))
          }
        },
        { type: 'separator' },
        { label: '退出', click: () => app.quit() }
      ])
    )
    tray.on('double-click', showMainWindow)
    setHideOnClose(true)
    return true
  } catch (error) {
    console.warn('[tray] 创建托盘失败', error)
    tray = null
    return false
  }
}

export function disposeTray(): void {
  tray?.destroy()
  tray = null
}
