# WebDich v0.1 — Voice → Text

Phase 1 baseline. Single purpose: **MIC → realtime text → auto detect EN/VI → commit to the correct final column.**
No translation, no TTS, no LLM, no backend, no history. (spec §1, §23)

## Files

```
webdich-0.1/
├── index.html      # layout: LIVE (1/6) | FINAL EN/VI (4/6) | MIC (1/6)
├── style.css       # black, thin borders, mobile-first, no cards / no gradient
├── app.js          # SpeechRecognition + live buffer + language detector + final buffers
├── manifest.json   # PWA manifest (installable)
├── icon.svg        # app icon
└── README.md
```

## Run

Microphone + Web Speech API require a **secure context**: `https://` or `localhost`.
Opening `index.html` directly via `file://` will block the mic in most browsers.

```bash
cd webdich-0.1
python3 -m http.server 8080
# then open http://localhost:8080
```

Best browser support: **Chrome / Edge (desktop or Android)**. Safari supports
SpeechRecognition partially (no continuous mode on iOS); Firefox does not support it.

## How it works (spec §17)

```
Microphone → Web Speech API (interim + final)
           → LIVE = current partial (replace, never append — §9)
           → on final: detectLanguage() → {vi|en|unknown, confidence}
           → confidence ≥ 0.70 → commit to FINAL VI or FINAL EN (once — §10)
           → unknown → stays in LIVE, not committed (§6)
```

- `detectLanguage()` is a pure heuristic: Vietnamese diacritic count + VI/EN
  stopword frequency. No AI, no network call (§5).
- After a confident final, the ASR `lang` is adapted (`vi-VN` / `en-US`) for the
  next recognition pass to improve accuracy.
- If recognition stops unexpectedly while the mic is ON, it auto-restarts (§7, §20).

## Acceptance tests (spec §22)

1. Say *"Xin chào, tôi muốn đi đến ga tàu."* → appears in **FINAL VIETNAMESE**, EN stays empty.
2. Say *"Hello, I want to go to the train station."* → appears in **FINAL ENGLISH**, VI stays empty.
3. Partial results replace the LIVE line — no duplicated stacking.
4. Multiple sentences commit once each, no repeats.
5. Switching language mid-session routes each sentence to its own buffer.

## Known limits (v0.1 by design)

- Single-language ASR pass; unsigned Vietnamese (no diacritics) may be misclassified.
- No punctuation restoration — final text is raw ASR transcript.
- No offline ASR; requires network for Chrome's speech service.
- Buffers live in memory only — refresh clears them (no history by design).

## Phase 2 hook

`commitEnglish()` / `commitVietnamese()` are the exact insertion points for the
future Translation module. The UI and Phase-1 pipeline stay unchanged.
