# Three-Way AI Director

Backend-first toolkit for hosting multi-model conversations. The server coordinates Basil (the human host), an Anthropic Claude co-host, and a guest OpenAI model while producing clean audio stems for each participant. Use it as the foundation for creator-focused studio tools, livestream assistants, or rapid ideation jams.

## Table of contents

1. [Features](#features)
2. [Architecture overview](#architecture-overview)
3. [Repository layout](#repository-layout)
4. [Prerequisites](#prerequisites)
5. [Quick start](#quick-start)
6. [Environment variables](#environment-variables)
7. [Available scripts](#available-scripts)
8. [Backend API](#backend-api)
9. [Performance tips](#performance-tips)
10. [Development notes](#development-notes)
11. [Roadmap ideas](#roadmap-ideas)
12. [Related projects](#related-projects)

## Features

- **Conversation memory** – Session-aware transcript builder keyed by `sessionId`, tagging each turn as `<human>`, `<co-host>`, or `<guest>` for consistent prompting.
- **Adaptive transcription** – Streams push-to-talk clips through OpenAI Whisper (`whisper-1` by default) and trims silence so models react quickly.
- **Claude co-hosting** – Wraps the Anthropic Messages API and injects the latest transcript context so Claude can riff with the host.
- **Guest pipeline** – Calls OpenAI Chat Completions for the guest personality with the same structured transcript so everyone knows who said what.
- **Voice synthesis** – Converts replies to WAV using OpenAI TTS models with per-speaker voice settings, returning base64 blobs to the browser.
- **Asset export** – Tracks continuous stems on the client side for `basil.wav`, `claude.wav`, and `guest-ai.wav` so you can remix the session later.
- **Health endpoint** – `/api/health` reports the availability of the upstream AI providers to gate UI actions.

## Architecture overview

```
 ┌─────────────┐          ┌─────────────────────┐
 │   Browser   │  audio   │  Express middleware │
 │  dashboard  │ ───────▶ │  (multer uploads)   │
 └─────┬───────┘          └─────────┬───────────┘
       │                            │
       │ session transcript         │ orchestrated turn pipelines
       ▼                            ▼
 ┌─────────────┐         ┌─────────────────────┐
 │ Session     │  ◀────▶ │  Claude / Guest AI  │
 │ memory      │         │  + voice synthesis   │
 └─────────────┘         └─────────────────────┘
```

Key flows:

1. The browser records push-to-talk audio and uploads it with a `sessionId`.
2. `pipelines/transcriptionPipeline` stores the transcript, normalises speaker tags, and detects when to call Claude vs. guest models.
3. `services/claudeService` and `services/guestService` format prompts and stream responses back to the browser.
4. `services/textToSpeechService` synthesises WAV audio and returns it to the UI alongside structured text.

## Repository layout

```
server/
  config.js          # Environment bindings and sensible defaults
  clients/           # OpenAI + Anthropic client singletons
  services/          # Transcription, AI orchestration, and TTS helpers
  pipelines/         # High-level turn orchestration logic
  middleware/        # Express middleware (uploads, error handling)
  utils/             # Shared helpers (e.g., HttpError)
public/
  index.html         # Minimal host console for manual testing
  app.js             # Push-to-talk controls and audio export wiring
  styles.css
frontend-preview/
  README.md          # Stand-alone UI preview instructions
  ...                # Static HTML/CSS/JS for mock interactions
```

## Prerequisites

- Node.js **18 or later**
- An Anthropic API key with access to the Claude model listed in `.env.example`
- An OpenAI API key with Whisper, Chat Completions, and TTS access
- (Optional) A browser that supports Web Audio APIs for the push-to-talk UI

## Quick start

1. Install dependencies:
   ```bash
   npm install --omit=dev
   ```
2. Copy the example environment file and fill in your keys:
   ```bash
   cp .env.example .env
   # Edit .env and add OPENAI_API_KEY / ANTHROPIC_API_KEY
   ```
3. Launch the development server:
   ```bash
   npm run dev
   ```
4. Visit [http://localhost:3000](http://localhost:3000) and allow microphone access when prompted.

The development script watches `.env` on boot. Restart the server if you change API keys or core model settings.

## Environment variables

| Name | Description | Default |
| ---- | ----------- | ------- |
| `OPENAI_API_KEY` | Required for Whisper, Chat Completions, and TTS calls. | – |
| `ANTHROPIC_API_KEY` | Required for Claude co-host replies. | – |
| `PORT` | HTTP port the Express server listens on. | `3000` |
| `TRANSCRIBE_MODEL` | Whisper model used for speech-to-text. | `whisper-1` |
| `CLAUDE_MODEL` | Anthropic model slug for the co-host. | `claude-3-5-sonnet-20241022` |
| `GUEST_MODEL` | OpenAI chat model slug for the guest persona. | `gpt-4o-mini` |
| `CLAUDE_VOICE_MODEL` | OpenAI TTS model for Claude audio. | `gpt-4o-mini-tts` |
| `CLAUDE_VOICE` | Voice preset for Claude. | `verse` |
| `GUEST_VOICE_MODEL` | OpenAI TTS model for the guest voice. | `gpt-4o-mini-tts` |
| `GUEST_VOICE` | Voice preset for the guest persona. | `alloy` |
| `SESSION_TTL_MINUTES` | Minutes of inactivity before a session expires. | `30` |
| `SESSION_MAX_HISTORY` | Maximum number of transcript turns retained. | `60` |
| `SESSION_MAX_SESSIONS` | Cap on simultaneous active sessions. | `25` |
| `RATE_LIMIT_WINDOW_SECONDS` | Rate-limit window for `/api/*` endpoints. | `60` |
| `RATE_LIMIT_MAX_REQUESTS` | Number of requests permitted within the window. | `20` |

Store secrets securely when deploying (e.g., using platform secrets managers). Only commit `.env.example`, not real credentials.

## Available scripts

| Command | Purpose |
| ------- | ------- |
| `npm run dev` | Starts the Express server in development mode with verbose logging. |
| `npm start` | Starts the server in production mode. Useful for deployment containers. |

No automated tests ship with this MVP yet; see [Roadmap ideas](#roadmap-ideas) for planned coverage.

## Backend API

All interactive endpoints expect a `sessionId` form field or `X-Session-Id` header so the server can stitch together multi-turn context.

| Endpoint | Method | Body | Returns |
| -------- | ------ | ---- | ------- |
| `/api/claude` | `POST` | `multipart/form-data` with `audio` + `sessionId` | `{ sessionId, transcript, claudeText, audio, mimeType }` |
| `/api/guest` | `POST` | Same contract as `/api/claude` | `{ sessionId, transcript, guestText, audio, mimeType }` |
| `/api/health` | `GET` | – | `{ openai: boolean, anthropic: boolean }` |

When calling from the browser, reuse the `sessionId` returned by the initial request to maintain transcript continuity.

## Performance tips

- Defaults cap active sessions at 25 and history at 60 turns to keep RAM usage predictable on 8 GB machines.
- Lower `RATE_LIMIT_MAX_REQUESTS` or swap in lighter TTS models if latency spikes while multitasking.
- When developing locally, stop other Node.js processes to free file handles for audio uploads.
- For prolonged sessions, persist transcripts externally (see [Roadmap ideas](#roadmap-ideas)).

## Development notes

- All voice synthesis happens server-side to simplify browser permissions; the client only plays returned base64 audio.
- `middleware/` centralises upload handling so you can plug in custom validation or storage destinations.
- The included static UI in `public/` is a minimal operator console. For a richer UX, check out the [`frontend-preview`](frontend-preview/README.md) prototype or build on top of these endpoints directly.

## Roadmap ideas

- Persist session timelines server-side for full conversation logs and analytics.
- Stream audio chunks before synthesis finishes for faster perceived latency.
- Add WebSocket transport and interruption controls to let the host cut off a tangent.
- Provide persona presets and runtime memory injection via REST.
- Introduce automated integration tests (transcription + response stubs) once the API stabilises.

## Related projects

- [`frontend-preview/`](frontend-preview/README.md) – Click-through mock of the UI without API keys or microphone access.
- Future integrations (e.g., OBS overlays, podcast DAWs) can treat this server as the intelligence layer.
