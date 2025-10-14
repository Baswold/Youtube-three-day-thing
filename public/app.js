const startBtn = document.getElementById('startSession');
const stopBtn = document.getElementById('stopSession');
const talkClaudeBtn = document.getElementById('talkClaude');
const talkGuestBtn = document.getElementById('talkGuest');
const timerEl = document.getElementById('timer');
const claudeStatusEl = document.getElementById('claudeStatus');
const guestStatusEl = document.getElementById('guestStatus');
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
let snippetRecorder;
let snippetChunks = [];
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
    if (response.ok) {
      const data = await response.json();
      healthStatus = { openai: data.openai, anthropic: data.anthropic };
      
      if (!healthStatus.openai || !healthStatus.anthropic) {
        const missing = [];
        if (!healthStatus.openai) missing.push('OpenAI');
        if (!healthStatus.anthropic) missing.push('Anthropic');
        systemStatusEl.querySelector('.status-text').textContent = `Missing: ${missing.join(', ')}`;
        systemStatusEl.classList.add('error');
        exportStatusEl.textContent = `⚠️ Missing API keys: ${missing.join(', ')}. Check your .env file.`;
        exportStatusEl.style.color = 'var(--danger)';
        startBtn.disabled = true;
        return false;
      }
      systemStatusEl.querySelector('.status-text').textContent = 'Ready';
      systemStatusEl.classList.add('healthy');
      exportStatusEl.textContent = '';
      exportStatusEl.style.color = '';
      return true;
    }
  } catch (err) {
    console.error('Health check failed', err);
    systemStatusEl.querySelector('.status-text').textContent = 'Server offline';
    systemStatusEl.classList.add('error');
    exportStatusEl.textContent = '⚠️ Cannot reach server';
    exportStatusEl.style.color = 'var(--danger)';
    startBtn.disabled = true;
    return false;
  }
  return false;
}

async function startSession() {
  if (sessionActive) return;
  
  const healthy = await checkHealth();
  if (!healthy) {
    startBtn.disabled = false;
    return;
  }
  
  try {
    startBtn.disabled = true;
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

    sessionActive = true;
    stopBtn.disabled = false;
    refreshTalkButtons();
    setTargetStatus('claude', 'Idle', false);
    setTargetStatus('guest', 'Idle', false);
    
    // Show recording setup reminder
    exportStatusEl.textContent = '🎥 Ready! Start your screen recording software now.';
    exportStatusEl.style.color = 'var(--success)';
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

  if (sessionTimer) {
    clearInterval(sessionTimer);
    sessionTimer = null;
  }

  if (snippetRecorder && snippetRecorder.state !== 'inactive') {
    snippetRecorder.stop();
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
    const isActive = activeTarget === target;
    const state = isActive ? talkState : 'idle';
    button.classList.remove('state-idle', 'state-recording', 'state-sending');
    button.classList.add(`state-${state}`);
    const disable =
      !sessionActive ||
      (activeTarget !== null && activeTarget !== target) ||
      (isActive && talkState === 'sending');
    button.disabled = disable;
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
}

function handleTalk(target) {
  if (!sessionActive) return;

  if (activeTarget === null && talkState === 'idle') {
    startSnippetRecording(target);
    return;
  }

  if (activeTarget === target && talkState === 'recording') {
    stopSnippetRecording();
  }
}

function startSnippetRecording(target) {
  if (!mediaStream) return;

  activeTarget = target;
  talkState = 'recording';
  snippetChunks = [];

  const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
    ? 'audio/webm;codecs=opus'
    : undefined;

  snippetRecorder = new MediaRecorder(mediaStream, mimeType ? { mimeType } : undefined);
  snippetRecorder.ondataavailable = (event) => {
    if (event.data && event.data.size > 0) {
      snippetChunks.push(event.data);
    }
  };

  snippetRecorder.onstop = () => {
    const targetSnapshot = activeTarget;
    sendSnippet(targetSnapshot);
  };

  snippetRecorder.start();
  setTalkButtonState(target, 'recording');
  refreshTalkButtons();
  setTargetStatus(target, 'Listening…', true);
}

function stopSnippetRecording() {
  if (snippetRecorder && snippetRecorder.state !== 'inactive') {
    snippetRecorder.stop();
  }
  talkState = 'sending';
  if (activeTarget) {
    setTalkButtonState(activeTarget, 'sending');
    setTargetStatus(activeTarget, 'Processing…', true);
  }
  refreshTalkButtons();
}

async function sendSnippet(target) {
  const config = TARGET_CONFIG[target];
  if (!config) {
    console.error('Unknown conversation target', target);
    return;
  }

  try {
    const snippetBlob = new Blob(snippetChunks, { type: snippetRecorder?.mimeType || 'audio/webm' });
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
    snippetRecorder = null;
    snippetChunks = [];
    talkState = 'idle';
    activeTarget = null;
    refreshTalkButtons();
  }
}

async function playAiAudio(base64, target, mimeType = 'audio/wav') {
  if (!audioContext) return;
  if (!base64) return;

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
  source.onended = () => {
    gainNode.disconnect();
  };
  
  source.start();
}

window.addEventListener('beforeunload', () => {
  if (audioContext) {
    audioContext.close();
  }
});
