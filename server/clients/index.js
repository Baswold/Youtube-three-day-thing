const { OpenAI } = require('openai');
const { Anthropic } = require('@anthropic-ai/sdk');
const config = require('../config');

let openai = null;
let anthropic = null;

if (config.openaiApiKey) {
  openai = new OpenAI({ apiKey: config.openaiApiKey });
} else {
  console.warn('Warning: OPENAI_API_KEY is not set. OpenAI features will fail.');
}

if (config.anthropicApiKey) {
  anthropic = new Anthropic({ apiKey: config.anthropicApiKey });
} else {
  console.warn('Warning: ANTHROPIC_API_KEY is not set. Claude features will fail.');
}

module.exports = {
  openai,
  anthropic,
};
