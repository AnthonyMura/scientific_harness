const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('workbench', {
  getConfig: () => ipcRenderer.invoke('workbench:config'),
  openFolderDialog: () => ipcRenderer.invoke('dialog:openFolder'),
});