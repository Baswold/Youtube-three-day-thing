import { HANDS_FREE_DEFAULTS, createHandsFreeState } from './handsFreeState.mjs';

const startBtn = document.getElementById('startSession');
const stopBtn = document.getElementById('stopSession');
const talkClaudeBtn = document.getElementById('talkClaude');
const talkGuestBtn = document.getElementById('talkGuest');
const timerEl = document.getElementById('timer');
const claudeStatusEl = document.getElementById('claudeStatus');
const guestStatusEl = document.getElementById('guestStatus');
const claudeActivityEl = document.getElementById('claudeActivity');
const guestActivityEl = document.getElementById('guestActivity');
const logContainer = document.getElementById('log');
const logTemplate = document.getElementById('logEntry');
const exportStatusEl = document.getElementById('exportStatus');

const sessionNameInput = document.getElementById('sessionName');
const systemStatusEl = document.getElementById('systemStatus');
const turnCountEl = document.getElementById('turnCount');
const transcriptEmptyEl = document.getElementById('transcriptEmpty');

const claudeCanvas = document.querySelector('#claudeWaveform .monitor-canvas');
const guestCanvas = document.querySelector('#guestWaveform .monitor-canvas');
const claudeCtx = claudeCanvas.getContext('2d');
const guestCtx = guestCanvas.getContext('2d');

let audioContext;
let mediaStream;
let activeSnippet = null;
let snippetSequence = 0;
let claudeDestination;
let guestDestination;
let claudeAnalyser;
let guestAnalyser;
let analyserAnimationId;
let sessionTimer;
let sessionStartTime;
let sessionId = null;
let activeTarget = null;
let talkState = 'idle';
let sessionActive = false;
let healthStatus = { openai: false, anthropic: false };
let turnCount = 0;

const HANDS_FREE_ENABLED = true;
const HANDS_FREE_SETTINGS = {
  ...HANDS_FREE_DEFAULTS,
  startThreshold: 0.02,
  stopThreshold: 0.008,
  minSpeechMs: 200,
  minSilenceMs: 220,
  minGapMs: 0,
};

let inputSource;
let inputAnalyser;
let inputDataArray;
let voiceMonitorId;
let autoSpeechStart = null;
let autoSilenceStart = null;
let autoRecordingActive = false;
let lastHandsFreeStop = 0;
const handsFreeState = createHandsFreeState();
const sendingTargets = new Set();
const inFlightSnippets = new Set();
let pendingManualStart = null;
const activePlaybackSources = new Set();

const generateSessionId = () =>
  (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2));

const formatter = new Intl.DateTimeFormat(undefined, {
  minute: '2-digit',
  second: '2-digit',
});

startBtn.addEventListener('click', startSession);
stopBtn.addEventListener('click', stopSession);
talkClaudeBtn.addEventListener('click', () => handleTalk('claude'));
talkGuestBtn.addEventListener('click', () => handleTalk('guest'));

refreshTalkButtons();
checkBrowserCompatibility();
checkHealth();

function checkBrowserCompatibility() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    exportStatusEl.textContent = '⚠️ Your browser does not support audio recording. Please use Chrome, Edge, or Firefox.';
    exportStatusEl.style.color = 'var(--danger)';
    startBtn.disabled = true;
    return false;
  }
  
  if (!window.MediaRecorder) {
    exportStatusEl.textContent = '⚠️ Your browser does not support MediaRecorder. Please use Chrome, Edge, or Firefox.';
    exportStatusEl.style.color = 'var(--danger)';
    startBtn.disabled = true;
    return false;
  }
  
  if (!window.AudioContext && !window.webkitAudioContext) {
    exportStatusEl.textContent = '⚠️ Your browser does not support Web Audio. Please use a modern browser.';
    exportStatusEl.style.color = 'var(--danger)';
    startBtn.disabled = true;
    return false;
  }
  
  return true;
}

async function checkHealth() {
  systemStatusEl.querySelector('.status-text').textContent = 'Checking...';
  systemStatusEl.classList.remove('healthy', 'error');

  try {
    const response = await fetch('/api/health');
    if (!response.ok) {
      throw new Error('Health check request failed');
    }

    const data = await response.json();
    healthStatus = { openai: Boolean(data.openai), anthropic: Boolean(data.anthropic) };
    handsFreeState.setHealth(healthStatus);

    const missing = [];
    if (!healthStatus.openai) missing.push('OpenAI');
    if (!healthStatus.anthropic) missing.push('Anthropic');

    if (missing.length > 0) {
      systemStatusEl.querySelector('.status-text').textContent = `Partial: missing ${missing.join(', ')}`;
      systemStatusEl.classList.add('error');
      exportStatusEl.textContent = `⚠️ Responses from ${missing.join(' & ')} are unavailable. You can still run the session with the remaining voices.`;
      exportStatusEl.style.color = 'var(--warning)';
      return { status: missing.length === 2 ? 'unavailable' : 'partial', missing };
    }

    systemStatusEl.querySelector('.status-text').textContent = 'Ready';
    systemStatusEl.classList.add('healthy');
    exportStatusEl.textContent = '';
    exportStatusEl.style.color = '';
    return { status: 'ready', missing: [] };
  } catch (err) {
    console.error('Health check failed', err);
    healthStatus = { openai: false, anthropic: false };
    handsFreeState.setHealth(healthStatus);
    systemStatusEl.querySelector('.status-text').textContent = 'Server offline';
    systemStatusEl.classList.add('error');
    exportStatusEl.textContent = '⚠️ Cannot reach server. You can still record freely, but AI replies may fail.';
    exportStatusEl.style.color = 'var(--danger)';
    return { status: 'error', missing: ['OpenAI', 'Anthropic'] };
  }
}

async function startSession() {
  if (sessionActive) return;

  startBtn.disabled = true;
  const health = await checkHealth();

  try {
    exportStatusEl.textContent = '';
    exportStatusEl.style.color = '';
    turnCount = 0;
    turnCountEl.textContent = '0 turns';
    logContainer.innerHTML = '';
    if (transcriptEmptyEl) {
      transcriptEmptyEl.style.display = 'flex';
    }

    audioContext = audioContext || new AudioContext({ latencyHint: 'interactive' });
    await audioContext.resume();

    mediaStream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: false } });

    setupAnalysers();
    setupAudioDestinations();
    startAnalysers();
    resetAutoTargetOrder();
    setupHandsFreeInput();

    sessionStartTime = Date.now();
    sessionTimer = setInterval(updateTimer, 500);
    timerEl.textContent = '00:00';
    
    // Generate new session ID and reset server-side session
    sessionId = generateSessionId();
    await fetch('/api/session/reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId }),
    }).catch(err => console.warn('Session reset failed', err));
    
    activeTarget = null;
    talkState = 'idle';
    activeSnippet = null;
    pendingManualStart = null;
    sendingTargets.clear();
    inFlightSnippets.clear();

    sessionActive = true;
    stopBtn.disabled = false;
    refreshTalkButtons();
    setTargetStatus('claude', 'Idle', false);
    setTargetStatus('guest', 'Idle', false);

    if (health.status === 'partial') {
      exportStatusEl.textContent = '🎙️ Hands-free is live. Some voices are offline, but everyone else can speak freely.';
      exportStatusEl.style.color = 'var(--warning)';
    } else if (health.status === 'error' || health.status === 'unavailable') {
      exportStatusEl.textContent = '⚠️ Starting in free-talk mode. AI responses may fail until the server reconnects.';
      exportStatusEl.style.color = 'var(--danger)';
    } else {
      exportStatusEl.textContent = '🎥 Ready! Start your screen recording software now. 🎙️ Hands-free mode is active—just start speaking when you are ready.';
      exportStatusEl.style.color = 'var(--success)';
    }
  } catch (err) {
    console.error('Failed to start session', err);
    exportStatusEl.textContent = '⚠️ Could not access microphone. Check permissions.';
    exportStatusEl.style.color = 'var(--danger)';
    startBtn.disabled = false;
  }
}

function stopSession() {
  if (!sessionActive) return;

  stopBtn.disabled = true;
  talkClaudeBtn.disabled = true;
  talkGuestBtn.disabled = true;

  teardownHandsFreeInput();

  if (sessionTimer) {
    clearInterval(sessionTimer);
    sessionTimer = null;
  }

  if (activeSnippet?.recorder && activeSnippet.recorder.state !== 'inactive') {
    try {
      activeSnippet.recorder.stop();
    } catch (err) {
      console.warn('Failed to stop recorder during teardown', err);
    }
  }

  if (mediaStream) {
    mediaStream.getTracks().forEach((track) => track.stop());
    mediaStream = null;
  }

  if (analyserAnimationId) {
    cancelAnimationFrame(analyserAnimationId);
    analyserAnimationId = null;
  }

  sessionActive = false;
  sessionId = null;
  activeTarget = null;
  talkState = 'idle';
  activeSnippet = null;
  pendingManualStart = null;
  sendingTargets.clear();
  inFlightSnippets.clear();
  stopActivePlayback();
  handsFreeState.resetOrder();
  refreshTalkButtons();
  setTargetStatus('claude', 'Idle', false);
  setTargetStatus('guest', 'Idle', false);
  startBtn.disabled = false;
}

function setupAudioDestinations() {
  if (!audioContext) return;

  // Create destinations for routing AI audio to system output
  claudeDestination = audioContext.createMediaStreamDestination();
  guestDestination = audioContext.createMediaStreamDestination();
}

function setupAnalysers() {
  if (!audioContext) return;

  claudeAnalyser = audioContext.createAnalyser();
  claudeAnalyser.fftSize = 2048;

  guestAnalyser = audioContext.createAnalyser();
  guestAnalyser.fftSize = 2048;
}

function startAnalysers() {
  const claudeData = new Uint8Array(claudeAnalyser.frequencyBinCount);
  const guestData = new Uint8Array(guestAnalyser.frequencyBinCount);

  const draw = () => {
    analyserAnimationId = requestAnimationFrame(draw);

    if (claudeAnalyser && claudeData) {
      drawAnalyserWave(claudeAnalyser, claudeData, claudeCtx, claudeCanvas);
    }
    if (guestAnalyser && guestData) {
      drawAnalyserWave(guestAnalyser, guestData, guestCtx, guestCanvas);
    }
  };

  draw();
}

function drawAnalyserWave(analyser, dataArray, ctx, canvas) {
  if (!analyser || !dataArray) return;
  analyser.getByteFrequencyData(dataArray);
  
  // Calculate audio level for reactive animation
  let sum = 0;
  for (let i = 0; i < dataArray.length; i++) {
    sum += dataArray[i];
  }
  const average = sum / dataArray.length;
  const normalizedLevel = average / 255;
  
  // Clear canvas
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  
  // Orb settings based on speaker
  let colors;
  if (canvas === claudeCanvas) {
    colors = {
      inner: ['#8b5cf6', '#a78bfa', '#c4b5fd'],
      outer: ['rgba(139, 92, 246, 0.4)', 'rgba(167, 139, 250, 0.2)', 'rgba(196, 181, 253, 0.1)']
    };
  } else {
    colors = {
      inner: ['#ec4899', '#f472b6', '#f9a8d4'],
      outer: ['rgba(236, 72, 153, 0.4)', 'rgba(244, 114, 182, 0.2)', 'rgba(249, 168, 212, 0.1)']
    };
  }
  
  drawFluidOrb(ctx, canvas, normalizedLevel, colors);
}

function drawFluidOrb(ctx, canvas, normalizedLevel, colors) {
  const centerX = canvas.width / 2;
  const centerY = canvas.height / 2;
  const time = Date.now() / 1000;
  
  // Base orb size (responsive to audio)
  const baseRadius = Math.min(canvas.width, canvas.height) * 0.35;
  const pulseAmount = normalizedLevel * 8;
  const radius = baseRadius + pulseAmount;
  
  // Create multiple layered gradients for depth
  ctx.globalCompositeOperation = 'lighter';
  
  // Outer glow layers
  for (let i = 3; i >= 1; i--) {
    const glowRadius = radius * (1 + i * 0.15);
    const gradient = ctx.createRadialGradient(
      centerX, centerY, radius * 0.1,
      centerX, centerY, glowRadius
    );
    
    gradient.addColorStop(0, colors.outer[0]);
    gradient.addColorStop(0.4, colors.outer[1]);
    gradient.addColorStop(0.8, colors.outer[2]);
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
    
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(centerX, centerY, glowRadius, 0, Math.PI * 2);
    ctx.fill();
  }
  
  // Main orb with animated gradient
  const angle = time * 0.5 + normalizedLevel * Math.PI;
  const offsetX = Math.cos(angle) * radius * 0.3;
  const offsetY = Math.sin(angle) * radius * 0.3;
  
  const mainGradient = ctx.createRadialGradient(
    centerX + offsetX, centerY + offsetY, 0,
    centerX, centerY, radius
  );
  
  mainGradient.addColorStop(0, colors.inner[2]);
  mainGradient.addColorStop(0.3, colors.inner[1]);
  mainGradient.addColorStop(0.6, colors.inner[0]);
  mainGradient.addColorStop(1, colors.outer[0]);
  
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = mainGradient;
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
  ctx.fill();
  
  // Inner highlight (moving light source)
  const highlightAngle = time * 0.8;
  const highlightX = centerX + Math.cos(highlightAngle) * radius * 0.2;
  const highlightY = centerY + Math.sin(highlightAngle) * radius * 0.2;
  
  const highlightGradient = ctx.createRadialGradient(
    highlightX, highlightY, 0,
    highlightX, highlightY, radius * 0.6
  );
  
  highlightGradient.addColorStop(0, 'rgba(255, 255, 255, 0.4)');
  highlightGradient.addColorStop(0.5, 'rgba(255, 255, 255, 0.1)');
  highlightGradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
  
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = highlightGradient;
  ctx.beginPath();
  ctx.arc(highlightX, highlightY, radius * 0.6, 0, Math.PI * 2);
  ctx.fill();
  
  // Add subtle particles for more fluid feel
  if (normalizedLevel > 0.1) {
    ctx.globalCompositeOperation = 'lighter';
    const particleCount = Math.floor(normalizedLevel * 20);
    
    for (let i = 0; i < particleCount; i++) {
      const particleAngle = (time * 2 + i) % (Math.PI * 2);
      const distance = radius * (0.5 + Math.random() * 0.5);
      const px = centerX + Math.cos(particleAngle) * distance;
      const py = centerY + Math.sin(particleAngle) * distance;
      const particleSize = (1 + normalizedLevel * 2) * (0.5 + Math.random());
      
      const particleGradient = ctx.createRadialGradient(px, py, 0, px, py, particleSize * 3);
      particleGradient.addColorStop(0, colors.inner[1]);
      particleGradient.addColorStop(0.5, colors.outer[1]);
      particleGradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
      
      ctx.fillStyle = particleGradient;
      ctx.beginPath();
      ctx.arc(px, py, particleSize * 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  
  ctx.globalCompositeOperation = 'source-over';
}

function updateTimer() {
  if (!sessionStartTime) return;
  const elapsed = Date.now() - sessionStartTime;
  const minutes = Math.floor(elapsed / 60000);
  const seconds = Math.floor((elapsed % 60000) / 1000);
  timerEl.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

const TARGET_CONFIG = {
  claude: {
    endpoint: '/api/claude',
    statusEl: claudeStatusEl,
    label: 'Claude',
  },
  guest: {
    endpoint: '/api/guest',
    statusEl: guestStatusEl,
    label: 'Guest AI',
  },
};

function setTalkButtonState(target, state) {
  const button = target === 'claude' ? talkClaudeBtn : talkGuestBtn;
  button.classList.remove('state-idle', 'state-recording', 'state-sending');
  button.classList.add(`state-${state}`);
}

function updateTurnCount() {
  turnCount += 1;
  turnCountEl.textContent = `${turnCount} turn${turnCount === 1 ? '' : 's'}`;
  if (transcriptEmptyEl && turnCount > 0) {
    transcriptEmptyEl.style.display = 'none';
  }
}

function refreshTalkButtons() {
  ['claude', 'guest'].forEach((target) => {
    const button = target === 'claude' ? talkClaudeBtn : talkGuestBtn;
    const isRecording = activeSnippet && activeSnippet.target === target;
    const isSending = sendingTargets.has(target);
    const state = isRecording ? 'recording' : isSending ? 'sending' : 'idle';
    button.classList.remove('state-idle', 'state-recording', 'state-sending');
    button.classList.add(`state-${state}`);
    const disable =
      !sessionActive ||
      (activeSnippet && activeSnippet.target !== target && activeSnippet.recorder?.state === 'recording');
    button.disabled = disable;
    button.setAttribute('aria-disabled', disable ? 'true' : 'false');
    button.classList.toggle('hands-free-mode', HANDS_FREE_ENABLED);
  });
}

function appendLogEntry(speaker, text) {
  const fragment = logTemplate.content.cloneNode(true);
  
  // Set avatar emoji based on speaker
  const avatar = fragment.querySelector('.log-avatar');
  if (speaker.includes('Basil')) {
    avatar.textContent = '🎤';
    avatar.style.background = 'linear-gradient(135deg, #6366f1, #818cf8)';
  } else if (speaker.includes('Claude')) {
    avatar.textContent = '🤖';
    avatar.style.background = 'linear-gradient(135deg, #8b5cf6, #a78bfa)';
  } else if (speaker.includes('Guest')) {
    avatar.textContent = '💬';
    avatar.style.background = 'linear-gradient(135deg, #ec4899, #f472b6)';
  }
  
  // Set speaker name and timestamp
  fragment.querySelector('.log-speaker').textContent = speaker;
  const now = new Date();
  const timestamp = now.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  fragment.querySelector('.log-timestamp').textContent = timestamp;
  
  // Set text
  fragment.querySelector('.log-text').textContent = text;
  
  logContainer.appendChild(fragment);
  logContainer.scrollTop = logContainer.scrollHeight;
  
  // Update turn count only for non-transcribed entries
  if (!speaker.includes('transcribed')) {
    updateTurnCount();
  }
}

function setTargetStatus(target, text, accent = false) {
  const { statusEl } = TARGET_CONFIG[target];
  if (!statusEl) return;
  statusEl.textContent = text;
  statusEl.style.background = accent
    ? 'rgba(94, 122, 255, 0.25)'
    : 'rgba(255, 255, 255, 0.08)';
  const activityEl = target === 'claude' ? claudeActivityEl : guestActivityEl;
  if (activityEl) {
    activityEl.textContent = text;
  }
}

function handleTalk(target) {
  if (!sessionActive) return;

  if (activeSnippet && activeSnippet.target === target) {
    if (activeSnippet.recorder?.state === 'recording') {
      stopSnippetRecording();
    }
    return;
  }

  if (activeSnippet && activeSnippet.recorder?.state === 'recording') {
    pendingManualStart = target;
    stopSnippetRecording();
    return;
  }

  startSnippetRecording(target);
}

function startSnippetRecording(target) {
  if (!mediaStream) return;

  stopActivePlayback();

  const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
    ? 'audio/webm;codecs=opus'
    : undefined;

  const recorder = new MediaRecorder(mediaStream, mimeType ? { mimeType } : undefined);
  const snippetId = ++snippetSequence;
  const snippet = {
    id: snippetId,
    target,
    recorder,
    chunks: [],
    mimeType: recorder.mimeType || mimeType || 'audio/webm',
  };

  activeSnippet = snippet;
  activeTarget = target;
  talkState = 'recording';
  pendingManualStart = null;
  const alternateTarget = target === 'claude' ? 'guest' : 'claude';
  handsFreeState.setNextAutoTarget(alternateTarget);

  recorder.ondataavailable = (event) => {
    if (event.data && event.data.size > 0) {
      snippet.chunks.push(event.data);
    }
  };

  recorder.onstop = () => {
    const payload = {
      id: snippet.id,
      target: snippet.target,
      mimeType: snippet.mimeType,
      chunks: snippet.chunks.slice(),
    };

    autoRecordingActive = false;
    autoSilenceStart = null;
    sendingTargets.add(snippet.target);
    inFlightSnippets.add(snippet.id);

    if (activeSnippet && activeSnippet.id === snippet.id) {
      activeSnippet = null;
    }

    talkState = activeSnippet ? 'recording' : 'sending';
    setTalkButtonState(snippet.target, 'sending');
    refreshTalkButtons();
    setTargetStatus(snippet.target, 'Processing…', true);

    sendSnippet(payload);

    if (pendingManualStart) {
      const nextTarget = pendingManualStart;
      pendingManualStart = null;
      startSnippetRecording(nextTarget);
    }
  };

  recorder.start();
  setTalkButtonState(target, 'recording');
  refreshTalkButtons();
  setTargetStatus(target, 'Listening…', true);
}

function stopSnippetRecording() {
  if (activeSnippet?.recorder && activeSnippet.recorder.state !== 'inactive') {
    try {
      activeSnippet.recorder.stop();
    } catch (err) {
      console.warn('Failed to stop snippet recorder', err);
    }
  }
  autoRecordingActive = false;
  autoSilenceStart = null;
}

async function sendSnippet(snippet) {
  const { target, chunks, mimeType, id } = snippet;
  const config = TARGET_CONFIG[target];
  if (!config) {
    console.error('Unknown conversation target', target);
    finalizeSnippet(id, target);
    return;
  }

  try {
    const snippetBlob = new Blob(chunks, { type: mimeType || 'audio/webm' });
    appendLogEntry('Basil', `[Audio clip sent to ${config.label}]`);

    if (!sessionId) {
      sessionId = generateSessionId();
    }

    const formData = new FormData();
    formData.append('audio', snippetBlob, 'basil-query.webm');
    formData.append('sessionId', sessionId);

    const response = await fetch(config.endpoint, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unknown server error' }));
      throw new Error(error.error || error.details || 'AI request failed');
    }

    const payload = await response.json();
    if (payload.sessionId) {
      sessionId = payload.sessionId;
    }

    if (payload.transcript) {
      appendLogEntry('Basil (transcribed)', payload.transcript);
    }

    const responseKey = target === 'claude' ? 'claudeText' : 'guestText';
    const aiText = payload[responseKey];
    if (aiText) {
      appendLogEntry(config.label, aiText);
    }

    await playAiAudio(payload.audio, target, payload.mimeType);
    setTargetStatus(target, 'Responded', false);
  } catch (err) {
    console.error('Failed to reach AI target', err);
    exportStatusEl.textContent = `${config.label} error: ${err.message}`;
    setTargetStatus(target, 'Error', false);
  } finally {
    finalizeSnippet(id, target);
  }
}

function finalizeSnippet(id, target) {
  inFlightSnippets.delete(id);
  sendingTargets.delete(target);

  if (!activeSnippet && inFlightSnippets.size === 0) {
    talkState = 'idle';
    activeTarget = null;
  } else if (!activeSnippet && activeTarget === target && !sendingTargets.has(target)) {
    activeTarget = null;
  }

  refreshTalkButtons();
}

function stopActivePlayback() {
  if (activePlaybackSources.size === 0) return;
  const handles = Array.from(activePlaybackSources);
  activePlaybackSources.clear();
  handles.forEach(({ source, gainNode }) => {
    try {
      source.stop(0);
    } catch (err) {
      console.warn('Failed to stop playback source', err);
    }
    try {
      gainNode.disconnect();
    } catch (err) {
      console.warn('Failed to disconnect playback gain node', err);
    }
  });
}

function resetAutoTargetOrder() {
  if (!HANDS_FREE_ENABLED) return;
  handsFreeState.resetOrder();
  lastHandsFreeStop = performance.now();
}

function setupHandsFreeInput() {
  if (!HANDS_FREE_ENABLED) return;
  if (!audioContext || !mediaStream) return;

  teardownHandsFreeInput();

  try {
    inputSource = audioContext.createMediaStreamSource(mediaStream);
    inputAnalyser = audioContext.createAnalyser();
    inputAnalyser.fftSize = 2048;
    inputSource.connect(inputAnalyser);
    inputDataArray = new Float32Array(inputAnalyser.fftSize);
  } catch (err) {
    console.error('Failed to initialise hands-free input monitoring', err);
    inputSource = null;
    inputAnalyser = null;
    inputDataArray = null;
    return;
  }

  autoSpeechStart = null;
  autoSilenceStart = null;
  autoRecordingActive = false;
  lastHandsFreeStop = performance.now();
  monitorHandsFreeInput();
}

function teardownHandsFreeInput() {
  if (!HANDS_FREE_ENABLED) return;
  if (voiceMonitorId) {
    cancelAnimationFrame(voiceMonitorId);
    voiceMonitorId = null;
  }
  if (inputSource) {
    try {
      inputSource.disconnect();
    } catch (err) {
      console.warn('Failed to disconnect hands-free source', err);
    }
    inputSource = null;
  }
  inputAnalyser = null;
  inputDataArray = null;
  autoSpeechStart = null;
  autoSilenceStart = null;
  autoRecordingActive = false;
}

function monitorHandsFreeInput() {
  if (!HANDS_FREE_ENABLED) return;

  if (!inputAnalyser || !inputDataArray) {
    voiceMonitorId = requestAnimationFrame(monitorHandsFreeInput);
    return;
  }

  inputAnalyser.getFloatTimeDomainData(inputDataArray);

  let sumSquares = 0;
  for (let i = 0; i < inputDataArray.length; i += 1) {
    const sample = inputDataArray[i];
    sumSquares += sample * sample;
  }
  const rms = Math.sqrt(sumSquares / inputDataArray.length);
  const now = performance.now();

  if (!autoRecordingActive) {
    const snippetBusy = Boolean(activeSnippet);
    if (
      sessionActive &&
      !snippetBusy &&
      now - lastHandsFreeStop >= HANDS_FREE_SETTINGS.minGapMs
    ) {
      if (rms > HANDS_FREE_SETTINGS.startThreshold) {
        if (!autoSpeechStart) {
          autoSpeechStart = now;
        } else if (now - autoSpeechStart >= HANDS_FREE_SETTINGS.minSpeechMs) {
          const target = determineHandsFreeTarget();
          if (target) {
            try {
              startSnippetRecording(target);
              autoRecordingActive = true;
              autoSilenceStart = null;
            } catch (err) {
              console.error('Hands-free start failed', err);
              autoRecordingActive = false;
              lastHandsFreeStop = now;
            }
          }
          autoSpeechStart = null;
        }
      } else {
        autoSpeechStart = null;
      }
    } else {
      autoSpeechStart = null;
    }
  } else {
    if (rms < HANDS_FREE_SETTINGS.stopThreshold) {
      if (!autoSilenceStart) {
        autoSilenceStart = now;
      } else if (now - autoSilenceStart >= HANDS_FREE_SETTINGS.minSilenceMs) {
        autoRecordingActive = false;
        autoSilenceStart = null;
        lastHandsFreeStop = now;
        stopSnippetRecording();
      }
    } else {
      autoSilenceStart = null;
    }
  }

  voiceMonitorId = requestAnimationFrame(monitorHandsFreeInput);
}

function determineHandsFreeTarget() {
  if (!HANDS_FREE_ENABLED) return null;

  return handsFreeState.chooseNextTarget();
}

async function playAiAudio(base64, target, mimeType = 'audio/wav') {
  if (!audioContext) return;
  if (!base64) return;

  stopActivePlayback();

  const binary = atob(base64);
  const len = binary.length;
  const buffer = new Uint8Array(len);
  for (let i = 0; i < len; i += 1) {
    buffer[i] = binary.charCodeAt(i);
  }

  const audioBuffer = await audioContext.decodeAudioData(buffer.buffer.slice(0));
  const source = audioContext.createBufferSource();
  source.buffer = audioBuffer;

  const gainNode = audioContext.createGain();
  gainNode.gain.value = 1.0;
  source.connect(gainNode);

  const analyser = target === 'claude' ? claudeAnalyser : guestAnalyser;
  const destination = target === 'claude' ? claudeDestination : guestDestination;

  if (analyser) {
    gainNode.connect(analyser);
  }
  if (destination) {
    gainNode.connect(destination);
  }

  gainNode.connect(audioContext.destination);

  // Cleanup after playback
  const playbackHandle = { source, gainNode };
  activePlaybackSources.add(playbackHandle);
  source.onended = () => {
    try {
      gainNode.disconnect();
    } catch (err) {
      console.warn('Failed to disconnect playback gain node', err);
    }
    activePlaybackSources.delete(playbackHandle);
  };

  source.start();
}

window.addEventListener('beforeunload', () => {
  if (audioContext) {
    audioContext.close();
  }
});
