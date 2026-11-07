# Known limitations

## Translation model

`gpt-realtime-translate` detects the spoken input language and translates into one of the documented output languages. Swedish is an expected input, not an output language. The model does not support custom instructions, glossary injection, or voice selection. Translated speech follows the source speaker rather than a chosen voice.

The official browser path used here is WebRTC, not the general-purpose Realtime voice WebSocket. This app does not send `response.create` or a system prompt.

## Not verified against the live API or a physical phone

The code follows the documented client-secret and SDP call flow, and the server is tested with a mocked OpenAI response. A real session with your key, real Swedish speech, and audible Chinese output still has to be run by you. Until that succeeds, treat the audio path as implemented but not personally verified end to end.

The phone HTTPS script was not opened on an iPhone or Android in this pass.

## Acoustic feedback

The same phone records the teacher and plays Chinese. Browser echo cancellation, noise suppression, and automatic gain control are requested. The translation session uses far-field noise reduction because the phone sits on a desk.

None of that guarantees the speaker will stay out of the microphone. Headphones are the better way to listen. The speaker is still allowed, and there is no separate output picker. The phone uses its current system route.

The translation session is not restarted between sentences.

## Playback on iPhone

The start tap plays a silent clip on the same audio element that later receives the translated track. If Safari still blocks playback, a small **点一下播放译文** control appears. That control is hidden when playback is already running.

## Privacy

This is a local tool. It is not an approved system for recording schoolchildren.

- Audio is sent to OpenAI for the duration of a translation session.
- The app does not write audio or transcripts to disk.
- The OpenAI API key and client secret are not written to logs. Client secrets still exist in browser memory for the SDP request.
- There is no analytics service.

## Leftover server classroom code

An earlier prototype kept an in-memory classroom WebSocket on the server. The current screen does not create classrooms, show codes, or broadcast audio to other people. That server code is unused by the product and is not a supported classroom feature.
