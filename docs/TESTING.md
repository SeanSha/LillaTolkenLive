# Testing

Automated tests do not call OpenAI and do not require an API key.

```powershell
cd D:\Coding\LillaToken_Live
npm test
npm run typecheck
npm run build
```

## What the automated tests cover

- Supported target languages, including the rejection of Swedish as an output language.
- Far-field noise reduction for a microphone, and null noise reduction for tab audio.
- Audio mix math.
- Secret redaction.
- Translation event reduction for `session.output_transcript.delta` only.
- Classroom code shape, used by leftover server code.
- Monotonic session duration, with cost left unknown.
- The client-secret HTTP request body, including that the permanent API key is not copied into it.
- `/api/health` and `/api/session` with a mocked OpenAI response, including a redacted 401 body.
- Two WebSocket clients against the leftover classroom server.
- The session state machine, including the two-reconnect limit.
- Microphone constraints: echo cancellation, noise suppression, and automatic gain control.
- The browser SDP request uses the short-lived secret rather than an `sk-` key.

## What is not automated

A real Swedish-to-Chinese OpenAI session was not executed here. That needs your API key, a live microphone, and a person speaking Swedish. A physical iPhone or Android was not used in this pass. The local HTTPS certificate flow was not opened on a phone.

## Manual check on this computer

1. Put your key in `.env` as `OPENAI_API_KEY`.
2. Run `npm run dev`.
3. Open `http://127.0.0.1:5173`.
4. Confirm the page is one screen: title, subtitle, microphone picture, `Auto → 中文`, and **开始实时翻译**.
5. Tap start, allow the microphone, and speak Swedish with headphones on.
6. Chinese audio should continue across sentences.
7. Tap **结束翻译** and confirm the browser microphone indicator clears.

Without a key, start should reach **连接失败** and explain that the key is missing. It should not play fake translated audio.

## Manual check on a phone

Follow the phone steps in the README. Confirm the microphone permission appears, Swedish speech nearby becomes continuous Chinese audio, and stop ends both the microphone and the playback.
