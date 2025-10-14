const { transcribeAudio } = require('../services/transcription');
const { claudeRespond } = require('../services/claude');
const { synthesizeSpeech } = require('../services/tts');
const config = require('../config');
const sessionStore = require('../utils/sessionStore');

async function runClaudeTurn({ sessionId, buffer, mimetype }) {
  const startTime = Date.now();
  const timings = {};

  const t0 = Date.now();
  const transcript = await transcribeAudio(buffer, 'basil-input.webm', mimetype);
  timings.transcription = Date.now() - t0;
  sessionStore.appendEntry(sessionId, 'human', transcript);

  const t1 = Date.now();
  const history = sessionStore.getHistory(sessionId);
  const claudeText = await claudeRespond(history);
  timings.llm = Date.now() - t1;
  sessionStore.appendEntry(sessionId, 'claude', claudeText);

  const t2 = Date.now();
  const audioBuffer = await synthesizeSpeech(claudeText, {
    voiceModel: config.voices.claude.model,
    voice: config.voices.claude.voice,
  });
  timings.tts = Date.now() - t2;
  timings.total = Date.now() - startTime;

  console.log(`[Claude Turn] Total: ${timings.total}ms | ASR: ${timings.transcription}ms | LLM: ${timings.llm}ms | TTS: ${timings.tts}ms`);

  return {
    transcript,
    claudeText,
    audioBuffer,
  };
}

module.exports = runClaudeTurn;
