# Lilla Tolken Live

A personal, mobile-first interpreter for a student in class.

Open the app on your phone, tap **开始实时翻译**, and put the phone on the desk. The phone microphone listens to the teacher. Chinese speech plays through your headphones or the phone speaker. Tap **结束翻译** when the lesson ends.

The teacher does not install anything. There is no classroom code and no second device.

This project does not modify the original Lilla Tolken dialogue app.

## Requirements

- Node.js 20 or newer
- A phone browser (Safari on iPhone, or Chrome on Android) for the real lesson
- Chrome on Windows is enough to check the screen on this computer

## Configure

```powershell
cd D:\Coding\LillaToken_Live
Copy-Item .env.example .env
notepad .env
```

Set `OPENAI_API_KEY` in `.env`. Do not commit that file. If `node` is not on your PATH:

```powershell
$env:Path = "C:\Program Files\nodejs;" + $env:Path
```

## Run on this computer

```powershell
cd D:\Coding\LillaToken_Live
npm install
npm run dev
```

Open <http://127.0.0.1:5173>. The page is one screen and one large button.

## Run on a real iPhone or Android phone

A phone microphone only works in a secure context. `http://192.168.x.x` is not secure. Use the phone script, which serves the app with HTTPS on your Wi-Fi.

1. Put the computer and the phone on the same Wi-Fi.
2. Allow Node.js through the Windows firewall if a prompt appears.
3. Start:

```powershell
cd D:\Coding\LillaToken_Live
npm run dev:phone
```

4. In the Vite output, find the Network address, for example `https://192.168.1.20:5173`.
5. Open that address on the phone.
6. The certificate is local and untrusted. On iPhone, tap Show Details / visit the website, or accept the warning in Chrome on Android.
7. Tap **开始实时翻译** and allow the microphone.
8. Wear headphones if you can. The speaker is still available. Echo cancellation is on, and it does not guarantee silence from the speaker will stay out of the microphone.
9. Speak Swedish near the phone. Chinese audio should continue across sentences until you tap **结束翻译**.

The phone talks only to the Vite server. Vite proxies `/api` to the API on this computer, so the OpenAI key stays on the computer.

If the phone will not trust the local certificate, keep `npm run dev` running and use an HTTPS tunnel pointed at `http://127.0.0.1:5173`, for example:

```powershell
cloudflared tunnel --url http://127.0.0.1:5173
```

Open the `https://…trycloudflare.com` address on the phone.

## What the button does

Start, from the same tap:

1. Unlocks audio playback for iPhone Safari.
2. Asks for the microphone.
3. Asks the local server for a short-lived translation secret.
4. Opens a WebRTC connection to `gpt-realtime-translate`.
5. Streams the microphone continuously.
6. Plays Chinese speech on the phone's current audio output.

Stop releases the microphone, playback, the translation session, and the WebRTC connection.

The source language is detected automatically. Swedish is the expected classroom language. The default output is Chinese. A small settings icon can change the output language for the next session.

## Checks

```powershell
npm test
npm run typecheck
npm run build
```

`npm test` does not call OpenAI and does not spend API credit.

## Privacy

While a session is running, microphone audio and transcripts are sent to OpenAI. This app does not write them to disk. Do not use it to record children. Use adult voices or authorized recordings while developing.

## Docs

- [Architecture](docs/ARCHITECTURE.md)
- [Testing](docs/TESTING.md)
- [Known limitations](docs/KNOWN_LIMITATIONS.md)
