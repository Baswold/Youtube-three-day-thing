const express = require('express');
const multer = require('multer');
const path = require('path');
const config = require('./config');
const HttpError = require('./utils/httpError');
const sessionStore = require('./utils/sessionStore');
const runClaudeTurn = require('./pipelines/claudeTurn');
const runGuestTurn = require('./pipelines/guestTurn');
const { openai, anthropic } = require('./clients');
const rateLimit = require('./middleware/rateLimit');
const securityHeaders = require('./middleware/security');
const requestLogger = require('./middleware/requestLogger');

const app = express();
const upload = multer({ 
  storage: multer.memoryStorage(), 
  limits: { 
    fileSize: 25 * 1024 * 1024,
    files: 1,
    parts: 5,
  } 
});

const AUDIO_MIME_WHITELIST = new Set([
  'audio/webm',
  'audio/wav',
  'audio/mpeg',
  'audio/mp4',
  'audio/ogg',
  'audio/x-m4a',
]);

app.disable('x-powered-by');
app.use(securityHeaders);
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));

// Apply request logging and rate limiting to API routes
app.use('/api/', requestLogger);
app.use('/api/', rateLimit);

function assertAudioPayload(req) {
  if (!req.file) {
    throw new HttpError(400, 'Audio file is required');
  }

  const { mimetype, buffer } = req.file;
  if (!buffer || buffer.length === 0) {
    throw new HttpError(400, 'Audio file is empty');
  }

  const baseMime = (mimetype || '').split(';')[0];
  if (!AUDIO_MIME_WHITELIST.has(baseMime)) {
    throw new HttpError(415, `Unsupported audio type: ${baseMime || 'unknown'}`, {
      supportedTypes: Array.from(AUDIO_MIME_WHITELIST),
    });
  }

  return baseMime;
}

function getSessionId(req) {
  const raw = req.body?.sessionId || req.headers['x-session-id'] || 'default';
  return String(raw);
}

function shouldResetSession(req) {
  const flag = req.body?.resetSession ?? req.headers['x-reset-session'];
  return flag === true || flag === 'true' || flag === '1';
}

app.post('/api/claude', upload.single('audio'), async (req, res, next) => {
  try {
    const audioMimeType = assertAudioPayload(req);
    if (!openai || !anthropic) {
      throw new HttpError(500, 'Server missing Claude dependencies');
    }

    const sessionId = getSessionId(req);
    if (shouldResetSession(req)) {
      sessionStore.clearSession(sessionId);
    }

    const { transcript, claudeText, audioBuffer } = await runClaudeTurn({
      sessionId,
      buffer: req.file.buffer,
      mimetype: audioMimeType,
    });
    res.json({
      sessionId,
      transcript,
      claudeText,
      audio: audioBuffer.toString('base64'),
      mimeType: 'audio/wav',
    });
  } catch (err) {
    next(err);
  }
});

app.post('/api/guest', upload.single('audio'), async (req, res, next) => {
  try {
    const audioMimeType = assertAudioPayload(req);
    if (!openai) {
      throw new HttpError(500, 'Server missing Guest AI dependencies');
    }

    const sessionId = getSessionId(req);
    if (shouldResetSession(req)) {
      sessionStore.clearSession(sessionId);
    }

    const { transcript, guestText, audioBuffer } = await runGuestTurn({
      sessionId,
      buffer: req.file.buffer,
      mimetype: audioMimeType,
    });
    res.json({
      sessionId,
      transcript,
      guestText,
      audio: audioBuffer.toString('base64'),
      mimeType: 'audio/wav',
    });
  } catch (err) {
    next(err);
  }
});

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    openai: Boolean(openai),
    anthropic: Boolean(anthropic),
  });
});

app.post('/api/session/reset', (req, res) => {
  const sessionId = getSessionId(req);
  sessionStore.clearSession(sessionId);
  res.json({ sessionId, reset: true });
});

app.use('/api/*', (req, res, next) => {
  res.status(404).json({ error: 'API endpoint not found', path: req.path, requestId: req.id || undefined });
});

app.use((err, req, res, _next) => {
  if (err instanceof multer.MulterError) {
    const status = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
    const message = err.code === 'LIMIT_FILE_SIZE'
      ? 'Audio upload exceeds the 25MB limit.'
      : `Upload failed: ${err.message}`;
    console.warn(`[UploadError] [${req.id || 'n/a'}]`, { code: err.code, message });
    return res.status(status).json({ error: message, details: { code: err.code } });
  }

  const status = err instanceof HttpError ? err.status : err.statusCode || err.status || 500;
  const message = err.message || 'Internal Server Error';
  const details = err.details || undefined;
  const requestId = req.id || 'n/a';

  console.error(`[ApiError] [${requestId}]`, { status, message, details });
  res.status(status).json({ error: message, details, requestId });
});

app.use((req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

app.listen(config.port, () => {
  console.log(`Three-Way AI Director server listening on http://localhost:${config.port}`);
});
