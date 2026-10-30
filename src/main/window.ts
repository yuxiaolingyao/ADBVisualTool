import { app, BrowserWindow, shell } from 'electron'
import { join } from 'node:path'
import { resolveRendererUrl } from './services/runtime-guard'

let mainWindow: BrowserWindow | null = null
let hideOnClose = false

export function setHideOnClose(value: boolean): void {
  hideOnClose = value
}

export function createMainWindow(): BrowserWindow {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.show()
    mainWindow.focus()
    return mainWindow
  }

  mainWindow = new BrowserWindow({
    width: 1380,
    height: 900,
    minWidth: 1120,
    minHeight: 700,
    show: false,
    backgroundColor: '#141414',
    title: 'ADB 工具箱',
    icon: app.isPackaged
      ? join(process.resourcesPath, 'icons', 'icon.png')
      : join(app.getAppPath(), 'resources', 'icons', 'icon.png'),
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
      spellcheck: false
    }
  })

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.on('close', (event) => {
    if (hideOnClose) {
      event.preventDefault()
      mainWindow?.hide()
    }
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) {
      void shell.openExternal(url)
    }
    return { action: 'deny' }
  })

  const rendererUrl = resolveRendererUrl(process.env.ELECTRON_RENDERER_URL, app.isPackaged)
  if (rendererUrl) {
    void mainWindow.loadURL(rendererUrl)
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  if (!app.isPackaged && process.env.ADB_TOOL_DEVTOOLS === '1') {
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  }

  return mainWindow
}

export function getMainWindow(): BrowserWindow | null {
  return mainWindow
}
