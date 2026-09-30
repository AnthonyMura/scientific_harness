const { contextBridge, ipcRenderer } = require('electron');

// Open-project is the web path-input modal with folder autocomplete on every
// platform (issue 47) — no native OS folder dialog.
contextBridge.exposeInMainWorld('workbench', {
  getConfig: () => ipcRenderer.invoke('workbench:config'),
});