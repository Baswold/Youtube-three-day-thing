const TAGS = {
  human: ['<human>', '</human>'],
  claude: ['<co-host>', '</co-host>'],
  guest: ['<guest>', '</guest>'],
};

function wrapWithTag(speaker, text) {
  const [open, close] = TAGS[speaker] || ['<unknown>', '</unknown>'];
  return `${open}${text}${close}`;
}

function formatHistory(history) {
  return history
    .map(({ speaker, text }) => wrapWithTag(speaker, text))
    .join('\n');
}

function findLatest(history, speaker) {
  for (let i = history.length - 1; i >= 0; i -= 1) {
    if (history[i].speaker === speaker) {
      return history[i];
    }
  }
  return undefined;
}

function buildClaudeContext(history) {
  return {
    markup: formatHistory(history),
    latestHuman: findLatest(history, 'human'),
    latestGuest: findLatest(history, 'guest'),
  };
}

function buildGuestContext(history) {
  return {
    markup: formatHistory(history),
    latestHuman: findLatest(history, 'human'),
    latestClaude: findLatest(history, 'claude'),
  };
}

module.exports = {
  buildClaudeContext,
  buildGuestContext,
};
