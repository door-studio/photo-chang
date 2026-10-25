'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('photoChangNative', {
  isElectron: true,
  platform: process.platform,
  openImage: () => ipcRenderer.invoke('dialog:open-image'),
  savePng: (defaultName, dataUrl) => ipcRenderer.invoke('dialog:save-png', { defaultName, dataUrl }),
  showItemInFolder: (filePath) => ipcRenderer.invoke('shell:show-item', filePath)
});
