(() => {
  // Second icon click on the same page = stop and tear down.
  if (window.__minstrel) { window.__minstrel.destroy(); return; }

  const INFLIGHT_RETRY_MS = 1000;
  // User-tunable via the options page (stored under 'tuning'); these are the defaults.
  const DEFAULTS = {
    fadeSmoothMs: 5000, // gentle blend (the LLM picks smooth vs sharp per scene)
    fadeSharpMs: 900,   // cut-in for sudden scene shifts
    cooldownMs: 15000,  // min time between classifications
    settleMs: 1500,     // scroll must be still this long before classifying
    maxChars: 1800,     // how much visible text goes to the LLM
    hintColor: '#7aaaaa',
    hintOpacity: 45,    // percent
    hintThickness: 1,   // guide line thickness, px
    hintDim: 0,         // darken the page outside the band, percent (0 = off)
    pauseOn: 'tab'      // auto-pause music: 'tab' (tab switch), 'window' (any focus loss), 'off'
  };

  const state = {
    cfg: { ...DEFAULTS },
    destroyed: false,
    paused: false,
    autoPaused: false, // page lost focus; distinct from the user's manual pause
    mood: null,
    pendingMood: null, // {mood, transition} blocked on autoplay, retried on widget click
    muted: false,
    audio: null,
    fadeIv: null,
    fadeOut: null, // outgoing track during a crossfade
    rampIv: null,  // short volume ramp for auto-pause/resume
    volume: 0.5,
    band: { center: 0.45, height: 0.4 }, // where in the viewport the user actually reads
    hints: false, // faint guide lines marking the band while reading
    manifest: null,
    lastClassified: 0,
    lastText: '',
    inflight: false,
    scrollTimer: null,
    needsGesture: false
  };

  // --- UI ---
  // Google Material Icons paths (Apache 2.0) inlined as SVG — a content
  // script must not load external icon fonts into other people's pages.
  const ICONS = {
    music_note: 'M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-8z',
    pause: 'M6 19h4V5H6v14zm8-14v14h4V5h-4z',
    play_arrow: 'M8 5v14l11-7z',
    close: 'M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z',
    volume_up: 'M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z',
    volume_off: 'M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3 3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4 9.91 6.09 12 8.18V4z',
    visibility: 'M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z',
    visibility_off: 'M12 7c2.76 0 5 2.24 5 5 0 .65-.13 1.26-.36 1.83l2.92 2.92c1.51-1.26 2.7-2.89 3.43-4.75-1.73-4.39-6-7.5-11-7.5-1.4 0-2.74.25-3.98.7l2.16 2.16C10.74 7.13 11.35 7 12 7zM2 4.27l2.28 2.28.46.46C3.08 8.3 1.78 10.02 1 12c1.73 4.39 6 7.5 11 7.5 1.55 0 3.03-.3 4.38-.84l.42.42L19.73 22 21 20.73 3.27 3 2 4.27zM7.53 9.8l1.55 1.55c-.05.21-.08.43-.08.65 0 1.66 1.34 3 3 3 .22 0 .44-.03.65-.08l1.55 1.55c-.67.33-1.41.53-2.2.53-2.76 0-5-2.24-5-5 0-.79.2-1.53.53-2.2zm4.31-.78 3.15 3.15.02-.16c0-1.66-1.34-3-3-3l-.17.01z',
    crop_16_9: 'M19 6H5c-1.1 0-2 .9-2 2v8c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm0 10H5V8h14v8z',
    settings: 'M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z'
  };
  const icon = (n) => `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style="display:block;pointer-events:none"><path d="${ICONS[n]}"/></svg>`;

  // Widget + reading-band-hint + calibration-overlay CSS — the "PRODUCTION
  // BLOCK" .bs-widget/.bs-cal/.bs-hint rules from the design mockup, ported
  // verbatim (the .bs-opt-* options-page rules live in options.html instead).
  const WIDGET_CSS = `
.bs-widget,
.bs-cal,
.bs-hint {
  --bs-ink: rgba(21, 20, 27, .93);
  --bs-paper: #ece7db;
  --bs-paper-dim: rgba(236, 231, 219, .58);
  --bs-accent: #c99a52;
  --bs-accent-strong: #e0b579;
  --bs-accent-soft: rgba(201, 154, 82, .18);
  --bs-danger: #e08a6b;
  --bs-border: rgba(255, 255, 255, .09);
  --bs-radius: 12px;
  --bs-shadow: 0 6px 24px rgba(0, 0, 0, .38);
  box-sizing: border-box;
  font: 13px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
  -webkit-font-smoothing: antialiased;
}
.bs-widget *, .bs-cal * { box-sizing: border-box; }

/* ---------- Widget ---------- */
.bs-widget {
  position: fixed;
  right: 16px;
  bottom: 16px;
  z-index: 2147483647;
  display: flex;
  align-items: center;
  gap: 8px;
  max-width: 360px;
  padding: 8px 10px 8px 14px;
  background: var(--bs-ink);
  color: var(--bs-paper);
  border: 1px solid var(--bs-border);
  border-radius: var(--bs-radius);
  box-shadow: var(--bs-shadow);
  opacity: .6;
  transition: opacity .18s ease, box-shadow .18s ease;
}
.bs-widget:hover,
.bs-widget:focus-within,
.bs-widget.bs-force-hover {
  opacity: 1;
  box-shadow: 0 10px 32px rgba(0, 0, 0, .48);
}

/* Icon + label share one color per state — set once on .bs-mood, both the
   inline-SVG icon (fill="currentColor") and the text pick it up for free. */
.bs-mood { display: flex; align-items: center; gap: 7px; min-width: 0; max-width: 150px; cursor: default; color: var(--bs-paper); }
.bs-mood-icon { flex: 0 0 auto; display: flex; }
.bs-mood-icon svg { display: block; }
.bs-mood-label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.bs-widget[data-bs-state="paused"] .bs-mood,
.bs-widget[data-bs-state="auto-paused"] .bs-mood { color: var(--bs-paper-dim); }
.bs-widget[data-bs-state="auto-paused"] .bs-mood { opacity: .7; }

.bs-widget[data-bs-state="blocked"] .bs-mood { color: var(--bs-accent-strong); cursor: pointer; }
.bs-widget[data-bs-state="blocked"] .bs-mood-label { text-decoration: underline dotted; text-underline-offset: 2px; }

.bs-widget[data-bs-state="error"] .bs-mood { color: var(--bs-danger); }

.bs-controls { display: flex; align-items: center; gap: 1px; flex: 0 0 auto; }

.bs-btn {
  appearance: none;
  border: none;
  margin: 0;
  padding: 6px;
  background: transparent;
  color: var(--bs-paper-dim);
  border-radius: 8px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: background-color .15s ease, color .15s ease;
}
.bs-btn:hover { background: rgba(255, 255, 255, .08); color: var(--bs-paper); }
.bs-btn:active { background: rgba(255, 255, 255, .14); }
.bs-btn:focus-visible { outline: 2px solid var(--bs-accent); outline-offset: 1px; }
.bs-btn--close:hover { background: rgba(224, 138, 107, .16); color: var(--bs-danger); }
.bs-btn[aria-pressed="true"] { background: var(--bs-accent-soft); color: var(--bs-accent-strong); }
.bs-btn[aria-pressed="true"]:hover { background: var(--bs-accent-soft); filter: brightness(1.12); }

.bs-vol { width: 68px; height: 4px; margin: 0 2px; accent-color: var(--bs-accent); cursor: pointer; }

/* ---------- Reading-band hint lines (live toggle, not the calibration overlay) ----------
   Color + opacity are user-configurable in Options (defaults: #7aaaaa, 45%) — the content
   script sets --bs-hint-color / --bs-hint-opacity on #minstrel-hints from chrome.storage. */
.bs-hint {
  position: fixed;
  inset: 0;
  z-index: 2147483645;
  pointer-events: none;
  --bs-hint-color: #7aaaaa;
  --bs-hint-opacity: .45;
}
.bs-hint[hidden] { display: none; }
.bs-hint-line {
  position: absolute;
  left: 0;
  right: 0;
  border-top: 1px dashed var(--bs-hint-color);
  opacity: var(--bs-hint-opacity);
}
.bs-hint-shade {
  position: absolute;
  left: 0;
  right: 0;
  background: #000;
  opacity: 0; /* driven by the hintDim tuning setting */
}

/* ---------- Settings modal (embeds options.html in an iframe) ---------- */
.bs-modal { position: fixed; inset: 0; z-index: 2147483647; }
.bs-modal-scrim { position: absolute; inset: 0; background: rgba(0, 0, 0, .5); }
.bs-modal-frame {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: min(680px, 92vw);
  height: min(720px, 86vh);
  background: var(--bs-ink);
  border: 1px solid var(--bs-border);
  border-radius: 16px;
  box-shadow: var(--bs-shadow);
  overflow: hidden;
}
.bs-modal-iframe { display: block; width: 100%; height: 100%; border: none; }
.bs-modal-close {
  position: absolute;
  top: 10px;
  right: 24px; /* clear of the iframe's scrollbar */
  z-index: 1;
  appearance: none;
  border: none;
  padding: 6px;
  border-radius: 8px;
  background: rgba(0, 0, 0, .25);
  color: #fff;
  cursor: pointer;
  display: inline-flex;
}
.bs-modal-close:hover { background: rgba(0, 0, 0, .45); }

/* ---------- Calibration overlay ---------- */
.bs-cal { position: fixed; inset: 0; z-index: 2147483646; }
.bs-cal-scrim { position: absolute; left: 0; right: 0; background: rgba(9, 8, 13, .64); pointer-events: none; }
.bs-cal-band {
  position: absolute;
  left: 0;
  right: 0;
  cursor: move;
  background: linear-gradient(rgba(201, 154, 82, .16), rgba(201, 154, 82, .08));
  border-top: 2px solid var(--bs-accent);
  border-bottom: 2px solid var(--bs-accent);
  box-shadow: 0 0 0 1px rgba(201, 154, 82, .12) inset;
}
.bs-cal-handle {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  width: 64px;
  height: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: ns-resize;
}
.bs-cal-handle--top { top: -8px; }
.bs-cal-handle--bottom { bottom: -8px; }
.bs-cal-grip { width: 36px; height: 4px; border-radius: 2px; background: var(--bs-accent); opacity: .55; transition: opacity .15s ease; }
.bs-cal-handle:hover .bs-cal-grip { opacity: 1; }

.bs-cal-bar {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  flex-direction: column; /* copy on top, actions on their own line */
  align-items: stretch;
  gap: 10px;
  max-width: 460px;
  padding: 14px 16px;
  background: var(--bs-ink);
  color: var(--bs-paper);
  border: 1px solid var(--bs-border);
  border-radius: 14px;
  box-shadow: var(--bs-shadow);
}
/* text-indent: novel sites indent their prose <p>; ours must not inherit that */
.bs-cal-copy { margin: 0; text-indent: 0; font-size: 13px; line-height: 1.5; color: rgba(236, 231, 219, .92); }
.bs-cal-actions { display: flex; gap: 8px; justify-content: flex-end; }
.bs-cal-btn {
  appearance: none;
  border: 1px solid transparent;
  border-radius: 8px;
  padding: 7px 13px;
  font: inherit;
  font-weight: 600;
  cursor: pointer;
  transition: background-color .15s ease, color .15s ease, filter .15s ease;
}
.bs-cal-btn--ghost { background: transparent; color: var(--bs-paper-dim); border-color: var(--bs-border); }
.bs-cal-btn--ghost:hover { background: rgba(255, 255, 255, .07); color: var(--bs-paper); }
.bs-cal-btn--primary { background: var(--bs-accent); color: #1c1408; }
.bs-cal-btn--primary:hover { filter: brightness(1.08); }
.bs-cal-btn:focus-visible { outline: 2px solid var(--bs-accent); outline-offset: 1px; }
`;

  const styleEl = document.createElement('style');
  styleEl.textContent = WIDGET_CSS;
  document.documentElement.appendChild(styleEl);

  const ui = document.createElement('div');
  ui.className = 'bs-widget';
  ui.setAttribute('data-bs-state', 'default');
  ui.innerHTML =
    `<span class="bs-mood" data-bs="mood">` +
      `<span class="bs-mood-icon">${icon('music_note')}</span>` +
      `<span class="bs-mood-label" data-bs="moodtext">…</span>` +
    `</span>` +
    `<span class="bs-controls">` +
      `<button type="button" class="bs-btn" data-bs="pause" title="Pause music + tracking" aria-label="Pause">${icon('pause')}</button>` +
      `<button type="button" class="bs-btn" data-bs="band" title="Set your reading band" aria-label="Set reading band">${icon('crop_16_9')}</button>` +
      `<button type="button" class="bs-btn" data-bs="hints" title="Show reading band guides" aria-label="Toggle reading band guides" aria-pressed="false">${icon('visibility_off')}</button>` +
      `<button type="button" class="bs-btn" data-bs="mute" title="Mute" aria-label="Mute">${icon('volume_up')}</button>` +
      `<input class="bs-vol" data-bs="vol" type="range" min="0" max="100" value="50" title="Volume" aria-label="Volume">` +
      `<button type="button" class="bs-btn" data-bs="settings" title="Minstrel settings" aria-label="Open settings">${icon('settings')}</button>` +
      `<button type="button" class="bs-btn bs-btn--close" data-bs="close" title="Stop Minstrel" aria-label="Stop Minstrel">${icon('close')}</button>` +
    `</span>`;
  document.documentElement.appendChild(ui);
  const el = (k) => ui.querySelector(`[data-bs="${k}"]`);

  function setWidgetState(s) { ui.setAttribute('data-bs-state', s); }
  // Fix (b): the pause icon reflects manual pause OR the page-blur autopause,
  // so it shows play_arrow while auto-paused too — called from the pause
  // click handler and from onBlur/onFocus.
  function syncPauseIcon() {
    el('pause').innerHTML = icon((state.paused || state.autoPaused) ? 'play_arrow' : 'pause');
  }

  // stopPropagation: these clicks must not reach the widget-level
  // autoplay-retry handler below (pausing must never start playback).
  el('close').addEventListener('click', (e) => { e.stopPropagation(); destroy(); });
  el('pause').addEventListener('click', (e) => {
    e.stopPropagation();
    state.paused = !state.paused;
    syncPauseIcon();
    setWidgetState(state.paused ? 'paused' : (state.autoPaused ? 'auto-paused' : 'default'));
    if (state.paused) {
      stopFade(); // a mid-crossfade outgoing track must go silent too
      stopRamp(); // and a running auto-pause ramp must not fight the manual pause
      if (state.audio) state.audio.pause();
    } else {
      if (state.audio) {
        state.audio.volume = state.volume; // fade may have been cut short
        state.audio.play().catch(() => {});
      }
      classifyNow();
    }
  });
  el('band').addEventListener('click', (e) => { e.stopPropagation(); calibrateBand(); });
  el('settings').addEventListener('click', (e) => {
    e.stopPropagation();
    toggleSettingsModal();
  });

  // Settings open in-page as a modal; the same options.html also serves the
  // regular extension options page (right-click the toolbar icon).
  function toggleSettingsModal() {
    const open = document.getElementById('minstrel-settings');
    if (open) { open.remove(); return; }
    const m = document.createElement('div');
    m.id = 'minstrel-settings';
    m.className = 'bs-modal';
    m.innerHTML =
      `<div class="bs-modal-scrim"></div>` +
      `<div class="bs-modal-frame">` +
        `<button type="button" class="bs-modal-close" title="Close settings" aria-label="Close settings">${icon('close')}</button>` +
        `<iframe class="bs-modal-iframe" src="${chrome.runtime.getURL('options.html')}" title="Minstrel settings"></iframe>` +
      `</div>`;
    m.querySelector('.bs-modal-scrim').addEventListener('click', () => m.remove());
    m.querySelector('.bs-modal-close').addEventListener('click', () => m.remove());
    document.documentElement.appendChild(m);
  }
  el('hints').addEventListener('click', (e) => {
    e.stopPropagation();
    state.hints = !state.hints;
    el('hints').setAttribute('aria-pressed', String(state.hints));
    el('hints').innerHTML = icon(state.hints ? 'visibility' : 'visibility_off');
    chrome.storage.sync.set({ hints: state.hints });
    updateHints();
  });
  el('mute').addEventListener('click', (e) => {
    e.stopPropagation();
    state.muted = !state.muted;
    el('mute').innerHTML = icon(state.muted ? 'volume_off' : 'volume_up');
    if (state.audio) state.audio.muted = state.muted;
    if (state.fadeOut) state.fadeOut.muted = state.muted;
  });
  el('vol').addEventListener('input', (e) => {
    state.volume = e.target.value / 100;
    if (state.audio) state.audio.volume = state.volume;
  });
  // Any click on the widget counts as the user gesture Chrome may require for autoplay.
  ui.addEventListener('click', () => {
    if (state.needsGesture && !state.paused && state.pendingMood) {
      state.needsGesture = false;
      const p = state.pendingMood;
      state.pendingMood = null;
      playMood(p.mood, p.transition);
    }
  });

  function setLabel(text) { el('moodtext').textContent = text || '…'; }

  // --- reading position: paragraphs in the user's reading band, then the rest ---
  function visibleText() {
    // ponytail: paragraph-level scan covers article/fiction sites; canvas or
    // exotic readers need per-site adapters, add when a tester hits one.
    const els = document.body.querySelectorAll('p, blockquote, li, h1, h2, h3');
    const vh = window.innerHeight;
    const maxChars = state.cfg.maxChars;
    const bandTop = (state.band.center - state.band.height / 2) * vh;
    const bandBot = (state.band.center + state.band.height / 2) * vh;
    const inBand = [];
    const rest = [];
    for (const e of els) {
      const r = e.getBoundingClientRect();
      if (r.height > 0 && r.bottom > 0 && r.top < vh) {
        const t = e.innerText.trim();
        if (!t) continue;
        (r.bottom > bandTop && r.top < bandBot ? inBand : rest).push(t);
      }
    }
    // Band paragraphs are where the user actually reads; the rest of the
    // viewport only pads out sparse screens (huge fonts, chapter headers).
    const parts = [];
    let len = 0;
    for (const t of inBand.concat(rest)) {
      if (len > maxChars) break;
      parts.push(t);
      len += t.length;
    }
    return parts.join('\n').slice(0, maxChars);
  }

  // --- band hint guides: faint lines marking the band edges while reading ---
  function updateHints() {
    let h = document.getElementById('minstrel-hints');
    if (!state.hints || state.destroyed) { if (h) h.remove(); return; }
    if (!h) {
      h = document.createElement('div');
      h.id = 'minstrel-hints';
      h.className = 'bs-hint';
      h.setAttribute('aria-hidden', 'true');
      h.innerHTML = '<div class="bs-hint-shade"></div><div class="bs-hint-shade"></div>' +
        '<div class="bs-hint-line"></div><div class="bs-hint-line"></div>';
      document.documentElement.appendChild(h);
    }
    h.style.setProperty('--bs-hint-color', state.cfg.hintColor);
    h.style.setProperty('--bs-hint-opacity', state.cfg.hintOpacity / 100);
    const vh = window.innerHeight;
    const top = (state.band.center - state.band.height / 2) * vh;
    const bot = (state.band.center + state.band.height / 2) * vh;
    const lines = h.querySelectorAll('.bs-hint-line');
    lines[0].style.top = top + 'px';
    lines[1].style.top = bot + 'px';
    lines[0].style.borderTopWidth = lines[1].style.borderTopWidth = state.cfg.hintThickness + 'px';
    // Optional focus mode: darken everything outside the band.
    const shades = h.querySelectorAll('.bs-hint-shade');
    shades[0].style.top = '0';
    shades[0].style.height = top + 'px';
    shades[1].style.top = bot + 'px';
    shades[1].style.bottom = '0';
    shades[0].style.opacity = shades[1].style.opacity = state.cfg.hintDim / 100;
  }
  addEventListener('resize', updateHints);

  // --- reading-band calibration overlay ---
  function calibrateBand() {
    // Toggle: a second click on the band button closes the open overlay,
    // discarding any unsaved drag (same as Cancel).
    const existing = document.getElementById('minstrel-band');
    if (existing) { existing.__bsClose(); return; }
    const vh = () => window.innerHeight;
    let center = state.band.center, height = state.band.height;

    const wrap = document.createElement('div');
    wrap.id = 'minstrel-band';
    wrap.className = 'bs-cal';
    wrap.innerHTML =
      `<div class="bs-cal-scrim" data-b="top" style="top:0;"></div>` +
      `<div class="bs-cal-band" data-b="band">` +
        `<div class="bs-cal-handle bs-cal-handle--top" data-b="ht"><span class="bs-cal-grip"></span></div>` +
        `<div class="bs-cal-handle bs-cal-handle--bottom" data-b="hb"><span class="bs-cal-grip"></span></div>` +
      `</div>` +
      `<div class="bs-cal-scrim" data-b="bot" style="bottom:0;"></div>` +
      `<div class="bs-cal-bar" data-b="bar">` +
        `<p class="bs-cal-copy">This band marks where your eyes usually rest on the page. Minstrel reads along there. Drag it into place, drag the edges to resize.</p>` +
        `<span class="bs-cal-actions">` +
          `<button type="button" class="bs-cal-btn bs-cal-btn--ghost" data-b="cancel">Cancel</button>` +
          `<button type="button" class="bs-cal-btn bs-cal-btn--primary" data-b="save">Save</button>` +
        `</span>` +
      `</div>`;
    document.documentElement.appendChild(wrap);
    const bel = (k) => wrap.querySelector(`[data-b="${k}"]`);

    function layout() {
      const top = (center - height / 2) * vh();
      const bot = (center + height / 2) * vh();
      bel('top').style.height = top + 'px';
      bel('band').style.top = top + 'px';
      bel('band').style.height = (bot - top) + 'px';
      bel('bot').style.height = (vh() - bot) + 'px';
      bel('bar').style.top = (bot + 12 + 74 < vh() ? bot + 12 : Math.max(top - 74, 8)) + 'px';
    }
    layout();

    let mode = null, startY = 0, startCenter = 0, startHeight = 0;
    function down(m) {
      return (e) => {
        e.preventDefault();
        e.stopPropagation();
        mode = m; startY = e.clientY; startCenter = center; startHeight = height;
      };
    }
    bel('band').addEventListener('mousedown', down('move'));
    bel('ht').addEventListener('mousedown', down('top'));
    bel('hb').addEventListener('mousedown', down('bottom'));
    function onMove(e) {
      if (!mode) return;
      const dy = (e.clientY - startY) / vh();
      if (mode === 'move') center = startCenter + dy;
      // dragging an edge holds the opposite edge still
      if (mode === 'top') { const bot = startCenter + startHeight / 2; const top = Math.min(startCenter - startHeight / 2 + dy, bot - 0.05); center = (top + bot) / 2; height = bot - top; }
      if (mode === 'bottom') { const top = startCenter - startHeight / 2; const bot = Math.max(startCenter + startHeight / 2 + dy, top + 0.05); center = (top + bot) / 2; height = bot - top; }
      height = Math.min(Math.max(height, 0.05), 0.95);
      center = Math.min(Math.max(center, height / 2), 1 - height / 2);
      layout();
    }
    function onUp() { mode = null; }
    addEventListener('mousemove', onMove, true);
    addEventListener('mouseup', onUp, true);
    addEventListener('resize', layout);

    function close() {
      removeEventListener('mousemove', onMove, true);
      removeEventListener('mouseup', onUp, true);
      removeEventListener('resize', layout);
      wrap.remove();
    }
    wrap.__bsClose = close; // lets the band button toggle and destroy() clean up
    bel('cancel').addEventListener('click', (e) => { e.stopPropagation(); close(); });
    bel('save').addEventListener('click', (e) => {
      e.stopPropagation();
      state.band = { center, height };
      chrome.storage.sync.set({ band: state.band });
      state.lastText = ''; // the band changed what "here" means — reclassify
      close();
      updateHints();
      classifyNow();
    });
  }

  // --- music ---
  function stopFade() {
    if (state.fadeIv) { clearInterval(state.fadeIv); state.fadeIv = null; }
    if (state.fadeOut) { state.fadeOut.pause(); state.fadeOut.src = ''; state.fadeOut = null; }
  }

  function crossfadeTo(next, transition) {
    stopFade();
    const dur = transition === 'sharp' ? state.cfg.fadeSharpMs : state.cfg.fadeSmoothMs;
    const prev = state.audio;
    state.audio = next;
    state.fadeOut = prev;
    // Fade prev out from wherever it currently is (an interrupted fade must
    // not snap a half-faded track back to full volume).
    const prevStartVol = prev ? prev.volume : 0;
    const t0 = performance.now();
    state.fadeIv = setInterval(() => {
      const k = Math.min(1, (performance.now() - t0) / dur);
      // Equal-power curve: linear gain dips in perceived loudness mid-fade,
      // which is what makes a crossfade sound abrupt.
      next.volume = Math.sin(k * Math.PI / 2) * state.volume;
      if (prev) prev.volume = Math.cos(k * Math.PI / 2) * prevStartVol;
      if (k === 1) stopFade();
    }, 50);
  }

  function playMood(mood, transition) {
    if (state.destroyed || state.paused || state.autoPaused) return;
    const entry = state.manifest && state.manifest[mood];
    if (!entry || mood === state.mood) return;

    const next = new Audio(chrome.runtime.getURL('music/' + entry.file));
    next.loop = true;
    next.volume = 0;
    next.muted = state.muted;
    // Nothing is committed and nothing currently playing is touched until
    // play() actually succeeds — a missing mp3 must not kill the working
    // track or block a retry once the file exists.
    next.play().then(() => {
      if (state.destroyed || state.paused) { next.pause(); next.src = ''; return; }
      state.mood = mood;
      state.needsGesture = false;
      setLabel(mood);
      el('mood').title = `${entry.title} by ${entry.artist} (${entry.license})`;
      setWidgetState(state.paused ? 'paused' : (state.autoPaused ? 'auto-paused' : 'default'));
      crossfadeTo(next, transition);
    }).catch((err) => {
      next.src = '';
      if (err && err.name === 'NotAllowedError') {
        // Autoplay blocked until the user interacts — the widget click handler retries.
        state.needsGesture = true;
        state.pendingMood = { mood, transition };
        setLabel(mood + ': click to start');
        setWidgetState('blocked');
      } else {
        // File missing or undecodable — clicking won't help, say what will.
        setLabel(mood + ': track missing, run download-music.sh');
        setWidgetState('error');
      }
    });
  }

  function classifyNow() {
    if (state.destroyed || state.paused || state.autoPaused) return;
    if (state.inflight) {
      // Defer, don't drop — a scroll during a slow classification must still land.
      clearTimeout(state.scrollTimer);
      state.scrollTimer = setTimeout(classifyNow, INFLIGHT_RETRY_MS);
      return;
    }
    const wait = state.lastClassified + state.cfg.cooldownMs - Date.now();
    if (wait > 0) {
      // Same for the cooldown, or the mood goes stale until the next scroll.
      clearTimeout(state.scrollTimer);
      state.scrollTimer = setTimeout(classifyNow, wait);
      return;
    }
    const text = visibleText();
    if (!text || text === state.lastText) return;
    state.inflight = true;
    try {
      chrome.runtime.sendMessage({ type: 'classify', text }, (res) => {
        state.inflight = false;
        if (state.destroyed) return;
        if (chrome.runtime.lastError || !res) return; // not committed — next scroll retries
        if (state.paused) return; // don't commit either — unpause must re-classify this text
        state.lastClassified = Date.now();
        state.lastText = text;
        playMood(res.mood, res.transition);
      });
    } catch (e) {
      // Extension was reloaded/removed under us — this instance is orphaned
      // and nothing will ever answer again. Shut down cleanly.
      destroy();
    }
  }

  function onScroll() {
    clearTimeout(state.scrollTimer);
    state.scrollTimer = setTimeout(classifyNow, state.cfg.settleMs);
  }
  // capture:true also catches scroll events from inner containers (scroll doesn't bubble).
  addEventListener('scroll', onScroll, { passive: true, capture: true });

  // --- auto-pause when the reader leaves, resume when they return ---
  function stopRamp() {
    if (state.rampIv) { clearInterval(state.rampIv); state.rampIv = null; }
  }
  // ponytail: interval-based fade; hidden tabs throttle timers to ~1s so the
  // fade-out degrades to a chunky step there. A Web Audio GainNode ramp would
  // survive throttling; add if the degraded fade bothers anyone.
  function rampTo(target, ms, done) {
    stopRamp();
    const a = state.audio;
    if (!a) { if (done) done(); return; }
    const from = a.volume;
    const t0 = performance.now();
    state.rampIv = setInterval(() => {
      const k = Math.min(1, (performance.now() - t0) / ms);
      a.volume = from + (target - from) * k;
      if (k === 1) { stopRamp(); if (done) done(); }
    }, 40);
  }

  function autoPause() {
    if (state.destroyed || state.paused || state.autoPaused) return;
    state.autoPaused = true;
    syncPauseIcon();
    setWidgetState('auto-paused');
    stopFade();
    rampTo(0, 500, () => { if (state.audio && state.autoPaused) state.audio.pause(); });
  }
  function autoResume() {
    if (!state.autoPaused || state.destroyed) return;
    state.autoPaused = false;
    syncPauseIcon();
    setWidgetState(state.paused ? 'paused' : 'default');
    if (state.audio && !state.paused) {
      state.audio.play().catch(() => {});
      rampTo(state.volume, 500);
    }
    classifyNow(); // the user may have been gone a while — re-read the page
  }
  function onWindowBlur() { if (state.cfg.pauseOn === 'window') autoPause(); }
  function onWindowFocus() { if (state.cfg.pauseOn === 'window') autoResume(); }
  function onVisibility() {
    if (state.cfg.pauseOn === 'off') return;
    document.hidden ? autoPause() : autoResume();
  }
  addEventListener('blur', onWindowBlur);
  addEventListener('focus', onWindowFocus);
  document.addEventListener('visibilitychange', onVisibility);

  // Options-page changes apply live — no widget restart needed.
  function onStorageChange(changes, area) {
    if (area !== 'sync') return;
    if (changes.tuning) {
      state.cfg = { ...DEFAULTS, ...(changes.tuning.newValue || {}) };
      updateHints();
    }
  }
  chrome.storage.onChanged.addListener(onStorageChange);

  function destroy() {
    state.destroyed = true;
    const cal = document.getElementById('minstrel-band');
    if (cal && cal.__bsClose) cal.__bsClose(); // an open calibration must not outlive the widget
    const modal = document.getElementById('minstrel-settings');
    if (modal) modal.remove();
    removeEventListener('scroll', onScroll, { capture: true });
    removeEventListener('resize', updateHints);
    removeEventListener('blur', onWindowBlur);
    removeEventListener('focus', onWindowFocus);
    document.removeEventListener('visibilitychange', onVisibility);
    try { chrome.storage.onChanged.removeListener(onStorageChange); } catch (e) {}
    updateHints(); // destroyed => removes the guide lines
    clearTimeout(state.scrollTimer);
    stopFade();
    stopRamp();
    if (state.audio) { state.audio.pause(); state.audio.src = ''; }
    ui.remove();
    styleEl.remove();
    window.__minstrel = undefined;
  }
  window.__minstrel = { destroy };

  // --- boot ---
  Promise.all([
    fetch(chrome.runtime.getURL('music/manifest.json')).then((r) => r.json()),
    new Promise((resolve) => chrome.storage.sync.get({ band: state.band, hints: state.hints, tuning: {} }, resolve))
  ])
    .then(([m, cfg]) => {
      state.manifest = m;
      if (cfg.band && cfg.band.height) state.band = cfg.band;
      state.cfg = { ...DEFAULTS, ...cfg.tuning };
      state.hints = !!cfg.hints;
      el('hints').setAttribute('aria-pressed', String(state.hints));
      el('hints').innerHTML = icon(state.hints ? 'visibility' : 'visibility_off');
      updateHints();
      classifyNow();
    })
    .catch(() => { setLabel('no music: run download-music.sh'); setWidgetState('error'); });
})();
