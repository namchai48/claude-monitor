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
const TOKEN_REFRESH_URL = "https://platform.claude.com/v1/oauth/token";
const OAUTH_CLIENT_ID = "9d1c250a-e61b-44d9-88ed-5944d1962f5e";
// Omitting User-Agent triggers aggressive rate-limiting on Anthropic's side.
const USER_AGENT = "claude-rate-monitor/0.1.0 (external, cli)";

const BUCKET_LABELS = {
  five_hour: "Session (5h)",
  seven_day: "Weekly (all)",
  seven_day_opus: "Weekly Opus",
  seven_day_sonnet: "Weekly Sonnet",
  seven_day_cowork: "Weekly Cowork",
  seven_day_oauth_apps: "Weekly apps",
};

function credentialsPath() {
  return path.join(os.homedir(), ".claude", ".credentials.json");
}

function readCredentials() {
  try {
    const oauth = JSON.parse(fs.readFileSync(credentialsPath(), "utf8")).claudeAiOauth;
    if (!oauth?.accessToken) return null;
    return oauth;
  } catch {
    return null;
  }
}

// Attempts to silently refresh the access token using the stored refresh token.
// On success writes the new tokens back to .credentials.json and returns the
// updated credential object; returns null if refresh is not possible or fails.
async function tryRefreshToken(cred) {
  if (!cred.refreshToken) return null;
  try {
    const res = await fetch(TOKEN_REFRESH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "User-Agent": USER_AGENT },
      body: JSON.stringify({
        grant_type: "refresh_token",
        refresh_token: cred.refreshToken,
        client_id: OAUTH_CLIENT_ID,
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return null;
    const data = await res.json().catch(() => null);
    if (!data?.access_token) return null;

    const file = credentialsPath();
    const raw = JSON.parse(fs.readFileSync(file, "utf8"));
    raw.claudeAiOauth.accessToken = data.access_token;
    if (data.refresh_token) raw.claudeAiOauth.refreshToken = data.refresh_token;
    if (data.expires_in) {
      raw.claudeAiOauth.expiresAt = Date.now() + data.expires_in * 1000;
    }
    fs.writeFileSync(file, JSON.stringify(raw, null, 2), "utf8");

    return { ...cred, accessToken: data.access_token };
  } catch {
    return null;
  }
}

function usageHeaders(accessToken) {
  return {
    Authorization: `Bearer ${accessToken}`,
    "anthropic-beta": "oauth-2025-04-20",
    "User-Agent": USER_AGENT,
  };
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

async function fetchUsage(overrideToken = null) {
  let token;
  let subscriptionType;
  let cred = null;

  if (overrideToken) {
    token = overrideToken;
  } else {
    cred = readCredentials();
    if (!cred) {
      return {
        ok: false,
        kind: "no_creds",
        message: "No credentials found — enter your access token in Settings, or log in with Claude Code",
      };
    }
    if (cred.expiresAt && Date.now() > cred.expiresAt) {
      return {
        ok: false,
        kind: "token_expired",
        message: "Token expired — open Claude Code to refresh, or enter a new token in Settings",
      };
    }
    token = cred.accessToken;
    subscriptionType = cred.subscriptionType;
  }

  let res;
  try {
    res = await fetch(USAGE_URL, {
      headers: usageHeaders(token),
      signal: AbortSignal.timeout(15000),
    });
  } catch (err) {
    return { ok: false, kind: "network", message: err.message };
  }

  // On auth failure attempt a reactive token refresh and retry once.
  if ((res.status === 401 || res.status === 403) && cred) {
    const refreshed = await tryRefreshToken(cred);
    if (refreshed) {
      try {
        res = await fetch(USAGE_URL, {
          headers: usageHeaders(refreshed.accessToken),
          signal: AbortSignal.timeout(15000),
        });
      } catch (err) {
        return { ok: false, kind: "network", message: err.message };
      }
    }
  }

  if (res.status === 401 || res.status === 403) {
    return {
      ok: false,
      kind: "token_expired",
      message: overrideToken
        ? "Token rejected — check your access token in Settings"
        : "Token rejected — open Claude Code to refresh, or enter a new token in Settings",
    };
  }

  if (res.status === 429) {
    const retryAfterSec = Number(res.headers.get("retry-after")) || null;
    return { ok: false, kind: "rate_limited", retryAfterSec, message: "Rate limited" };
  }
  if (!res.ok) {
    return { ok: false, kind: "api", message: `HTTP ${res.status}` };
  }

  const raw = await res.json().catch(() => null);
  if (!raw) {
    return { ok: false, kind: "api", message: "Unexpected response format" };
  }
  return { ok: true, ts: Date.now(), ...normalize(raw, subscriptionType) };
}

module.exports = { fetchUsage };
