# Three-Way AI Director (Backend-heavy MVP)

Backend-first stack for orchestrating Basil, Claude, and guest AI co-hosts while delivering clean audio stems for post-production.

## What the backend does

- **Conversation memory** – In-memory session store keyed by `sessionId`, tracking ordered speaker turns with `<human>`, `<co-host>`, and `<guest>` tags for model prompts.
- **Transcription pipeline** – Streams host push-to-talk clips to OpenAI Whisper (`whisper-1` by default).
- **Claude pipeline** – Wraps Anthropic Messages API for co-host replies with role-tagged transcript context.
- **Guest pipeline** – Uses OpenAI Chat Completions with the same structured transcript so each model knows who is speaking.
- **Voice synthesis** – Converts responses to WAV using OpenAI TTS (non-ElevenLabs) with per-speaker voice settings.
- **Exports** – Returns base64 audio for playback and records continuous stems on the client for `basil.wav`, `claude.wav`, and `guest-ai.wav`.
- **Health endpoint** – `/api/health` reports whether OpenAI/Anthropic clients booted.

## Project structure

```
server/
  config.js          # Environment + model/voice defaults
  clients/           # OpenAI + Anthropic singletons
  services/          # Transcription, Claude, Guest, TTS helpers
  pipelines/         # High-level turn orchestration
  utils/httpError.js # Lightweight typed errors
public/
  index.html
  app.js             # Minimal host console (push-to-talk, export)
  styles.css
```

## Prerequisites

- Node.js 18+
- Anthropic API key (`ANTHROPIC_API_KEY`)
- OpenAI API key (`OPENAI_API_KEY`) with access to the models listed above

## Getting started

1. `npm install --omit=dev` (saves disk space on low-storage machines)
2. `cp .env.example .env`
3. Populate `.env` with your keys and any optional overrides
4. `npm run dev`

Visit http://localhost:3000 and allow mic access.

### Low-spec tuning

- Defaults cap active sessions at 25 and history at 60 turns to keep RAM usage predictable on 8 GB machines.
- Reduce `RATE_LIMIT_MAX_REQUESTS` or voice model quality in `.env` if latency spikes while multitasking.
- When developing, shut down other Node processes so the server has enough file handles for audio uploads.

## Backend API

All interactive endpoints expect a `sessionId` form field (or `X-Session-Id` header) so the server can stitch together multi-turn context.

### `POST /api/claude`
`multipart/form-data` with `audio` + `sessionId`. Returns `{ sessionId, transcript, claudeText, audio, mimeType }`. Claude sees the running transcript as `<human/>`, `<co-host/>`, and `<guest/>` tags so it knows who is on the mic.

### `POST /api/guest`
Same contract, returning `{ sessionId, transcript, guestText, audio, mimeType }`. Guest AI receives Claude turns as `<co-host>` blocks and is instructed to answer the most recent `<human>` statement.

### `GET /api/health`
Returns client availability flags for observability and UI gating.

## Roadmap

- Persist session timelines server-side for full conversation logs.
- Streaming playback hooks (send partial audio frames before full render finishes).
- WebSocket low-latency transport plus interruption controls.
- Hot-swappable persona presets and memory injection via REST.
