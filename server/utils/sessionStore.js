const config = require('../config');

const sessions = new Map();

const SESSION_TTL_MS = config.session.ttlMs;
const MAX_HISTORY_LENGTH = config.session.maxHistory;
const MAX_SESSIONS = config.session.maxSessions;

function normalizeId(sessionId) {
  return sessionId ? String(sessionId) : 'default';
}

function cleanupStale() {
  const now = Date.now();
  const stale = [];

  for (const [id, session] of sessions.entries()) {
    if (now - session.updatedAt > SESSION_TTL_MS) {
      stale.push(id);
    }
  }

  stale.forEach((id) => sessions.delete(id));

  if (stale.length > 0) {
    console.log(`[SessionStore] Cleaned up ${stale.length} stale session(s)`);
  }

  // If still over limit, remove oldest sessions
  if (sessions.size > MAX_SESSIONS) {
    const sorted = Array.from(sessions.entries()).sort((a, b) => a[1].updatedAt - b[1].updatedAt);
    const toRemove = sorted.slice(0, sessions.size - MAX_SESSIONS);
    toRemove.forEach(([id]) => sessions.delete(id));
    console.log(`[SessionStore] Evicted ${toRemove.length} oldest session(s) (over limit)`);
  }
}

function ensureSession(sessionId) {
  cleanupStale();

  const id = normalizeId(sessionId);
  if (!sessions.has(id)) {
    sessions.set(id, {
      id,
      history: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  }
  const session = sessions.get(id);
  session.updatedAt = Date.now();
  return session;
}

function appendEntry(sessionId, speaker, text) {
  const session = ensureSession(sessionId);
  const normalized = typeof text === 'string' ? text.trim() : String(text);
  session.history.push({
    speaker,
    text: normalized,
    timestamp: Date.now(),
  });

  // Enforce max history length
  if (session.history.length > MAX_HISTORY_LENGTH) {
    const removed = session.history.length - MAX_HISTORY_LENGTH;
    session.history = session.history.slice(-MAX_HISTORY_LENGTH);
    console.log(`[SessionStore] Trimmed ${removed} old entries from session ${session.id}`);
  }

  session.updatedAt = Date.now();
  return session;
}

function getHistory(sessionId) {
  return ensureSession(sessionId).history;
}

function clearSession(sessionId) {
  sessions.delete(normalizeId(sessionId));
}

function getActiveSessionCount() {
  return sessions.size;
}

module.exports = {
  ensureSession,
  appendEntry,
  getHistory,
  clearSession,
  getActiveSessionCount,
};
