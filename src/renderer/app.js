const barsEl = document.querySelector("#bars");
const statusDot = document.querySelector("#status-dot");
const planLabel = document.querySelector("#plan-label");
const messageEl = document.querySelector("#message");
const updatedEl = document.querySelector("#updated");

let latest = null;

document.querySelector("#btn-close").addEventListener("click", () => api.quit());
document
  .querySelector("#btn-settings")
  .addEventListener("click", () => api.openSettings());
document
  .querySelector("#btn-refresh")
  .addEventListener("click", () => api.pollNow());

// utilization is % USED — bars fill up as you consume the limit.
function colorFor(used) {
  if (used >= 80) return "red";
  if (used >= 50) return "amber";
  return "green";
}

function shortLabel(key) {
  return (
    {
      five_hour: "5H",
      seven_day: "7D",
      seven_day_opus: "OPUS",
      seven_day_sonnet: "SONN",
      seven_day_cowork: "CWRK",
      seven_day_oauth_apps: "APPS",
    }[key] ?? key.slice(0, 4).toUpperCase()
  );
}

function renderBars(buckets) {
  barsEl.textContent = "";
  for (const b of buckets) {
    const row = document.createElement("div");
    row.className = "bar-row";
    row.title = b.label;

    const label = document.createElement("span");
    label.className = "bar-label";
    label.textContent = shortLabel(b.key);

    const bar = document.createElement("div");
    bar.className = "bar";
    const fill = document.createElement("div");
    const used = Math.max(0, Math.min(100, b.utilization));
    fill.className = "fill " + colorFor(used);
    fill.style.width = used.toFixed(1) + "%";
    bar.append(fill);

    const value = document.createElement("span");
    value.className = "bar-value";
    value.textContent = used.toFixed(0) + "% used";

    row.append(label, bar, value);
    barsEl.append(row);
  }
}

function countdownText(iso) {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return "now";
  const totalMin = Math.ceil(ms / 60000);
  if (totalMin < 60) return `${totalMin}m`;
  const h = Math.floor(totalMin / 60);
  if (h < 48) return `${h}h ${totalMin % 60}m`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}

function refreshFooter() {
  if (!latest?.ok) return;
  const session = latest.buckets.find((b) => b.key === "five_hour");
  const parts = [];
  if (session?.resetsAt) parts.push(`5h resets in ${countdownText(session.resetsAt)}`);
  const weekly = latest.buckets.find((b) => b.key === "seven_day");
  if (weekly?.resetsAt) parts.push(`7d in ${countdownText(weekly.resetsAt)}`);
  messageEl.classList.remove("error");
  messageEl.textContent = parts.join(" · ") || "No active limits reported";
}

function render(result) {
  latest = result;
  if (!result.ok) {
    statusDot.className = "dot " + (result.kind === "network" ? "gray" : "red");
    messageEl.classList.add("error");
    messageEl.textContent = result.message || "Error";
    updatedEl.textContent = "";
    return;
  }

  planLabel.textContent =
    "· " + (result.subscriptionType ? result.subscriptionType : "plan");
  renderBars(result.buckets);

  const worst = result.buckets.length
    ? Math.max(...result.buckets.map((b) => b.utilization))
    : null;
  statusDot.className = "dot " + (worst === null ? "gray" : colorFor(worst));

  refreshFooter();
  updatedEl.textContent = new Date(result.ts).toLocaleTimeString();
}

setInterval(refreshFooter, 30000);
api.onUsageUpdate(render);
