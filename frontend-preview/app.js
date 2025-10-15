// Simplified preview version - UI only, no backend calls
const ORB_TARGETS = ['claude', 'guest'];
const ORB_STORAGE_KEY = 'yt-three-day-orb-settings';
const isRecordPage = document.body.classList.contains('record-mode');

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

const systemStatusEl = document.getElementById('systemStatus');
const turnCountEl = document.getElementById('turnCount');
const transcriptEmptyEl = document.getElementById('transcriptEmpty');

const orbStylePanel = document.getElementById('orbStylePanel');
const toggleOrbPanelBtn = document.getElementById('toggleOrbPanel');

const claudeHueInput = document.getElementById('claudeHue');
const guestHueInput = document.getElementById('guestHue');
const hueValueEls = {
  claude: document.querySelector('.color-value[data-target="claude"]'),
  guest: document.querySelector('.color-value[data-target="guest"]')
};

const orbSettings = loadOrbSettings();

const orbRegistry = ORB_TARGETS.reduce((registry, target) => {
  const container = document.querySelector(`[data-orb-target="${target}"]`);
  const canvas = container?.querySelector('.monitor-canvas');

  if (canvas) {
    registry[target] = {
      container,
      canvas,
      ctx: canvas.getContext('2d')
    };
  }

  return registry;
}, {});

const hasRenderableOrbs = Object.keys(orbRegistry).length > 0;

[['claude', claudeHueInput], ['guest', guestHueInput]].forEach(([target, input]) => {
  if (!input) return;

  const currentHue = orbSettings[target]?.hue ?? getDefaultOrbSettings()[target].hue;
  input.value = String(currentHue);
  updateSliderLabel(target, currentHue);

  input.addEventListener('input', (event) => {
    const value = Number(event.target.value);
    updateOrbHue(target, value);
    updateSliderLabel(target, value);
    revealOrbPanel();
  });

  input.addEventListener('focus', () => {
    revealOrbPanel();
  });
});

if (toggleOrbPanelBtn && orbStylePanel) {
  toggleOrbPanelBtn.addEventListener('click', () => {
    const isOpen = orbStylePanel.classList.toggle('open');
    toggleOrbPanelBtn.setAttribute('aria-expanded', String(isOpen));
  });
}

window.addEventListener('storage', (event) => {
  if (event.key !== ORB_STORAGE_KEY || !event.newValue) return;
  try {
    const parsed = JSON.parse(event.newValue);
    const sanitized = sanitizeOrbSettings(parsed);
    applyOrbSettings(sanitized, { syncInputs: true });
  } catch (error) {
    console.warn('Unable to apply shared orb settings', error);
  }
});

applyOrbSettings(orbSettings, { syncInputs: false });

function revealOrbPanel() {
  if (!orbStylePanel || !toggleOrbPanelBtn) return;
  if (!orbStylePanel.classList.contains('open')) {
    orbStylePanel.classList.add('open');
    toggleOrbPanelBtn.setAttribute('aria-expanded', 'true');
  }
}

let resizeTimeout;

function resizeCanvases() {
  if (!hasRenderableOrbs) return;

  const ratio = window.devicePixelRatio || 1;

  Object.values(orbRegistry).forEach(({ canvas, container }) => {
    if (!canvas) return;
    const holder = container ?? canvas.parentElement;
    if (!holder) return;

    const rect = holder.getBoundingClientRect();
    const availableWidth = rect.width || holder.offsetWidth || canvas.clientWidth || 320;
    let size = availableWidth;

    if (!isRecordPage) {
      size = Math.min(size, 520);
    }

    canvas.style.width = `${size}px`;
    canvas.style.height = `${size}px`;
    canvas.width = Math.max(1, Math.round(size * ratio));
    canvas.height = Math.max(1, Math.round(size * ratio));
  });
}

if (hasRenderableOrbs) {
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(resizeCanvases, 150);
  });
}

let sessionTimer;
let sessionStartTime;
let activeTarget = null;
let talkState = 'idle';
let sessionActive = false;
let turnCount = 0;
let animationId;

if (startBtn) {
  startBtn.addEventListener('click', startSession);
}

if (stopBtn) {
  stopBtn.addEventListener('click', stopSession);
}

if (talkClaudeBtn) {
  talkClaudeBtn.addEventListener('click', () => handleTalk('claude'));
}

if (talkGuestBtn) {
  talkGuestBtn.addEventListener('click', () => handleTalk('guest'));
}

if (systemStatusEl) {
  const statusText = systemStatusEl.querySelector('.status-text');
  if (statusText) {
    statusText.textContent = 'Preview Mode';
  }
  systemStatusEl.classList.add('healthy');
}

if (exportStatusEl) {
  exportStatusEl.textContent = '👁️ UI Preview Mode - No backend required';
  exportStatusEl.style.color = 'var(--success)';
}

refreshTalkButtons();
resizeCanvases();
startAnimations();

function startSession() {
  if (!startBtn || !stopBtn || sessionActive) return;

  startBtn.disabled = true;
  if (exportStatusEl) {
    exportStatusEl.textContent = '✨ Recording simulation active';
    exportStatusEl.style.color = 'var(--success)';
  }
  turnCount = 0;
  if (turnCountEl) {
    turnCountEl.textContent = '0 turns';
  }
  if (logContainer) {
    logContainer.innerHTML = '';
  }
  if (transcriptEmptyEl) {
    transcriptEmptyEl.style.display = 'flex';
  }

  sessionStartTime = Date.now();
  sessionTimer = setInterval(updateTimer, 500);
  if (timerEl) {
    timerEl.textContent = '00:00';
  }

  activeTarget = null;
  talkState = 'idle';

  sessionActive = true;
  stopBtn.disabled = false;
  refreshTalkButtons();
  setTargetStatus('claude', 'Idle', false);
  setTargetStatus('guest', 'Idle', false);
}

function stopSession() {
  if (!stopBtn || !sessionActive) return;

  stopBtn.disabled = true;
  if (talkClaudeBtn) {
    talkClaudeBtn.disabled = true;
  }
  if (talkGuestBtn) {
    talkGuestBtn.disabled = true;
  }

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
  if (startBtn) {
    startBtn.disabled = false;
  }

  if (exportStatusEl) {
    exportStatusEl.textContent = '👁️ UI Preview Mode - No backend required';
    exportStatusEl.style.color = 'var(--success)';
  }
}

function startAnimations() {
  if (!hasRenderableOrbs) return;

  const draw = () => {
    animationId = requestAnimationFrame(draw);

    // Generate some animated data
    const time = Date.now() / 1000;
    const isActive = sessionActive || isRecordPage;
    const claudeLevel = isActive ? Math.sin(time * 2) * 0.3 + 0.35 : 0.12;
    const guestLevel = isActive ? Math.cos(time * 1.5) * 0.3 + 0.35 : 0.12;

    drawAnalyserWave(claudeLevel, 'claude');
    drawAnalyserWave(guestLevel, 'guest');
  };

  draw();
}

function drawAnalyserWave(normalizedLevel, target) {
  const orb = orbRegistry[target];
  if (!orb) return;

  const hue = orbSettings[target]?.hue ?? getDefaultOrbSettings()[target].hue;
  const colors = getOrbColors(hue);
  drawFluidOrb(orb.ctx, orb.canvas, normalizedLevel, colors);
}

function getOrbColors(hue) {
  const normalizedHue = ((hue % 360) + 360) % 360;
  const inner = [
    hslToHex(normalizedHue, 80, 58),
    hslToHex((normalizedHue + 12) % 360, 76, 68),
    hslToHex((normalizedHue + 24) % 360, 72, 78)
  ];

  const outer = [
    hslToRgba(normalizedHue, 82, 60, 0.45),
    hslToRgba((normalizedHue + 12) % 360, 74, 70, 0.25),
    hslToRgba((normalizedHue + 24) % 360, 70, 78, 0.1)
  ];

  return { inner, outer };
}

function hslToHex(h, s, l) {
  const { r, g, b } = hslToRgb(h, s, l);
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

function hslToRgba(h, s, l, a) {
  const { r, g, b } = hslToRgb(h, s, l);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

function hslToRgb(h, s, l) {
  const saturation = s / 100;
  const lightness = l / 100;
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const hueSegment = h / 60;
  const x = chroma * (1 - Math.abs((hueSegment % 2) - 1));
  let r1 = 0;
  let g1 = 0;
  let b1 = 0;

  if (hueSegment >= 0 && hueSegment < 1) {
    r1 = chroma;
    g1 = x;
  } else if (hueSegment >= 1 && hueSegment < 2) {
    r1 = x;
    g1 = chroma;
  } else if (hueSegment >= 2 && hueSegment < 3) {
    g1 = chroma;
    b1 = x;
  } else if (hueSegment >= 3 && hueSegment < 4) {
    g1 = x;
    b1 = chroma;
  } else if (hueSegment >= 4 && hueSegment < 5) {
    r1 = x;
    b1 = chroma;
  } else {
    r1 = chroma;
    b1 = x;
  }

  const match = lightness - chroma / 2;
  const r = Math.round((r1 + match) * 255);
  const g = Math.round((g1 + match) * 255);
  const b = Math.round((b1 + match) * 255);

  return { r, g, b };
}

function drawFluidOrb(ctx, canvas, normalizedLevel, colors) {
  const ratio = window.devicePixelRatio || 1;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);

  const width = canvas.width / ratio;
  const height = canvas.height / ratio;
  const centerX = width / 2;
  const centerY = height / 2;
  const time = Date.now() / 1000;

  const ambientLevel = Math.max(0.08, normalizedLevel);
  const baseRadius = Math.min(width, height) * 0.35;
  const pulseAmount = ambientLevel * 12;
  const radius = baseRadius + pulseAmount;

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 3; i >= 1; i--) {
    const glowRadius = radius * (1 + i * 0.18);
    const gradient = ctx.createRadialGradient(
      centerX,
      centerY,
      radius * 0.1,
      centerX,
      centerY,
      glowRadius
    );

    gradient.addColorStop(0, colors.outer[0]);
    gradient.addColorStop(0.45, colors.outer[1]);
    gradient.addColorStop(0.85, colors.outer[2]);
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');

    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(centerX, centerY, glowRadius, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  ctx.save();
  const angle = time * 0.65 + ambientLevel * Math.PI;
  const offsetX = Math.cos(angle) * radius * 0.28;
  const offsetY = Math.sin(angle) * radius * 0.28;

  const mainGradient = ctx.createRadialGradient(
    centerX + offsetX,
    centerY + offsetY,
    0,
    centerX,
    centerY,
    radius
  );

  mainGradient.addColorStop(0, colors.inner[2]);
  mainGradient.addColorStop(0.32, colors.inner[1]);
  mainGradient.addColorStop(0.68, colors.inner[0]);
  mainGradient.addColorStop(1, colors.outer[0]);

  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = mainGradient;
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineWidth = 1.2 + ambientLevel * 2.6;
  ctx.lineCap = 'round';
  const ringGradient = ctx.createLinearGradient(centerX - radius, centerY, centerX + radius, centerY);
  ringGradient.addColorStop(0, colors.outer[1]);
  ringGradient.addColorStop(0.5, colors.inner[1]);
  ringGradient.addColorStop(1, colors.outer[0]);
  const waveCount = 4;
  for (let i = 0; i < waveCount; i++) {
    const phase = time * 0.7 + i * 0.6;
    const tilt = Math.sin(phase) * 0.35;
    ctx.strokeStyle = ringGradient;
    ctx.globalAlpha = 0.28 + (i / waveCount) * 0.2;
    ctx.beginPath();
    ctx.ellipse(
      centerX,
      centerY,
      radius * (0.72 + i * 0.08),
      radius * (0.68 + i * 0.07),
      tilt,
      0,
      Math.PI * 2
    );
    ctx.stroke();
  }
  ctx.restore();

  const highlightAngle = time * 1.1;
  const highlightX = centerX + Math.cos(highlightAngle) * radius * 0.25;
  const highlightY = centerY + Math.sin(highlightAngle) * radius * 0.25;

  const highlightGradient = ctx.createRadialGradient(
    highlightX,
    highlightY,
    0,
    highlightX,
    highlightY,
    radius * 0.7
  );

  highlightGradient.addColorStop(0, 'rgba(255, 255, 255, 0.45)');
  highlightGradient.addColorStop(0.5, 'rgba(255, 255, 255, 0.18)');
  highlightGradient.addColorStop(1, 'rgba(255, 255, 255, 0)');

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = highlightGradient;
  ctx.beginPath();
  ctx.arc(highlightX, highlightY, radius * 0.7, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  if (ambientLevel > 0.1) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const particleCount = Math.floor(ambientLevel * 24);

    for (let i = 0; i < particleCount; i++) {
      const particleAngle = time * 2 + (i / particleCount) * Math.PI * 2;
      const distance = radius * (0.45 + Math.random() * 0.55);
      const px = centerX + Math.cos(particleAngle + Math.random() * 0.4) * distance;
      const py = centerY + Math.sin(particleAngle + Math.random() * 0.4) * distance;
      const particleSize = (1 + ambientLevel * 2.5) * (0.4 + Math.random());

      const particleGradient = ctx.createRadialGradient(px, py, 0, px, py, particleSize * 4);
      particleGradient.addColorStop(0, colors.inner[1]);
      particleGradient.addColorStop(0.5, colors.outer[1]);
      particleGradient.addColorStop(1, 'rgba(0, 0, 0, 0)');

      ctx.fillStyle = particleGradient;
      ctx.beginPath();
      ctx.arc(px, py, particleSize * 4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  ctx.globalCompositeOperation = 'source-over';
}

function updateSliderLabel(target, value) {
  const label = hueValueEls[target];
  if (!label) return;
  const defaults = getDefaultOrbSettings();
  const fallback = defaults[target]?.hue ?? 0;
  const hue = normalizeHueValue(value, orbSettings[target]?.hue ?? fallback);
  label.textContent = `${Math.round(hue)}\u00B0`;
}

function updateOrbHue(target, value) {
  const defaults = getDefaultOrbSettings();
  const fallback = defaults[target]?.hue ?? 0;
  const hue = normalizeHueValue(value, fallback);

  if (!orbSettings[target]) {
    orbSettings[target] = { hue };
  } else {
    orbSettings[target].hue = hue;
  }

  persistOrbSettings(orbSettings);
}

function applyOrbSettings(newSettings, { syncInputs = false } = {}) {
  const defaults = getDefaultOrbSettings();

  ORB_TARGETS.forEach((target) => {
    const hue = normalizeHueValue(newSettings[target]?.hue, defaults[target].hue);

    if (!orbSettings[target]) {
      orbSettings[target] = { hue };
    } else {
      orbSettings[target].hue = hue;
    }

    if (syncInputs) {
      const input = target === 'claude' ? claudeHueInput : guestHueInput;
      if (input) {
        input.value = String(hue);
      }
      updateSliderLabel(target, hue);
    }
  });
}

function loadOrbSettings() {
  const defaults = getDefaultOrbSettings();

  if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
    return { ...defaults };
  }

  try {
    const stored = localStorage.getItem(ORB_STORAGE_KEY);
    if (!stored) {
      return { ...defaults };
    }

    const parsed = JSON.parse(stored);
    return sanitizeOrbSettings(parsed);
  } catch (error) {
    console.warn('Unable to load orb settings', error);
    return { ...defaults };
  }
}

function persistOrbSettings(settings) {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
    return;
  }

  try {
    localStorage.setItem(ORB_STORAGE_KEY, JSON.stringify(settings));
  } catch (error) {
    console.warn('Unable to save orb settings', error);
  }
}

function sanitizeOrbSettings(raw) {
  const defaults = getDefaultOrbSettings();
  const sanitized = {};

  ORB_TARGETS.forEach((target) => {
    const fallback = defaults[target].hue;
    sanitized[target] = {
      hue: normalizeHueValue(raw?.[target]?.hue, fallback)
    };
  });

  return sanitized;
}

function getDefaultOrbSettings() {
  return {
    claude: { hue: 260 },
    guest: { hue: 330 }
  };
}

function normalizeHueValue(value, fallback) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }

  const normalized = ((numeric % 360) + 360) % 360;
  return Math.round(normalized * 1000) / 1000;
}

function updateTimer() {
  if (!sessionStartTime || !timerEl) return;
  const elapsed = Date.now() - sessionStartTime;
  const minutes = Math.floor(elapsed / 60000);
  const seconds = Math.floor((elapsed % 60000) / 1000);
  timerEl.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

function setTalkButtonState(target, state) {
  const button = target === 'claude' ? talkClaudeBtn : talkGuestBtn;
  if (!button) return;
  button.classList.remove('state-idle', 'state-recording', 'state-sending');
  button.classList.add(`state-${state}`);
}

function updateTurnCount() {
  turnCount += 1;
  if (turnCountEl) {
    turnCountEl.textContent = `${turnCount} turn${turnCount === 1 ? '' : 's'}`;
  }
  if (transcriptEmptyEl && turnCount > 0) {
    transcriptEmptyEl.style.display = 'none';
  }
}

function refreshTalkButtons() {
  if (!talkClaudeBtn && !talkGuestBtn) return;
  ['claude', 'guest'].forEach((target) => {
    const button = target === 'claude' ? talkClaudeBtn : talkGuestBtn;
    if (!button) return;
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
  if (!logTemplate || !logContainer) return;
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
