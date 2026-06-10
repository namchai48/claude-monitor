const { app } = require("electron");
const fs = require("fs");
const path = require("path");

const DEFAULTS = {
  pollIntervalSec: 60,
  alertAbovePct: 80, // notify when a bucket's usage exceeds this
  openAtLogin: false,
  windowPos: null,
};

function settingsPath() {
  return path.join(app.getPath("userData"), "settings.json");
}

function readFile() {
  try {
    return JSON.parse(fs.readFileSync(settingsPath(), "utf8"));
  } catch {
    return {};
  }
}

function load() {
  return { ...DEFAULTS, ...readFile() };
}

function update(partial) {
  const current = readFile();
  fs.mkdirSync(path.dirname(settingsPath()), { recursive: true });
  fs.writeFileSync(
    settingsPath(),
    JSON.stringify({ ...current, ...partial }, null, 2),
    "utf8",
  );
  return load();
}

module.exports = { load, update, DEFAULTS };
