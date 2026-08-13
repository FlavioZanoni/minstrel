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

  chrome.storage.sync.set(cfg, () => {
    const s = document.getElementById('status');
    if (chrome.runtime.lastError) {
      s.style.color = 'crimson';
      s.textContent = 'error: ' + chrome.runtime.lastError.message;
      return;
    }
    s.style.color = 'green';
    s.textContent = 'saved';
    setTimeout(() => (s.textContent = ''), 1500);
  });
});
