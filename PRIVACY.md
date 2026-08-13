# Minstrel privacy policy

Minstrel does not collect, sell, or share any data. There are no analytics, no tracking, and no servers of ours.

What the extension stores, all via Chrome's own extension storage (synced with your Chrome profile if sync is on):

- Your settings: LLM endpoint, API key, model name, book synopsis, reading band position, and tuning preferences.

What leaves your browser:

- Nothing, by default. The built-in keyword classifier runs entirely locally.
- If you configure an LLM endpoint in the settings, the text of the passage currently on your screen is sent to that endpoint (and only that endpoint) to classify its mood. You choose the endpoint; it can be a local model on your own machine (Ollama) or a hosted API you have an account with. Your API key is sent only to that same endpoint as authentication.

Minstrel requests host access only for the endpoint you configure, at the moment you save it. It does not request blanket access to websites at install time.

Music is bundled with the extension and plays locally. Nothing about your reading is logged anywhere by Minstrel.
