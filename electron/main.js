'use strict';

const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');

const isMac = process.platform === 'darwin';

function createWindow() {
  const win = new BrowserWindow({
    width: 1380,
    height: 900,
    minWidth: 1040,
    minHeight: 680,
    backgroundColor: '#eef0f4',
    title: 'PhotoChang 修图工具',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false
    }
  });

  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  // 外部链接交给系统浏览器
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  return win;
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (!isMac) app.quit();
});

const IMAGE_FILTERS = [{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp'] }];

ipcMain.handle('dialog:open-image', async () => {
  const res = await dialog.showOpenDialog({ properties: ['openFile'], filters: IMAGE_FILTERS });
  if (res.canceled || res.filePaths.length === 0) return null;
  const file = res.filePaths[0];
  const ext = path.extname(file).slice(1).toLowerCase() || 'png';
  const data = fs.readFileSync(file).toString('base64');
  return { name: path.basename(file), dataUrl: `data:image/${ext === 'jpg' ? 'jpeg' : ext};base64,${data}` };
});

ipcMain.handle('dialog:save-png', async (_event, payload) => {
  const { defaultName, dataUrl } = payload || {};
  const res = await dialog.showSaveDialog({
    defaultPath: defaultName || 'photochang.png',
    filters: [{ name: 'PNG 图片', extensions: ['png'] }]
  });
  if (res.canceled || !res.filePath) return null;
  const base64 = String(dataUrl).split(',')[1];
  fs.writeFileSync(res.filePath, Buffer.from(base64, 'base64'));
  return res.filePath;
});

ipcMain.handle('shell:show-item', async (_event, filePath) => {
  if (filePath) shell.showItemInFolder(filePath);
  return true;
});
