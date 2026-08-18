const FIELDS = ['endpoint', 'apiKey', 'model', 'synopsis'];
const TUNING_NUMS = ['fadeSmoothMs', 'fadeSharpMs', 'cooldownMs', 'settleMs', 'maxChars', 'hintOpacity', 'hintThickness', 'hintDim'];

// ok: true green, false crimson, null neutral (in progress).
// clearMs 0 keeps the message up — a test result the user asked for shouldn't
// vanish while they're reading it; the save status is transient and does.
function statusSetter(id, clearMs) {
  const s = document.getElementById(id);
  let timer;
  return (msg, ok) => {
    clearTimeout(timer); // a pending clear must not wipe a later message
    s.style.color = ok == null ? '' : (ok ? 'green' : 'crimson');
    s.textContent = msg;
    if (ok && clearMs) timer = setTimeout(() => (s.textContent = ''), clearMs);
  };
}

function readFields() {
  const cfg = {};
  for (const f of FIELDS) cfg[f] = document.getElementById(f).value.trim();
  return cfg;
}

// Ollama's standard address, and the endpoint field's placeholder. Deliberately
// NOT a fallback for classification: an empty endpoint means keyword mode, so a
// reader who never configured anything makes no network calls and needs no host
// permission. It's only what the Test button guesses at.
const DEFAULT_ENDPOINT = 'http://localhost:11434/v1';
const BAD_URL = 'endpoint must be a full URL, like ' + DEFAULT_ENDPOINT;
function originOf(endpoint) {
  try {
    return new URL(endpoint).origin + '/*';
  } catch (e) {
    return null;
  }
}

// The endpoint's origin needs an optional host permission before anything can
// call it. Requesting must happen inside the click's user gesture, so this is
// called synchronously from the handler, never after an await.
function withPermission(origin, say, done) {
  chrome.permissions.request({ origins: [origin] }, (granted) => {
    if (chrome.runtime.lastError || !granted) {
      say('without permission to reach ' + origin + ' the LLM cannot be used', false);
      return;
    }
    done();
  });
}

// Without this, a dead or misconfigured endpoint is invisible: the extension
// just falls back to keywords mid-chapter and never says why.
// say(message, ok, reached) — `reached` means something answered at that
// address, which is a separate question from whether the config is usable.
async function checkEndpoint(cfg, say) {
  const base = cfg.endpoint.replace(/\/+$/, '');
  try {
    const res = await fetch(base + '/models', {
      signal: AbortSignal.timeout(8000),
      headers: cfg.apiKey ? { Authorization: 'Bearer ' + cfg.apiKey } : {}
    });
    if (!res.ok) {
      say(`${base} answered HTTP ${res.status}`, false, true);
      return;
    }
    const ids = ((await res.json()).data || []).map((m) => m.id);
    const want = cfg.model || 'llama3.2';
    if (ids.length && !ids.includes(want)) {
      say(`${base} is up, but has no model "${want}". It offers: ${ids.slice(0, 5).join(', ')}`, false, true);
      return;
    }
    say('endpoint answered — the LLM is reachable', true, true);
  } catch (e) {
    const why = e.name === 'TimeoutError' ? 'timed out' : e.message;
    say(`${base} did not answer (${why}). Is the server running, and does it allow chrome-extension:// origins? See the setup guide.`, false, false);
  }
}

if (typeof document !== 'undefined') {
  const showStatus = statusSetter('status', 1500);
  const showTestStatus = statusSetter('testStatus', 0);

  chrome.storage.sync.get([...FIELDS, 'tuning'], (cfg) => {
    for (const f of FIELDS) document.getElementById(f).value = cfg[f] || '';
    const t = cfg.tuning || {};
    for (const f of TUNING_NUMS) {
      if (t[f] !== undefined) document.getElementById(f).value = t[f];
    }
    if (t.hintColor) document.getElementById('hintColor').value = t.hintColor;
    document.getElementById('pauseOn').value = t.pauseOn || 'tab';
  });

  // Tests what's in the fields, not what's stored — the point is to try a
  // setting before committing to it.
  document.getElementById('test').addEventListener('click', () => {
    const cfg = readFields();
    // Pressing Test with an empty field means "is my Ollama up?", so probe the
    // standard address rather than refusing. Whatever answers gets written into
    // the field, since an untouched empty endpoint would stay in keyword mode.
    const guessed = !cfg.endpoint;
    if (guessed) cfg.endpoint = DEFAULT_ENDPOINT;

    const origin = originOf(cfg.endpoint);
    if (!origin) { showTestStatus(BAD_URL, false); return; }
    const say = (msg, ok, reached) => {
      if (guessed && reached) {
        document.getElementById('endpoint').value = DEFAULT_ENDPOINT;
        msg += ' — filled the endpoint in for you; press Save to keep it';
      }
      showTestStatus(msg, ok);
    };
    withPermission(origin, say, () => {
      say(guessed ? `no endpoint set — trying ${DEFAULT_ENDPOINT}…` : 'testing…', null);
      checkEndpoint(cfg, say);
    });
  });

  document.getElementById('save').addEventListener('click', () => {
    const cfg = readFields();

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

    function persist(then) {
      chrome.storage.sync.set(cfg, () => {
        if (chrome.runtime.lastError) {
          showStatus('error: ' + chrome.runtime.lastError.message, false);
          return;
        }
        if (then) then();
        else showStatus('saved', true);
      });
    }

    // Keyword mode (empty endpoint) needs no permission and nothing to test.
    if (!cfg.endpoint) { persist(); return; }
    // A malformed URL is a typo, not a setting worth storing.
    const origin = originOf(cfg.endpoint);
    if (!origin) { showStatus(BAD_URL, false); return; }
    withPermission(origin, (msg, ok) => {
      // Save the settings even when permission is refused, then say what that costs.
      persist(() => showStatus('saved, but ' + msg, ok));
    }, () => {
      persist(() => {
        showStatus('saved — testing endpoint…', null);
        checkEndpoint(cfg, (msg, ok) => showStatus(ok ? 'saved — ' + msg : 'saved, but ' + msg, ok));
      });
    });
  });
} else {
  // ponytail: `node options.js` self-check for the endpoint test's four outcomes
  const run = async (fetchImpl, cfg) => {
    globalThis.fetch = fetchImpl;
    let got;
    await checkEndpoint({ endpoint: 'http://x/v1', ...cfg }, (msg, ok, reached) => (got = { msg, ok, reached }));
    return got;
  };
  const ok = (body) => async () => ({ ok: true, json: async () => body });
  const expect = (got, wantOk, wantReached, needle) => {
    if (got.ok !== wantOk || got.reached !== wantReached || !got.msg.includes(needle)) {
      throw new Error(`got ${JSON.stringify(got)}, wanted ok=${wantOk} reached=${wantReached} containing "${needle}"`);
    }
  };

  (async () => {
    expect(await run(ok({ data: [{ id: 'llama3.2' }] }), { model: 'llama3.2' }), true, true, 'reachable');
    // reached stays true when a server answers but the config is wrong — that's
    // what tells the Test button the guessed address is worth keeping
    expect(await run(ok({ data: [{ id: 'qwen3' }] }), { model: 'llama3.2' }), false, true, 'no model "llama3.2"');
    expect(await run(async () => ({ ok: false, status: 404 }), {}), false, true, 'HTTP 404');
    expect(await run(async () => { throw new TypeError('fetch failed'); }, {}), false, false, 'did not answer (fetch failed)');
    // an endpoint that lists nothing is still usable — don't cry wolf
    expect(await run(ok({}), { model: 'llama3.2' }), true, true, 'reachable');
    console.log('endpoint check self-check ok');
  })();
}
