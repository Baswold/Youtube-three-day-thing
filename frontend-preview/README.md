# Frontend preview

Standalone click-through mock of the Three-Way AI Director interface. The preview mirrors the production layout but replaces network calls with deterministic sample data so that anyone can review the UX without API credentials.

## Launching the preview

1. Open `index.html` directly in any modern desktop browser (Chrome, Firefox, or Edge work best).
2. Interact with the controls—session management, talk buttons, timers, and waveform orbs behave exactly like the live client, minus the real audio pipeline.

No build step or local server is required; the preview runs entirely from static assets.

## Simulated behaviour

| Feature | Preview behaviour |
| ------- | ----------------- |
| Health check | Status banner is locked to **Preview Mode**. |
| Audio capture | Microphone permissions are never requested and no audio is recorded. |
| AI responses | Transcript entries are generated from curated sample turns to illustrate pacing and formatting. |
| Playback | Buttons animate but no audio is played. |

## What you can evaluate

- Visual design, colour palette, and component spacing.
- Button states, hover/focus outlines, and accessibility labelling.
- Transcript cadence and how turn-taking is communicated to the host.
- Responsiveness when resizing between laptop and tablet breakpoints.

## Customising the preview

- Update `script.js` to swap in different scripted responses.
- Adjust colours and layout in `styles.css` to try brand variations.
- Add annotations or highlight flows by editing the DOM in `index.html`.

Because the preview is static, you can host it from any CDN or simply share the folder over cloud storage when gathering feedback from collaborators.
