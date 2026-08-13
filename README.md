# Minstrel

A minstrel for your reading: background music that follows the story's mood as you read.

Minstrel is a Chrome extension for people who read in the browser (Royal Road, AO3, Project Gutenberg, webnovel sites, any page with real HTML text). Click the icon and it watches the paragraphs on your screen, classifies the mood of the scene, and crossfades between matching tracks: battle music for the battle, calm tunes for the quiet morning after.

## Install (unpacked, for testing)

1. Fetch the freely licensed tracks listed in `CREDITS.md` into `extension/music/`:
   - Linux/macOS: `./download-music.sh` (needs `jq` and `curl`)
   - Windows: `powershell -ExecutionPolicy Bypass -File download-music.ps1`
2. Open `chrome://extensions`, enable **Developer mode**, click **Load unpacked**, and pick the `extension/` folder.
3. Open something to read and click the Minstrel icon. Click it again to stop.

To share with testers: run step 1, zip the `extension/` folder, send it.

## Using it

A small widget appears at the bottom right of the page. It shows the current mood and holds the controls:

- **Pause / resume**: stops both the music and the mood tracking.
- **Reading band**: opens a calibration overlay. Drag the band to where your eyes usually rest on the page and drag its edges to resize it. Minstrel prioritizes the text inside that band when deciding the mood.
- **Guides**: toggles faint lines marking your reading band while you read. Thickness, color, opacity, and an optional focus dim for the rest of the page are all configurable.
- **Mute** and a **volume** slider.
- **Settings**: opens the options in an in-page modal.
- **Close**: stops everything.

Music fades out when you switch tabs and fades back in when you return. This can be changed to trigger on any window focus loss, or turned off, in the settings.

## Mood classification

Out of the box Minstrel uses a simple keyword classifier: zero setup, works offline, decent on action scenes.

For much better results, point it at any OpenAI compatible LLM in the settings. **[LLM-SETUP.md](LLM-SETUP.md) has the full walkthrough for Windows and Linux**, including which small models work best. The short version:

- **Local Ollama**: endpoint `http://localhost:11434/v1`, model such as `llama3.2` (a 3B model is plenty). Ollama must allow extension origins: `OLLAMA_ORIGINS="chrome-extension://*" ollama serve`
- **Hosted APIs** (OpenRouter, OpenAI, and friends): endpoint, API key, model. It sends roughly one tiny request per screenful of text, so cost is negligible.

Optionally paste a one paragraph synopsis of your current book in the settings. It is included in the prompt so the mood matches the story's overall tone.

The LLM answers with a mood (`battle, tension, calm, sad, mysterious, adventure, romantic, neutral`) and a transition: `smooth` for a gentle blend, `sharp` for a fast cut-in on sudden scene shifts like an ambush.

## How it works

- `extension/content.js` is injected on icon click. It collects the paragraphs currently in your reading band (debounced on scroll, with a cooldown between checks), asks the background worker for a mood, and crossfades looped tracks with an equal power curve.
- `extension/background.js` is the service worker. It calls your configured LLM endpoint with a 10 second timeout and falls back to keyword scoring. `node extension/background.js` runs a self check of the fallback classifier.
- `extension/music/manifest.json` maps each mood to a track. All music is CC0, CC-BY, or public domain; attributions live in `CREDITS.md`. Audio files are not committed, the download script fetches them.

`host_permissions: <all_urls>` exists only so the service worker can call your LLM endpoint without CORS trouble.

## Configuration

Everything lives in the settings (gear button on the widget, or right click the toolbar icon and pick Options): crossfade durations, time between mood checks, scroll settle delay, how much text is sent per check, reading guide appearance, and the auto-pause behavior. Empty fields use the defaults shown as placeholders. Changes apply live.

## Known limits

- Reads visible HTML paragraphs. Canvas based readers (Kindle Cloud Reader) and Chrome's built-in PDF viewer will not work.
- One synopsis globally, not per book.
- One track per mood for now.

## Credits

Music and icon attributions are in [CREDITS.md](CREDITS.md). Google Material Icons are used under Apache 2.0.
