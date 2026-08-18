const MOODS = ['battle', 'tension', 'calm', 'sad', 'mysterious', 'adventure', 'romantic', 'neutral'];

// ponytail: naive keyword scoring, good enough as a zero-setup fallback;
// upgrade path is the LLM endpoint in options, not a smarter wordlist.
const KEYWORDS = {
  battle: ['battle', 'sword', 'blade', 'war', 'army', 'armies', 'fight', 'fought', 'charge', 'clash', 'blood', 'enemy', 'attack', 'strike', 'arrow', 'shield', 'slash', 'kill'],
  tension: ['danger', 'fear', 'afraid', 'terror', 'dread', 'shadow', 'threat', 'trap', 'chase', 'flee', 'escape', 'hunt', 'stalk', 'panic', 'scream', 'heart pounded', 'held her breath', 'held his breath'],
  sad: ['grief', 'tears', 'wept', 'cried', 'mourn', 'funeral', 'death', 'died', 'loss', 'lonely', 'sorrow', 'goodbye', 'farewell', 'grave'],
  mysterious: ['mystery', 'strange', 'ancient', 'secret', 'hidden', 'whisper', 'ghost', 'magic', 'rune', 'prophecy', 'ritual', 'unknown', 'curious', 'riddle'],
  adventure: ['journey', 'travel', 'road', 'quest', 'mountain', 'horizon', 'sail', 'ride', 'explore', 'discover', 'map', 'wander', 'set off', 'set out'],
  romantic: ['kiss', 'love', 'embrace', 'heart', 'blush', 'tender', 'caress', 'longing', 'beloved', 'wedding', 'romance'],
  calm: ['quiet', 'peaceful', 'gentle', 'warm', 'rest', 'breakfast', 'garden', 'morning', 'slept', 'smile', 'laughed', 'comfortable', 'home', 'tea']
};

// Word boundaries matter: plain substring search makes 'war' match 'warm',
// 'rest' match 'forest', 'kill' match 'skill'. The optional suffix group keeps
// common inflections matching: swords, charged, killed, screaming.
// ponytail: crude English stemming; irregulars ('fought') get their own
// keyword entry if they ever matter — the LLM path is the real classifier.
const KEYWORD_RES = Object.fromEntries(
  Object.entries(KEYWORDS).map(([mood, words]) => [
    mood,
    words.map((w) =>
      new RegExp('\\b' + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(s|es|d|ed|ing)?\\b', 'g'))
  ])
);

function keywordClassify(text) {
  const t = text.toLowerCase();
  let best = 'neutral', bestScore = 0;
  for (const [mood, res] of Object.entries(KEYWORD_RES)) {
    let score = 0;
    for (const re of res) score += (t.match(re) || []).length;
    if (score > bestScore) { bestScore = score; best = mood; }
  }
  return bestScore >= 2 ? best : 'neutral';
}

const TRANSITIONS = ['smooth', 'sharp'];

async function llmClassify(cfg, text) {
  const res = await fetch(cfg.endpoint.replace(/\/+$/, '') + '/chat/completions', {
    method: 'POST',
    signal: AbortSignal.timeout(10000), // a hung endpoint must fall back, not freeze classification
    headers: {
      'Content-Type': 'application/json',
      ...(cfg.apiKey ? { Authorization: 'Bearer ' + cfg.apiKey } : {})
    },
    body: JSON.stringify({
      model: cfg.model || 'llama3.2',
      temperature: 0,
      max_tokens: 8,
      messages: [
        {
          role: 'system',
          content: `You tag book passages for background music. Reply with exactly two words: ` +
            `a mood from [${MOODS.join(', ')}] and a transition from [${TRANSITIONS.join(', ')}]. ` +
            `Use sharp only when the scene shifts suddenly (ambush, attack, shock, reveal); otherwise smooth.` +
            (cfg.synopsis ? `\nBook context: ${cfg.synopsis}` : '')
        },
        { role: 'user', content: text }
      ]
    })
  });
  if (!res.ok) throw new Error('LLM HTTP ' + res.status);
  const data = await res.json();
  const words = (data.choices?.[0]?.message?.content || '')
    .toLowerCase().replace(/[^a-z\s]/g, ' ').split(/\s+/).filter(Boolean);
  return { mood: words[0], transition: TRANSITIONS.includes(words[1]) ? words[1] : 'smooth' };
}

async function classify(text) {
  const cfg = await chrome.storage.sync.get(['endpoint', 'apiKey', 'model', 'synopsis']);
  // Falling back to keywords is fine, doing it silently is not — the reader
  // has no other way to learn their endpoint is down or misconfigured.
  let llmError = null;
  if (cfg.endpoint) {
    try {
      const r = await llmClassify(cfg, text);
      if (MOODS.includes(r.mood)) return { mood: r.mood, transition: r.transition, via: 'llm' };
      llmError = 'unexpected reply: ' + (r.mood || '(empty)');
    } catch (e) {
      llmError = e.name === 'TimeoutError' ? 'no answer in 10s' : e.message;
    }
  }
  const mood = keywordClassify(text);
  // ponytail: keywords can't judge suddenness; danger moods cut in, the rest blend
  const transition = mood === 'battle' || mood === 'tension' ? 'sharp' : 'smooth';
  return { mood, transition, via: 'keywords', llmError };
}

if (typeof chrome !== 'undefined' && chrome.action) {
  // Web store users never see the repo README; open the bundled guide once.
  chrome.runtime.onInstalled.addListener((details) => {
    if (details.reason === 'install') chrome.tabs.create({ url: 'guide.html' });
  });

  chrome.action.onClicked.addListener(async (tab) => {
    if (!tab.id) return;
    try {
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
    } catch (e) {
      // chrome:// pages and the web store can't be injected; nothing to do
    }
  });

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === 'openOptions') { chrome.runtime.openOptionsPage(); return; }
    if (msg.type !== 'classify') return;
    // Always answer — a dangling sendResponse leaves the content script's
    // inflight state waiting until the worker dies.
    classify(msg.text).then(sendResponse, () => sendResponse({ mood: 'neutral', via: 'error' }));
    return true;
  });
} else {
  // ponytail: `node background.js` self-check for the keyword fallback
  const t = (s, want) => {
    const got = keywordClassify(s);
    if (got !== want) throw new Error(`"${s}" -> ${got}, wanted ${want}`);
  };
  t('Swords clashed as the armies charged, blood on every blade.', 'battle');
  t('She wept at the grave, tears falling in sorrow and grief.', 'sad');
  t('The quiet garden was peaceful that warm morning, and she smiled over her tea.', 'calm');
  t('He said hello and ordered a sandwich.', 'neutral');
  t('The warm fire crackled and the warm bread steamed.', 'calm'); // 'war' must not match inside 'warm'
  t('He charged and swords clashed as men were killed.', 'battle'); // inflected forms must still match
  console.log('keyword classifier self-check ok');

  // A dead endpoint must fall back AND say why — silent fallback is the bug.
  globalThis.chrome = { storage: { sync: { get: async () => ({ endpoint: 'http://127.0.0.1:1/v1' }) } } };
  globalThis.fetch = async () => { throw new TypeError('fetch failed'); };
  classify('He said hello and ordered a sandwich.').then((r) => {
    if (r.via !== 'keywords' || r.llmError !== 'fetch failed') {
      throw new Error('llm failure not reported: ' + JSON.stringify(r));
    }
    console.log('llm-failure reporting self-check ok');
  });
}
