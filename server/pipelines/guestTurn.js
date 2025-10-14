const { transcribeAudio } = require('../services/transcription');
const { guestRespond } = require('../services/guest');
const { synthesizeSpeech } = require('../services/tts');
const config = require('../config');
const sessionStore = require('../utils/sessionStore');

async function runGuestTurn({ sessionId, buffer, mimetype }) {
  const startTime = Date.now();
  const timings = {};

  const t0 = Date.now();
  const transcript = await transcribeAudio(buffer, 'basil-input.webm', mimetype);
  timings.transcription = Date.now() - t0;
  sessionStore.appendEntry(sessionId, 'human', transcript);

  const t1 = Date.now();
  const history = sessionStore.getHistory(sessionId);
  const guestText = await guestRespond(history);
  timings.llm = Date.now() - t1;
  sessionStore.appendEntry(sessionId, 'guest', guestText);

  const t2 = Date.now();
  const audioBuffer = await synthesizeSpeech(guestText, {
    voiceModel: config.voices.guest.model,
    voice: config.voices.guest.voice,
  });
  timings.tts = Date.now() - t2;
  timings.total = Date.now() - startTime;

  console.log(`[Guest Turn] Total: ${timings.total}ms | ASR: ${timings.transcription}ms | LLM: ${timings.llm}ms | TTS: ${timings.tts}ms`);

  return {
    transcript,
    guestText,
    audioBuffer,
  };
}

module.exports = runGuestTurn;
