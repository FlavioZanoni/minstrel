# LLM setup for Minstrel

Minstrel works without an LLM (keyword fallback), but a small local model makes mood detection much better. This guide sets up [Ollama](https://ollama.com), which runs models locally for free. Any OpenAI compatible API works the same way if you prefer a hosted one.

## Which model?

The task is tiny: classify one screenful of text into 8 moods plus a transition word. You do not need a big model.

| Model | Size (RAM) | Verdict |
|---|---|---|
| `llama3.2:3b` | ~2 GB | Recommended default. Reliable moods, follows the two word format. |
| `qwen2.5:3b` | ~2 GB | Equally good alternative. |
| `qwen2.5:1.5b` | ~1 GB | The smallest that still works well. Occasional format slips, which Minstrel handles by falling back to keywords for that check. |
| `llama3.2:1b` | ~0.8 GB | Works most of the time, noticeably wobblier on subtle moods (mysterious vs tension). Fine on a weak machine. |

Anything 3B-class runs fast even on CPU. Below 1B is not worth it: the keyword fallback is comparable at that point.

## Windows

1. Download and install Ollama from [ollama.com/download](https://ollama.com/download).
2. Allow the extension to call it. Open PowerShell and run:
   ```powershell
   setx OLLAMA_ORIGINS "chrome-extension://*"
   ```
3. Quit Ollama from the tray icon and start it again so it picks up the variable.
4. Pull a model:
   ```powershell
   ollama pull llama3.2:3b
   ```

## Linux

1. Install Ollama:
   ```bash
   curl -fsSL https://ollama.com/install.sh | sh
   ```
   (Arch: `pacman -S ollama`. Others: see [ollama.com/download](https://ollama.com/download).)
2. Allow the extension to call it. If Ollama runs as a systemd service:
   ```bash
   sudo systemctl edit ollama
   ```
   Add these lines, then save:
   ```ini
   [Service]
   Environment="OLLAMA_ORIGINS=chrome-extension://*"
   ```
   Then restart it:
   ```bash
   sudo systemctl restart ollama
   ```
   If you run it manually instead, start it as:
   ```bash
   OLLAMA_ORIGINS="chrome-extension://*" ollama serve
   ```
3. Pull a model:
   ```bash
   ollama pull llama3.2:3b
   ```

## Why OLLAMA_ORIGINS?

Ollama only accepts browser requests from origins it trusts. The extension calls it from a `chrome-extension://` origin, so that origin must be allowed. `chrome-extension://*` allows extensions on your own machine to talk to your own Ollama; it does not expose Ollama to the network.

## Point Minstrel at it

1. Click the gear button on the Minstrel widget (or right click the toolbar icon and pick Options).
2. Set **LLM endpoint** to `http://localhost:11434/v1`
3. Set **Model** to the model you pulled, for example `llama3.2:3b`
4. Leave **API key** empty. Save.

Optional but worth it: paste a one paragraph synopsis of your current book in the same settings. The model uses it to calibrate moods to the story's overall tone.

## Verify it works

```bash
curl http://localhost:11434/v1/chat/completions -d '{
  "model": "llama3.2:3b",
  "messages": [{"role": "user", "content": "Reply with exactly one word: calm"}]
}'
```

If you get a JSON response containing "calm", Minstrel will work. If moods ever stop changing, the widget quietly falls back to keywords; check that Ollama is running and the model name in settings matches what you pulled.

## Hosted APIs instead

Any OpenAI compatible endpoint works: set the endpoint (for example `https://openrouter.ai/api/v1`), your API key, and a model name. Minstrel sends roughly one small request per screenful of text, so even paid APIs cost next to nothing.
