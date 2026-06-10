const {
  app,
  BrowserWindow,
  ipcMain,
  Notification,
  screen,
} = require("electron");
const path = require("path");
const settings = require("./settings");
const { fetchUsage } = require("./usage");

let widget = null;
let settingsWin = null;
let pollTimer = null;

// Per-bucket hysteresis so we notify once per excursion above the threshold.
const alertArmed = {};

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (widget) {
      widget.show();
      widget.focus();
    }
  });
}

function createWidget() {
  const cfg = settings.load();
  const opts = {
    width: 320,
    height: 190,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  };
  if (cfg.windowPos) {
    // Only restore a position that is still on a connected display.
    const visible = screen.getAllDisplays().some(({ workArea: a }) => {
      return (
        cfg.windowPos.x >= a.x - 50 &&
        cfg.windowPos.y >= a.y - 50 &&
        cfg.windowPos.x < a.x + a.width &&
        cfg.windowPos.y < a.y + a.height
      );
    });
    if (visible) {
      opts.x = cfg.windowPos.x;
      opts.y = cfg.windowPos.y;
    }
  }
  widget = new BrowserWindow(opts);
  widget.setAlwaysOnTop(true, "screen-saver");
  widget.loadFile(path.join(__dirname, "renderer", "index.html"));

  // Show the last successful snapshot right away so the widget isn't empty
  // while the first poll is in flight (or rate-limited).
  widget.webContents.on("did-finish-load", () => {
    const cached = settings.load().lastUsage;
    if (cached) send({ ...cached, stale: true });
  });

  let moveTimer = null;
  widget.on("moved", () => {
    clearTimeout(moveTimer);
    moveTimer = setTimeout(() => {
      if (!widget) return;
      const [x, y] = widget.getPosition();
      settings.update({ windowPos: { x, y } });
    }, 500);
  });
  widget.on("closed", () => {
    widget = null;
  });
}

function openSettingsWindow() {
  if (settingsWin) {
    settingsWin.focus();
    return;
  }
  settingsWin = new BrowserWindow({
    width: 380,
    height: 320,
    resizable: false,
    minimizable: false,
    maximizable: false,
    title: "Settings",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  settingsWin.loadFile(path.join(__dirname, "renderer", "settings.html"));
  settingsWin.on("closed", () => {
    settingsWin = null;
  });
}

function checkAlerts(result, cfg) {
  if (!result.ok) return;
  for (const b of result.buckets) {
    if (alertArmed[b.key] === undefined) alertArmed[b.key] = true;
    if (alertArmed[b.key] && b.utilization >= cfg.alertAbovePct) {
      alertArmed[b.key] = false;
      const resetStr = b.resetsAt
        ? ` — resets ${new Date(b.resetsAt).toLocaleTimeString()}`
        : "";
      new Notification({
        title: "Claude usage warning",
        body: `${b.label}: ${b.utilization.toFixed(0)}% used${resetStr}`,
      }).show();
    } else if (
      !alertArmed[b.key] &&
      b.utilization < cfg.alertAbovePct - 10
    ) {
      alertArmed[b.key] = true; // re-arm with 10pt hysteresis
    }
  }
}

function send(result) {
  if (widget && !widget.isDestroyed()) {
    widget.webContents.send("usage-update", result);
  }
}

// Exponential backoff when the endpoint rate-limits us (HTTP 429).
let backoffSec = 0;

async function tick() {
  const cfg = settings.load();
  const result = await fetchUsage();
  let delaySec = Math.max(15, cfg.pollIntervalSec);
  if (!result.ok && result.kind === "rate_limited") {
    backoffSec = backoffSec ? Math.min(backoffSec * 2, 900) : delaySec * 2;
    delaySec = Math.max(backoffSec, result.retryAfterSec || 0);
    result.message = `Rate limited — retrying in ${formatDelay(delaySec)}`;
  } else {
    backoffSec = 0;
  }
  if (result.ok) settings.update({ lastUsage: result });
  send(result);
  checkAlerts(result, cfg);
  pollTimer = setTimeout(tick, delaySec * 1000);
}

function formatDelay(sec) {
  return sec < 120 ? `${Math.round(sec)}s` : `${Math.round(sec / 60)}m`;
}

function restartPolling() {
  clearTimeout(pollTimer);
  tick();
}

// ---- IPC ----
ipcMain.handle("settings:get", () => {
  const cfg = settings.load();
  return {
    pollIntervalSec: cfg.pollIntervalSec,
    alertAbovePct: cfg.alertAbovePct,
    openAtLogin: cfg.openAtLogin,
  };
});

ipcMain.handle("settings:save", (_e, payload) => {
  const clean = {};
  if (payload.pollIntervalSec) {
    clean.pollIntervalSec = Math.min(
      600,
      Math.max(15, Number(payload.pollIntervalSec)),
    );
  }
  if (payload.alertAbovePct !== undefined) {
    clean.alertAbovePct = Math.min(99, Math.max(10, Number(payload.alertAbovePct)));
  }
  if (payload.openAtLogin !== undefined) {
    clean.openAtLogin = !!payload.openAtLogin;
    app.setLoginItemSettings({ openAtLogin: clean.openAtLogin });
  }
  settings.update(clean);
  restartPolling();
  return true;
});

ipcMain.on("app:quit", () => app.quit());
ipcMain.on("app:open-settings", () => openSettingsWindow());
ipcMain.on("app:close-settings", () => settingsWin?.close());
ipcMain.on("poll:now", () => restartPolling());

app.whenReady().then(() => {
  createWidget();
  const cfg = settings.load();
  app.setLoginItemSettings({ openAtLogin: cfg.openAtLogin });
  tick();
});

app.on("window-all-closed", () => {
  app.quit();
});
