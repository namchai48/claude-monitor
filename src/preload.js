const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
  onUsageUpdate: (cb) =>
    ipcRenderer.on("usage-update", (_e, result) => cb(result)),
  getSettings: () => ipcRenderer.invoke("settings:get"),
  saveSettings: (payload) => ipcRenderer.invoke("settings:save", payload),
  quit: () => ipcRenderer.send("app:quit"),
  openSettings: () => ipcRenderer.send("app:open-settings"),
  closeSettings: () => ipcRenderer.send("app:close-settings"),
  pollNow: () => ipcRenderer.send("poll:now"),
});
