const $ = (id) => document.getElementById(id);

async function init() {
  const s = await api.getSettings();
  $("pollIntervalSec").value = s.pollIntervalSec;
  $("alertAbovePct").value = s.alertAbovePct;
  $("openAtLogin").checked = s.openAtLogin;
  $("accessToken").value = s.accessToken || "";
}

$("btn-show-token").addEventListener("click", () => {
  const input = $("accessToken");
  const isHidden = input.type === "password";
  input.type = isHidden ? "text" : "password";
  $("btn-show-token").textContent = isHidden ? "Hide" : "Show";
});

$("form").addEventListener("submit", async (e) => {
  e.preventDefault();
  await api.saveSettings({
    pollIntervalSec: $("pollIntervalSec").value,
    alertAbovePct: $("alertAbovePct").value,
    openAtLogin: $("openAtLogin").checked,
    accessToken: $("accessToken").value,
  });
  api.closeSettings();
});

$("btn-cancel").addEventListener("click", () => api.closeSettings());

init();
