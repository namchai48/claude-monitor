# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

An Electron desktop widget (frameless, transparent, always-on-top) that polls Anthropic's subscription usage endpoint and displays rate-limit utilization per bucket (5-hour session, weekly, per-model weekly, etc.) with desktop notifications when a bucket crosses an alert threshold.

## Commands

- `npm start` — run the app (`electron .`). No build step, no tests, no linter.
- `start.cmd` — launch via the bundled Electron binary directly (no system Node needed); used for shortcuts/autostart on Windows.

## Architecture

Standard Electron three-process split with `contextIsolation: true` / `nodeIntegration: false`; all renderer↔main communication goes through the `window.api` bridge defined in `src/preload.js`. When adding a new IPC channel, it must be wired in three places: the `ipcMain` handler in `src/main.js`, the bridge method in `src/preload.js`, and the caller in `src/renderer/`.

- `src/main.js` — main process: creates the widget and settings windows, owns the poll loop (`tick()` reschedules itself via `setTimeout`, restarted by `restartPolling()` after settings changes or manual refresh), and fires notifications with per-bucket hysteresis (`alertArmed`: one notification per excursion above the threshold, re-armed 10 points below it).
- `src/usage.js` — the data source. Reads Claude Code's OAuth token from `~/.claude/.credentials.json` and calls `https://api.anthropic.com/api/oauth/usage`. This is the same **undocumented internal endpoint** Claude Code's `/usage` command uses — its response shape may change; `normalize()` and `BUCKET_LABELS` are the adaptation layer. The app never refreshes the token itself; on expiry/401 it tells the user to open Claude Code. Polling is free (consumes no tokens).
- `src/settings.js` — JSON settings persisted in Electron `userData` (`settings.json`), merged over `DEFAULTS`. Values are clamped on save in main.js's `settings:save` handler (poll interval 15–600s, alert threshold 10–99%), not in settings.js.
- `src/renderer/` — two pages: `index.html`/`app.js` (the widget: utilization bars, reset countdowns) and `settings.html`/`settings-ui.js`. No framework, plain DOM.

## Conventions

- `fetchUsage()` never throws — it returns `{ ok: false, kind, message }` discriminated results (`no_creds`, `token_expired`, `network`, `api`); the renderer branches on `kind`.
- Utilization values are **percent used** (bars fill up as the limit is consumed), not percent remaining.
- Bucket keys (`five_hour`, `seven_day_opus`, …) appear in three maps that must stay in sync: `BUCKET_LABELS` in usage.js, `shortLabel()` in renderer/app.js, and implicitly in `alertArmed` keys.
- Widget window position is saved (debounced) on move and only restored if still on a connected display.
