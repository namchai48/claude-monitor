# Claude Rate Monitor

A tiny always-on-top desktop widget that shows your **Claude subscription rate limits in real time** — the same numbers as Claude Code's `/usage` command, without leaving whatever you're doing.

Each limit bucket (5-hour session, weekly, per-model weekly…) is shown as a bar that fills up as you consume it, with countdowns to the next reset and a desktop notification when usage crosses your alert threshold.

## Features

- 🪟 **Floating widget** — frameless, transparent, always-on-top; drag it anywhere and it remembers its position
- 📊 **Live utilization bars** per limit bucket, color-coded green / amber / red
- ⏱️ **Reset countdowns** for the 5-hour session and weekly windows
- 🔔 **Desktop notifications** when a bucket exceeds your threshold (default 80%), with hysteresis so you're warned once per excursion, not spammed every poll
- ⚙️ **Settings window** — poll interval, alert threshold, launch at login
- 🆓 **Zero token cost** — polling the usage endpoint consumes no tokens

## How it works

The widget reuses the OAuth token that Claude Code stores at `~/.claude/.credentials.json` and polls the subscription usage endpoint (`api.anthropic.com/api/oauth/usage`). Nothing is sent anywhere except to Anthropic's API, and the token never leaves your machine.

> [!NOTE]
> This is the same internal endpoint Claude Code's `/usage` command uses. It is **not part of the documented public API**, so its response shape may change without notice. The widget never refreshes the token itself — if it expires, just open Claude Code once.

## Requirements

- [Claude Code](https://claude.com/claude-code) installed and logged in (a Claude subscription — Pro/Max — is what the limits apply to)
- [Node.js](https://nodejs.org/) and npm to install dependencies

## Getting started

```sh
git clone <this-repo>
cd claude-monitor
npm install
npm start
```

On Windows you can also launch it without a terminal via **`start.cmd`**, which runs the bundled Electron binary directly — handy for a Start Menu shortcut or the `shell:startup` folder. (Or just enable **Open at login** in the widget's settings.)

## Settings

Open settings with the ⚙ button on the widget.

| Setting | Default | Range |
| --- | --- | --- |
| Poll interval | 60 s | 15–600 s |
| Alert above | 80 % | 10–99 % |
| Open at login | off | — |

Settings are stored as JSON in Electron's per-user data directory (e.g. `%APPDATA%\claude-rate-monitor\settings.json` on Windows).

## Troubleshooting

| Widget says | Fix |
| --- | --- |
| `Claude Code credentials not found` | Log in once with `claude` in a terminal |
| `Token expired` / `Token rejected` | Open Claude Code once — it refreshes the token automatically |
| `Rate limited — retrying in …` | The usage endpoint returned HTTP 429; the widget backs off automatically and recovers on its own |
| Gray status dot | Network error or rate limiting; the widget keeps retrying |

## License

[MIT](LICENSE)
