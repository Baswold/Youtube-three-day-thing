const HttpError = require('../utils/httpError');
const config = require('../config');
const { openai } = require('../clients');
const { buildGuestContext } = require('./context');

async function guestRespond(history, { persona } = {}) {
  if (!openai) {
    throw new HttpError(500, 'Guest AI unavailable: OpenAI client not configured');
  }

  const { markup, latestHuman, latestClaude } = buildGuestContext(history);

  if (!latestHuman) {
    throw new HttpError(400, 'Guest AI requires a human utterance to respond to');
  }

  const system =
    persona ||
    'You are a guest expert AI defending a claim Basil is fact-checking. Be articulate, provide evidence, and keep the tone professional yet conversational.';

  const roleContext = '<context>Basil (<human>) is the on-camera host. Claude (<co-host>) provides analysis. You (<guest>) advocate for the claim under review.</context>';
  const latestHumanBlock = `<latest-human>${latestHuman.text}</latest-human>`;
  const cohostBlock = latestClaude ? `<latest-co-host>${latestClaude.text}</latest-co-host>` : '';
  const conversationText =
    `<conversation>\n${markup}\n</conversation>\n` +
    `${roleContext}\n${latestHumanBlock}\n${cohostBlock}` +
    '<instruction>Reply as <guest> to the most recent <human> message. Address any points raised by <co-host> when relevant.</instruction>';

  const completion = await openai.chat.completions.create({
    model: config.models.guest,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: conversationText },
    ],
    max_tokens: 400,
    temperature: 0.7,
  });

  const text = completion.choices?.[0]?.message?.content?.trim();

  if (!text) {
    throw new HttpError(502, 'Guest AI reply came back empty');
  }

  return text;
}

module.exports = {
  guestRespond,
};
