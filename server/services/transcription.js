const { toFile } = require('openai/uploads');
const HttpError = require('../utils/httpError');
const config = require('../config');
const { openai } = require('../clients');

async function transcribeAudio(buffer, filename, mimetype) {
  if (!openai) {
    throw new HttpError(500, 'Transcription unavailable: OpenAI client not configured');
  }

  const file = await toFile(buffer, filename, { type: mimetype || 'audio/webm' });

  const transcription = await openai.audio.transcriptions.create({
    file,
    model: config.models.transcription,
  });

  const text = transcription.text?.trim();
  if (!text) {
    throw new HttpError(422, 'Failed to transcribe audio');
  }
  return text;
}

module.exports = {
  transcribeAudio,
};
