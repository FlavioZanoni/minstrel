# Publishing Minstrel to the Chrome Web Store

## Build the package

```bash
./package.sh
```

This checks the music is present and produces `minstrel.zip` at the repo root, ready to upload.

## Dashboard checklist

1. [Developer Dashboard](https://chrome.google.com/webstore/devconsole), one-time $5 registration if not done.
2. Add new item, upload `minstrel.zip`.
3. Store listing: description, category, icon (auto-detected from the package), at least one 1280x800 screenshot (the widget over a novel page with the reading band guides visible).
4. Privacy tab: see below.
5. Distribution: free. Consider "Unlisted" visibility for a shareable testing URL before going public.
6. Submit for review.

## Privacy tab answers

Single purpose description:

> Minstrel plays mood-matched background music while the user reads. It classifies the mood of the visible text and crossfades between bundled, freely licensed tracks.

Permission justifications:

- `activeTab` + `scripting`: inject the player widget into the page the user explicitly clicked the extension on. No content script runs anywhere else.
- `storage`: save the user's settings (endpoint, reading band, volume, tuning).
- Optional host permissions: requested only for the origin of the LLM endpoint the user configures in settings, so the extension's service worker can call it. Never requested at install. Users who skip LLM setup grant no host access at all.

Data usage disclosure: the extension sends the visible page text to a user-configured API endpoint for mood classification, only when the user has set one up. Nothing is sent to the developer. Privacy policy: link to `PRIVACY.md` in the repository (or a hosted copy).

## Notes

- Remote code: none. All code ships in the package; the LLM endpoint returns data (a mood word), not code.
- New versions: bump `version` in `extension/manifest.json`, rebuild, upload to the existing item.
