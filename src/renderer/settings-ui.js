const $ = (id) => document.getElementById(id);

async function init() {
  const s = await api.getSettings();
  $("pollIntervalSec").value = s.pollIntervalSec;
  $("alertAbovePct").value = s.alertAbovePct;
  $("openAtLogin").checked = s.openAtLogin;
}

$("form").addEventListener("submit", async (e) => {
  e.preventDefault();
  await api.saveSettings({
    pollIntervalSec: $("pollIntervalSec").value,
    alertAbovePct: $("alertAbovePct").value,
    openAtLogin: $("openAtLogin").checked,
  });
  api.closeSettings();
});

$("btn-cancel").addEventListener("click", () => api.closeSettings());

init();
