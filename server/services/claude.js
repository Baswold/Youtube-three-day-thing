const HttpError = require('../utils/httpError');
const config = require('../config');
const { anthropic } = require('../clients');
const { buildClaudeContext } = require('./context');

async function claudeRespond(history, { systemPrompt } = {}) {
  if (!anthropic) {
    throw new HttpError(500, 'Claude unavailable: Anthropic client not configured');
  }

  const { markup, latestHuman, latestGuest } = buildClaudeContext(history);

  if (!latestHuman) {
    throw new HttpError(400, 'Claude requires a human utterance to respond to');
  }

  const prompt =
    systemPrompt ||
    "You are Claude, Basil's AI co-host on a fact-checking show. Be succinct, insightful, and conversational. Use first-person voice and speak as if on camera.";

  const roleContext = '<context>Basil (<human>) is the on-camera host. Claude (<co-host>) is the resident analyst. Guest AI (<guest>) defends the claim under review.</context>';
  const latestHumanBlock = `<latest-human>${latestHuman.text}</latest-human>`;
  const guestBlock = latestGuest ? `<latest-guest>${latestGuest.text}</latest-guest>` : '';
  const conversationText =
    `<conversation>\n${markup}\n</conversation>\n` +
    `${roleContext}\n${latestHumanBlock}\n${guestBlock}` +
    '<instruction>Reply as <co-host> to the most recent <human> message. Reference evidence or prior points when helpful.</instruction>';

  const message = await anthropic.messages.create({
    model: config.models.claude,
    max_tokens: 400,
    temperature: 0.7,
    system: prompt,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: conversationText,
          },
        ],
      },
    ],
  });

  const text = message.content
    .filter((item) => item.type === 'text')
    .map((item) => item.text)
    .join('\n')
    .trim();

  if (!text) {
    throw new HttpError(502, 'Claude reply came back empty');
  }

  return text;
}

module.exports = {
  claudeRespond,
};
