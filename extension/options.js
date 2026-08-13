const FIELDS = ['endpoint', 'apiKey', 'model', 'synopsis'];
const TUNING_NUMS = ['fadeSmoothMs', 'fadeSharpMs', 'cooldownMs', 'settleMs', 'maxChars', 'hintOpacity', 'hintThickness', 'hintDim'];

chrome.storage.sync.get([...FIELDS, 'tuning'], (cfg) => {
  for (const f of FIELDS) document.getElementById(f).value = cfg[f] || '';
  const t = cfg.tuning || {};
  for (const f of TUNING_NUMS) {
    if (t[f] !== undefined) document.getElementById(f).value = t[f];
  }
  if (t.hintColor) document.getElementById('hintColor').value = t.hintColor;
  document.getElementById('pauseOn').value = t.pauseOn || 'tab';
});

function showStatus(msg, ok) {
  const s = document.getElementById('status');
  s.style.color = ok ? 'green' : 'crimson';
  s.textContent = msg;
  if (ok) setTimeout(() => (s.textContent = ''), 1500);
}

document.getElementById('save').addEventListener('click', () => {
  const cfg = {};
  for (const f of FIELDS) cfg[f] = document.getElementById(f).value.trim();

  // Only store what the user actually set — empty fields fall back to the
  // content script's defaults, so defaults can change without stale copies here.
  const tuning = {};
  for (const f of TUNING_NUMS) {
    const v = document.getElementById(f).value.trim();
    if (v !== '' && !isNaN(+v)) tuning[f] = +v;
  }
  tuning.hintColor = document.getElementById('hintColor').value;
  tuning.pauseOn = document.getElementById('pauseOn').value;
  cfg.tuning = tuning;

  function persist() {
    chrome.storage.sync.set(cfg, () => {
      if (chrome.runtime.lastError) {
        showStatus('error: ' + chrome.runtime.lastError.message, false);
        return;
      }
      showStatus('saved', true);
    });
  }

  // The endpoint's origin needs an optional host permission so the service
  // worker can call it without CORS trouble. Must be requested from this
  // click (user gesture). Keyword mode (empty endpoint) needs nothing.
  if (!cfg.endpoint) { persist(); return; }
  let origin;
  try {
    origin = new URL(cfg.endpoint).origin + '/*';
  } catch (e) {
    showStatus('endpoint must be a full URL, like http://localhost:11434/v1', false);
    return;
  }
  chrome.permissions.request({ origins: [origin] }, (granted) => {
    if (chrome.runtime.lastError || !granted) {
      showStatus('saved, but without permission to reach ' + origin + ' the LLM cannot be used', false);
      chrome.storage.sync.set(cfg, () => {});
      return;
    }
    persist();
  });
});
