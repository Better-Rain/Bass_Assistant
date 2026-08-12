const { app, BrowserWindow, ipcMain, shell } = require('electron')
const fs = require('node:fs')
const path = require('node:path')
const { fileURLToPath } = require('node:url')

const isDev = Boolean(process.env.VITE_DEV_SERVER_URL)
const isSmokeTest = process.argv.includes('--smoke-test')

const createWindow = async ({ show = true } = {}) => {
  const mainWindow = new BrowserWindow({
    width: 1440,
    height: 940,
    minWidth: 1120,
    minHeight: 760,
    backgroundColor: '#0d0d0f',
    title: 'Redline Bass Tuner',
    autoHideMenuBar: true,
    frame: false,
    titleBarStyle: 'hidden',
    show,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  if (isDev) {
    await mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
    return mainWindow
  }

  await mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  return mainWindow
}

const runSmokeTest = async () => {
  const smokeWindow = await createWindow({ show: false })

  await new Promise((resolve) => setTimeout(resolve, 250))
  const result = await smokeWindow.webContents.executeJavaScript(`(() => {
    const root = document.querySelector('#root')
    const audio = document.querySelector('audio')
    return {
      title: document.title,
      rootRendered: Boolean(root && root.children.length > 0),
      audioPresent: Boolean(audio),
      audioSrc: audio?.src ?? '',
    }
  })()`)

  const passed =
    result.title === 'Redline Bass Tuner' &&
    result.rootRendered &&
    result.audioPresent &&
    result.audioSrc.startsWith('file://') &&
    fs.existsSync(fileURLToPath(result.audioSrc))

  if (!passed) {
    console.error('Electron smoke test failed:', result)
    process.exitCode = 1
  } else {
    console.log('Electron smoke test passed:', result)
  }

  smokeWindow.destroy()
  app.quit()
}

const getFocusedWindow = () => BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]

ipcMain.on('window:minimize', () => {
  getFocusedWindow()?.minimize()
})

ipcMain.on('window:maximize', () => {
  const window = getFocusedWindow()

  if (!window) {
    return
  }

  if (window.isMaximized()) {
    window.unmaximize()
    return
  }

  window.maximize()
})

ipcMain.on('window:close', () => {
  getFocusedWindow()?.close()
})

app.whenReady().then(() => {
  app.setAppUserModelId('com.redline.bass-tuner')
  if (isSmokeTest) {
    void runSmokeTest().catch((error) => {
      console.error('Electron smoke test error:', error)
      process.exitCode = 1
      app.quit()
    })
  } else {
    void createWindow()
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
