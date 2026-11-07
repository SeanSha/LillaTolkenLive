# Architecture

Lilla Tolken Live is a one-screen interpreter for a student's phone. The phone microphone is the only input. Translated speech plays through the phone's current output: wired headphones, Bluetooth headphones, or the built-in speaker.

The visual reference is the original Lilla Tolken app: a warm cream page, a large rounded blue action, and very little text.

## Session path

```text
Phone microphone
  -> getUserMedia (echo cancellation, noise suppression, automatic gain)
  -> browser RTCPeerConnection
  -> OpenAI Realtime Translation (gpt-realtime-translate)
  -> remote Chinese audio track + transcript deltas
  -> one hidden audio element, system output route
```

The start tap primes that audio element before any await, so iPhone Safari can play the later remote track. The same WebRTC session stays open across sentences. Stop closes the peer connection, stops the microphone tracks, and removes the audio element.

The permanent API key stays on the Node server. `POST /api/session` exchanges it for a short-lived client secret at `https://api.openai.com/v1/realtime/translations/client_secrets`. The browser then posts its SDP offer to `https://api.openai.com/v1/realtime/translations/calls` with that secret. The browser never receives `OPENAI_API_KEY`.

The session is configured only with documented translation fields:

- model `gpt-realtime-translate`
- input transcription model `gpt-realtime-whisper`
- output language, default `zh`
- `far_field` noise reduction for the desk microphone

Transcript text comes from `session.output_transcript.delta` on the `oai-events` data channel. General-purpose Realtime voice events are ignored. Translated speech is the remote WebRTC audio track.

`ClassroomSessionMachine` owns the lifecycle:

`idle -> requestingPermission -> connecting -> streaming -> reconnecting -> stopping -> stopped`

Failures go to `error`. The machine does not see audio samples. A dropped connection retries twice without asking the student to start again, as long as the microphone track is still live.

`OpenAIRealtimeTranslationProvider` is the only translation provider.

## Phone access

`npm run dev` serves the page on `127.0.0.1:5173` and proxies `/api` to `127.0.0.1:8787`.

`npm run dev:phone` serves the same page with a local HTTPS certificate on the LAN. The phone uses that HTTPS origin. The API process stays on localhost behind the proxy.

## Server code that the screen does not use

The server still contains an in-memory classroom WebSocket at `/ws` from an earlier prototype. The app does not link to it, and the student screen does not join a classroom. It is not part of the product.

## Timing

Client metrics use `performance.now()`. They are available in the collapsed diagnostics. They are not playback latency. USD cost is left unknown because these responses do not include a price.

## What is not stored

Microphone audio and transcripts are not written to disk. Logs redact `sk-` keys, `ek_` client secrets, and bearer tokens.
