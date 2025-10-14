// Simplified preview version - UI only, no backend calls
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

let sessionTimer;
let sessionStartTime;
let activeTarget = null;
let talkState = 'idle';
let sessionActive = false;
let turnCount = 0;
let animationId;

startBtn.addEventListener('click', startSession);
stopBtn.addEventListener('click', stopSession);
talkClaudeBtn.addEventListener('click', () => handleTalk('claude'));
talkGuestBtn.addEventListener('click', () => handleTalk('guest'));

// Show ready status
systemStatusEl.querySelector('.status-text').textContent = 'Preview Mode';
systemStatusEl.classList.add('healthy');
exportStatusEl.textContent = '👁️ UI Preview Mode - No backend required';
exportStatusEl.style.color = 'var(--success)';

refreshTalkButtons();
startAnimations();

function startSession() {
  if (sessionActive) return;

  startBtn.disabled = true;
  exportStatusEl.textContent = '✨ Recording simulation active';
  exportStatusEl.style.color = 'var(--success)';
  turnCount = 0;
  turnCountEl.textContent = '0 turns';
  logContainer.innerHTML = '';
  if (transcriptEmptyEl) {
    transcriptEmptyEl.style.display = 'flex';
  }

  sessionStartTime = Date.now();
  sessionTimer = setInterval(updateTimer, 500);
  timerEl.textContent = '00:00';

  activeTarget = null;
  talkState = 'idle';

  sessionActive = true;
  stopBtn.disabled = false;
  refreshTalkButtons();
  setTargetStatus('claude', 'Idle', false);
  setTargetStatus('guest', 'Idle', false);
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

  sessionActive = false;
  activeTarget = null;
  talkState = 'idle';
  refreshTalkButtons();
  setTargetStatus('claude', 'Idle', false);
  setTargetStatus('guest', 'Idle', false);
  startBtn.disabled = false;

  exportStatusEl.textContent = '👁️ UI Preview Mode - No backend required';
  exportStatusEl.style.color = 'var(--success)';
}

function startAnimations() {
  const claudeData = new Uint8Array(256);
  const guestData = new Uint8Array(256);

  const draw = () => {
    animationId = requestAnimationFrame(draw);

    // Generate some animated data
    const time = Date.now() / 1000;
    const claudeLevel = sessionActive ? Math.sin(time * 2) * 0.3 + 0.3 : 0.1;
    const guestLevel = sessionActive ? Math.cos(time * 1.5) * 0.3 + 0.3 : 0.1;

    drawAnalyserWave(claudeLevel, claudeCtx, claudeCanvas, 'claude');
    drawAnalyserWave(guestLevel, guestCtx, guestCanvas, 'guest');
  };

  draw();
}

function drawAnalyserWave(normalizedLevel, ctx, canvas, speaker) {
  // Orb settings based on speaker
  let colors;
  if (speaker === 'claude') {
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

  // Clear canvas
  ctx.clearRect(0, 0, canvas.width, canvas.height);

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
  const statusEl = target === 'claude' ? claudeStatusEl : guestStatusEl;
  if (!statusEl) return;
  statusEl.textContent = text;
  statusEl.style.background = accent
    ? 'rgba(94, 122, 255, 0.25)'
    : 'rgba(255, 255, 255, 0.08)';
}

function handleTalk(target) {
  if (!sessionActive) return;

  if (activeTarget === null && talkState === 'idle') {
    startRecording(target);
    return;
  }

  if (activeTarget === target && talkState === 'recording') {
    stopRecording(target);
  }
}

function startRecording(target) {
  activeTarget = target;
  talkState = 'recording';

  setTalkButtonState(target, 'recording');
  refreshTalkButtons();
  setTargetStatus(target, 'Listening…', true);
}

function stopRecording(target) {
  talkState = 'sending';
  setTalkButtonState(target, 'sending');
  setTargetStatus(target, 'Processing…', true);
  refreshTalkButtons();

  // Simulate response after 2 seconds
  setTimeout(() => {
    const config = target === 'claude'
      ? { label: 'Claude', sampleText: 'This is a simulated response from Claude. In the real app, this would be generated by the AI based on your audio input.' }
      : { label: 'Guest AI', sampleText: 'This is a simulated response from the Guest AI. The actual response would come from OpenAI based on the conversation context.' };

    appendLogEntry('Basil', `[Simulated audio clip sent to ${config.label}]`);
    appendLogEntry('Basil (transcribed)', 'This is simulated transcription of your audio input.');
    appendLogEntry(config.label, config.sampleText);

    setTargetStatus(target, 'Responded', false);

    talkState = 'idle';
    activeTarget = null;
    refreshTalkButtons();
  }, 2000);
}
