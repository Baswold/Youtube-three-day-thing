// Simple in-memory rate limiter
const HttpError = require('../utils/httpError');
const config = require('../config');

const clients = new Map();
const WINDOW_MS = config.rateLimit.windowMs;
const MAX_REQUESTS = config.rateLimit.maxRequests;

function cleanup() {
  const now = Date.now();
  for (const [ip, data] of clients.entries()) {
    if (now - data.windowStart > WINDOW_MS * 2) {
      clients.delete(ip);
    }
  }
}

function rateLimit(req, res, next) {
  const ip = req.ip || req.connection?.remoteAddress || 'unknown';
  const now = Date.now();

  cleanup();

  if (!clients.has(ip)) {
    clients.set(ip, {
      count: 1,
      windowStart: now,
    });
    return next();
  }

  const client = clients.get(ip);

  // Reset window if expired
  if (now - client.windowStart >= WINDOW_MS) {
    client.count = 1;
    client.windowStart = now;
    return next();
  }

  // Increment count
  client.count += 1;

  // Check limit
  if (client.count > MAX_REQUESTS) {
    const retryAfterSeconds = Math.max(1, Math.ceil((WINDOW_MS - (now - client.windowStart)) / 1000));
    res.setHeader('Retry-After', retryAfterSeconds);
    throw new HttpError(429, 'Too many requests. Please slow down.', {
      limit: MAX_REQUESTS,
      windowMs: WINDOW_MS,
      retryAfter: retryAfterSeconds,
    });
  }

  next();
}

module.exports = rateLimit;
