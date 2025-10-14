require('dotenv').config();

const number = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const positiveInt = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
};

const minutesToMs = (value, fallback) => positiveInt(value, fallback) * 60 * 1000;
const secondsToMs = (value, fallback) => positiveInt(value, fallback) * 1000;

const config = {
  port: number(process.env.PORT, 3000),
  openaiApiKey: process.env.OPENAI_API_KEY,
  anthropicApiKey: process.env.ANTHROPIC_API_KEY,
  models: {
    transcription: process.env.TRANSCRIBE_MODEL || 'whisper-1',
    claude: process.env.CLAUDE_MODEL || 'claude-3-5-sonnet-20241022',
    guest: process.env.GUEST_MODEL || 'gpt-4o-mini',
  },
  voices: {
    claude: {
      model: process.env.CLAUDE_VOICE_MODEL || 'gpt-4o-mini-tts',
      voice: process.env.CLAUDE_VOICE || 'verse',
    },
    guest: {
      model: process.env.GUEST_VOICE_MODEL || 'gpt-4o-mini-tts',
      voice: process.env.GUEST_VOICE || 'alloy',
    },
  },
  session: {
    ttlMs: minutesToMs(process.env.SESSION_TTL_MINUTES, 30),
    maxHistory: positiveInt(process.env.SESSION_MAX_HISTORY, 60),
    maxSessions: positiveInt(process.env.SESSION_MAX_SESSIONS, 25),
  },
  rateLimit: {
    windowMs: secondsToMs(process.env.RATE_LIMIT_WINDOW_SECONDS, 60),
    maxRequests: positiveInt(process.env.RATE_LIMIT_MAX_REQUESTS, 20),
  },
};

module.exports = config;
