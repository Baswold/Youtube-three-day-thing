const HttpError = require('../utils/httpError');
const config = require('../config');
const { openai } = require('../clients');

async function synthesizeSpeech(text, { voiceModel, voice }) {
  if (!openai) {
    throw new HttpError(500, 'Speech synthesis unavailable: OpenAI client not configured');
  }

  const model = voiceModel || config.voices.claude.model;
  const selectedVoice = voice || config.voices.claude.voice;

  const speech = await openai.audio.speech.create({
    model,
    voice: selectedVoice,
    input: text,
    format: 'wav',
  });

  const audioBuffer = Buffer.from(await speech.arrayBuffer());
  return audioBuffer;
}

module.exports = {
  synthesizeSpeech,
};
