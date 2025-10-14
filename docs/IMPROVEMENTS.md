# Comprehensive Improvement Plan for the Three-Way AI Director

This document captures an extensive backlog of refinements that will raise the overall quality, stability, and usability of the Three-Way AI Director project. Items are grouped by theme to make prioritisation easier, and each section calls out the specific files and behaviours that motivate the recommendation.

## 1. Platform Resilience and Error Handling

1. **Harden third-party dependency failures** – Today, missing API keys trigger warnings during boot but will still allow `/api/claude` or `/api/guest` requests to reach runtime errors when `openai` or `anthropic` are `null` inside the pipeline services (see `server/services/claude.js` and `server/services/guest.js`). Add early startup validation that fails fast when required providers are absent, and return a structured 503 response to clients to avoid noisy stack traces. 
2. **Graceful degradation for partial outages** – When one vendor is down, the server should still allow the other persona to operate. Implement capability flags on the health endpoint (already returns Booleans) and teach the frontend to disable only the affected persona button rather than the entire UI (currently `checkHealth()` disables `startBtn`).
3. **Timeout management** – Wrap long-running external calls (transcription, LLM, TTS) with configurable timeouts and retry/backoff policies. Right now `transcribeAudio`, `claudeRespond`, and `guestRespond` will hang indefinitely if the vendor API stalls; use `AbortController` with OpenAI and Anthropic SDKs or proxy through a `Promise.race` guard. 
4. **Back-pressure for session store** – `sessionStore` currently cleans up stale sessions lazily when new ones arrive. Introduce a periodic cleanup interval and metrics for eviction events to prevent memory growth when traffic pauses. Consider using a TTL map or migrating to Redis for multi-instance deployments.
5. **Structured logging** – Swap string concatenation in middleware and pipelines for a structured logger (Pino, Winston) so logs can include metadata like session IDs, durations, and error codes that can be parsed downstream.

## 2. Observability and Monitoring

1. **Prometheus-friendly metrics** – Expose `/metrics` with counters/histograms for ASR, LLM, and TTS latency. You already compute per-stage timings in `claudeTurn` and `guestTurn`; record them in a metrics registry. 
2. **Request tracing** – `requestLogger` assigns a `req.id`, but logs are plain text. Emit the ID in JSON and propagate it in responses (`X-Request-Id` header is already set). On the frontend, surface the ID in error toasts so support can cross-reference server logs. 
3. **Session analytics** – Track number of turns, average duration, and persona interruption rate so product can tune prompt engineering. Extend `sessionStore` entries to include aggregated stats instead of only `history` and `timestamps`.
4. **Client-side telemetry** – Augment `public/app.js` to record push-to-talk frequency, audio errors, and user agent details. Send this data to a logging endpoint so reliability issues across browsers become visible.

## 3. Testing and Quality Assurance

1. **Automated unit tests** – Introduce Jest or Vitest coverage for utility modules (`sessionStore`, `context`, `HttpError`). Mock OpenAI/Anthropic clients to test pipeline orchestration logic without hitting the network. 
2. **Integration tests** – Use SuperTest to simulate multipart uploads against `/api/claude` and `/api/guest`, ensuring audio MIME validation and error handling behave correctly. Provide fixture audio samples and stub vendor responses. 
3. **Frontend end-to-end coverage** – Add Playwright or Cypress tests verifying that push-to-talk buttons toggle states, timer increments, and health status gating works. Mock the backend with MSW or a local Express stub. 
4. **Load testing** – Adopt k6 or Artillery scenarios to evaluate rate-limit behaviour, session eviction, and concurrency under real audio payloads. Document expected throughput so operators can provision hardware.
5. **Continuous Integration** – Introduce GitHub Actions workflows that run linting, tests, and vulnerability scans on every PR. For secrets-dependent tests, rely on recorded fixtures or `nock` to avoid live API usage.

## 4. Audio Capture and Processing

1. **Noise detection and trimming** – Preprocess recorded snippets on the client to remove leading/trailing silence, reducing transcription cost and latency. Web Audio’s `AnalyserNode` is already initialised; compute RMS levels to auto-stop recording when silence is detected.
2. **Automatic gain control** – Provide user-configurable AGC to stabilise loud/quiet speakers. Currently `getUserMedia` requests `autoGainControl: false`; experiment with enabling it or applying a custom gain node pipeline with dynamic range compression.
3. **Multi-channel routing** – Support stereo or multi-track recording so each persona retains isolated stems. At present all audio is recorded mono; extend the recorder to capture multiple channels when hardware allows.
4. **Streaming transcripts** – Whisper responses are currently fetched after the entire clip uploads. Investigate streaming partial transcripts using the Realtime API or chunked uploads to reduce conversational latency.
5. **Audio format negotiation** – Expand `AUDIO_MIME_WHITELIST` beyond a static set by negotiating supported MIME types with the browser. Provide fallback conversions or inform the user when unsupported codecs are detected.

## 5. Conversation Intelligence

1. **Persona memory injection** – `buildClaudeContext` and `buildGuestContext` rely solely on session history. Add persona-specific long-term memory (e.g., show format, recurring facts) that persists across sessions, stored in a database or config file. 
2. **Claim tracking** – Introduce structured objects in the session history representing claims, evidence, and verdicts. This enables richer prompt context and downstream analytics on fact-check outcomes. 
3. **Interruption control** – Allow the host to cut off an AI mid-response and request a rephrase or fact-check. Implement an `/api/interruption` endpoint that cancels in-flight TTS or LLM calls via abort controllers. 
4. **Moderation pipeline** – Filter both transcription input and AI outputs through moderation APIs (OpenAI’s text moderation or custom heuristics) to prevent harmful content from entering the show archive.
5. **Dynamic temperature tuning** – Expose UI controls to adjust `temperature` per persona on the fly, letting the host choose between safe vs. spicy commentary for specific episodes.

## 6. API and Data Model Enhancements

1. **Schema validation** – Use `zod` or `joi` to validate body and header inputs. Functions like `getSessionId` and `shouldResetSession` currently assume valid types; strict validation will prevent type coercion issues. 
2. **Persistent storage** – Migrate `sessionStore` to a durable database (Postgres, DynamoDB) so conversation history survives restarts. Provide migrations and retention policies. 
3. **Versioned APIs** – Namescape endpoints (e.g., `/api/v1/claude`) to allow future contract changes without breaking clients. Publish OpenAPI/Swagger docs generated from source.
4. **WebSocket transport** – Add a streaming channel for partial transcripts and audio progress updates. Useful for near-real-time captioning and to allow clients to show progress bars while TTS renders. 
5. **Role-based access control** – Gate administrative endpoints (session reset, future analytics) behind API tokens or OAuth flows, especially once persistent data is introduced.

## 7. Security and Compliance

1. **Comprehensive header policy** – Current CSP in `securityHeaders` is very strict and may block fonts or inline scripts if UI expands. Replace with Helmet and author a measured policy that still guards against XSS. 
2. **Secrets management** – Document use of environment variables for API keys and encourage deployment to use secret managers (AWS Secrets Manager, Doppler). Provide sample `.env.example` with placeholders. 
3. **Audit logging** – Record security-relevant events such as failed rate-limit attempts, authentication failures (when implemented), and session resets. 
4. **Data retention** – Define retention policy for stored audio/transcripts. Provide CLI scripts to purge old sessions to stay compliant with privacy expectations. 
5. **Dependency scanning** – Add `npm audit` and Snyk/Dependabot integration to detect vulnerabilities in dependencies like Express or multer.

## 8. Performance and Cost Optimisation

1. **Batch vendor calls** – When both Claude and Guest need the same transcript, reuse the transcription result instead of re-uploading audio; currently each pipeline performs its own `transcribeAudio` call. Cache results by audio hash. 
2. **Adaptive model selection** – Switch to cheaper models (e.g., Whisper-tiny, GPT-4o mini) when latency is more important than accuracy. Provide heuristics based on conversation type or network conditions. 
3. **Parallel TTS synthesis** – When queuing multiple responses, pipeline audio synthesis in parallel to keep up with show cadence. Manage concurrency with a worker pool to avoid rate limits. 
4. **Edge caching** – Serve static assets (public JS/CSS) through a CDN and add cache headers. `express.static` currently lacks caching configuration; set `maxAge` to reduce repeated downloads.
5. **Payload compression** – Enable gzip/brotli for API responses, especially base64 audio payloads, to lower bandwidth usage.

## 9. Frontend Experience Improvements

1. **Progressive disclosure UI** – Break up the dense control panel by grouping monitoring widgets and controls into tabs or accordions. `public/index.html` currently renders a single long panel that can overwhelm new hosts.
2. **Responsive layout** – Add media queries so the console works on tablets and smaller laptops. Today the CSS uses fixed widths for waveform canvases; adjust to percentages and allow wrapping.
3. **Accessibility** – Provide keyboard shortcuts, ARIA labels, and captioned status messages. Buttons such as `talkClaudeBtn` should support `Enter`/`Space` activation when focused. 
4. **Error surfacing** – Replace the single `exportStatusEl` text field with toast notifications categorized by severity. Include the server `requestId` when available. 
5. **Session export UX** – Offer downloadable conversation transcripts and audio stems once the session stops. Currently only base64 audio is returned; package them into zipped files or integrate with a DAW-friendly format.

## 10. Developer Experience and Tooling

1. **Local development mocks** – Provide scripts that spin up mock OpenAI/Anthropic servers so contributors without keys can run the UI. Ship recorded fixtures and deterministic responses. 
2. **TypeScript migration** – Convert the codebase to TypeScript for stronger typing, particularly across request handlers and service layers. Define interfaces for session entries and API payloads. 
3. **ESLint/Prettier** – Add linting configuration to enforce coding standards and catch unused variables or missing awaits. 
4. **Modular configuration** – Replace the single `config.js` export with environment-specific configs (development, staging, production) plus validation via `envalid`. 
5. **Hot module reloading** – Add Nodemon for backend and Vite for frontend to improve iteration speed. Document separate `npm run dev:server` and `npm run dev:client` scripts.

## 11. Deployment and Operations

1. **Containerisation** – Provide a production-ready Dockerfile with multi-stage build, non-root user, and health checks. 
2. **Infrastructure as Code** – Offer Terraform or Pulumi modules for deploying to AWS/GCP with load balancers, HTTPS termination, and autoscaling. 
3. **Blue/green deploys** – Document how to roll out new versions without downtime. Introduce environment toggles or feature flags to test new prompts. 
4. **Centralised logging** – Integrate with CloudWatch, Stackdriver, or ELK stack to collect server logs and client telemetry. 
5. **Disaster recovery** – Define backup strategy for transcripts, environment configuration, and vendor credentials. Include runbooks for partial outages (e.g., OpenAI down).

## 12. Content Strategy and Prompt Engineering

1. **Prompt versioning** – Store Claude and Guest prompts in dedicated files with version numbers so hosts can roll back to a known-good persona tone. 
2. **A/B testing** – Build tooling to compare multiple prompts live, measuring viewer engagement or correction accuracy. 
3. **Evidence injection** – Provide UI affordances for producers to upload PDFs or fact sheets whose snippets the AI can cite. Feed them into prompts via retrieval augmentation. 
4. **Tone safety rails** – Add instructions to avoid defamation, handle uncertainty gracefully, and cite sources. Monitor outputs with heuristics that detect unsupported claims. 
5. **Knowledge cut-off reminders** – Teach personas to mention their knowledge limitations and escalate to humans when unfamiliar topics arise.

## 13. Documentation and Onboarding

1. **Quick-start guide** – Expand README with screenshots, architecture diagrams, and troubleshooting tips (e.g., microphone permissions, rate-limit errors). 
2. **API reference** – Publish OpenAPI spec or Markdown tables describing endpoints, request fields, and error responses. 
3. **Operational handbook** – Document runbooks for clearing stuck sessions, rotating API keys, and interpreting metrics dashboards. 
4. **Contributor guide** – Outline coding standards, branch strategy, and review process. Provide templates for PR descriptions and bug reports. 
5. **FAQ for hosts** – Answer workflow questions: how to prep an episode, recommended audio hardware, how to adjust voices, etc.

## 14. Future Product Extensions

1. **Live fact-check overlays** – Build WebSocket push to streaming overlay software (OBS, vMix) so Claude’s verdicts appear on screen in real time. 
2. **Audience interaction** – Integrate chat/Q&A so viewers can submit claims to scrutinise. Provide moderation queue before exposing to AIs. 
3. **Mobile companion app** – Offer a lightweight mobile app for hosts to control push-to-talk when away from the control panel. 
4. **Multi-language support** – Add locale selection to run Whisper/LLMs in other languages, translating transcripts for the host. 
5. **Analytics dashboard** – After each episode, produce insights: talk-time distribution, fact-check accuracy, notable citations.

## 15. Risk Register and Mitigation Ideas

1. **Vendor rate limits** – Maintain per-service concurrency guards and queueing. Provide visibility into how close the system is to hitting OpenAI/Anthropic quotas. 
2. **Prompt drift** – Regularly review transcripts to ensure persona behaviour matches brand guidelines. Provide automated tests that diff prompt responses against baselines. 
3. **Audio sync issues** – Validate that the client’s `MediaRecorder` timestamps align with server-synthesised audio; add clock drift correction logic if necessary. 
4. **Data leakage** – Ensure transcripts with sensitive information are encrypted at rest and in transit; consider adding data loss prevention scanning before exporting. 
5. **User privacy** – Publish privacy policy detailing how session data is used, and support GDPR/CCPA requests to delete personal data.

---

This backlog is intentionally expansive so product, engineering, and operations leaders can pick the highest-leverage items for upcoming sprints. Many suggestions complement one another—for example, observability upgrades enable safe experimentation with new prompts, while testing investments make it easier to refactor toward persistent storage. Prioritise foundational infrastructure (tests, logging, security) before shipping advanced user-facing features to keep the platform trustworthy as it scales.
