// Reads Claude Code's OAuth credentials from ~/.claude/.credentials.json and
// queries the subscription usage endpoint. Returns utilization (% used) per
// limit bucket. Polling this endpoint is free — no tokens are consumed.
//
// Note: this is the same internal endpoint Claude Code's /usage command uses.
// It is not part of the documented public API and could change shape.

const fs = require("fs");
const os = require("os");
const path = require("path");

const USAGE_URL = "https://api.anthropic.com/api/oauth/usage";

const BUCKET_LABELS = {
  five_hour: "Session (5h)",
  seven_day: "Weekly (all)",
  seven_day_opus: "Weekly Opus",
  seven_day_sonnet: "Weekly Sonnet",
  seven_day_cowork: "Weekly Cowork",
  seven_day_oauth_apps: "Weekly apps",
};

function readCredentials() {
  const file = path.join(os.homedir(), ".claude", ".credentials.json");
  try {
    const oauth = JSON.parse(fs.readFileSync(file, "utf8")).claudeAiOauth;
    if (!oauth?.accessToken) return null;
    return oauth;
  } catch {
    return null;
  }
}

function normalize(raw, subscriptionType) {
  const buckets = [];
  for (const [key, label] of Object.entries(BUCKET_LABELS)) {
    const b = raw[key];
    if (b && typeof b.utilization === "number") {
      buckets.push({ key, label, utilization: b.utilization, resetsAt: b.resets_at });
    }
  }
  const extra =
    raw.extra_usage?.is_enabled && typeof raw.extra_usage.utilization === "number"
      ? {
          utilization: raw.extra_usage.utilization,
          usedCredits: raw.extra_usage.used_credits,
          monthlyLimit: raw.extra_usage.monthly_limit,
        }
      : null;
  return { buckets, extra, subscriptionType };
}

async function fetchUsage() {
  const cred = readCredentials();
  if (!cred) {
    return {
      ok: false,
      kind: "no_creds",
      message: "Claude Code credentials not found — log in with `claude` first",
    };
  }
  if (cred.expiresAt && Date.now() > cred.expiresAt) {
    return {
      ok: false,
      kind: "token_expired",
      message: "Token expired — open Claude Code once to refresh it",
    };
  }

  let res;
  try {
    res = await fetch(USAGE_URL, {
      headers: {
        Authorization: `Bearer ${cred.accessToken}`,
        "anthropic-beta": "oauth-2025-04-20",
      },
      signal: AbortSignal.timeout(15000),
    });
  } catch (err) {
    return { ok: false, kind: "network", message: err.message };
  }

  if (res.status === 401 || res.status === 403) {
    return {
      ok: false,
      kind: "token_expired",
      message: "Token rejected — open Claude Code once to refresh it",
    };
  }
  if (res.status === 429) {
    const retryAfterSec = Number(res.headers.get("retry-after")) || null;
    return {
      ok: false,
      kind: "rate_limited",
      retryAfterSec,
      message: "Rate limited",
    };
  }
  if (!res.ok) {
    return { ok: false, kind: "api", message: `HTTP ${res.status}` };
  }

  const raw = await res.json().catch(() => null);
  if (!raw) {
    return { ok: false, kind: "api", message: "Unexpected response format" };
  }
  return { ok: true, ts: Date.now(), ...normalize(raw, cred.subscriptionType) };
}

module.exports = { fetchUsage };
