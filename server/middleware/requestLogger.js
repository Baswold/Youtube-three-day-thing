const { randomUUID } = require('crypto');
const sessionStore = require('../utils/sessionStore');

function generateRequestId() {
  if (typeof randomUUID === 'function') {
    return randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function formatDurationMs(hrtimeDiff) {
  const [seconds, nanoseconds] = hrtimeDiff;
  return Math.round((seconds * 1e9 + nanoseconds) / 1e6);
}

function requestLogger(req, res, next) {
  const startHrTime = process.hrtime();
  const requestId = generateRequestId();
  req.id = requestId;
  res.setHeader('X-Request-Id', requestId);

  const sourceIp = req.ip || req.connection?.remoteAddress || 'unknown';
  console.log(`--> [${requestId}] ${req.method} ${req.originalUrl} from ${sourceIp}`);

  res.on('finish', () => {
    const durationMs = formatDurationMs(process.hrtime(startHrTime));
    const activeSessions = sessionStore.getActiveSessionCount ? sessionStore.getActiveSessionCount() : 'n/a';
    console.log(`<-- [${requestId}] ${res.statusCode} ${req.method} ${req.originalUrl} (${durationMs}ms) | sessions=${activeSessions}`);
  });

  next();
}

module.exports = requestLogger;
