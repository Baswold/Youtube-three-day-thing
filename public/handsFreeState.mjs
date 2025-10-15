export const HANDS_FREE_DEFAULTS = {
  startThreshold: 0.025,
  stopThreshold: 0.012,
  minSpeechMs: 300,
  minSilenceMs: 600,
  minGapMs: 300,
};

export function createHandsFreeState(initial = {}) {
  let nextAutoTarget = initial.nextAutoTarget ?? null;
  let health = { anthropic: false, openai: false, ...(initial.health || {}) };

  function availableTargets() {
    const targets = [];
    if (health.anthropic) targets.push('claude');
    if (health.openai) targets.push('guest');
    return targets;
  }

  function ensureNextTarget() {
    const available = availableTargets();
    if (available.length === 0) {
      nextAutoTarget = null;
      return;
    }
    if (!nextAutoTarget || !available.includes(nextAutoTarget)) {
      nextAutoTarget = available[0];
    }
  }

  function setHealthStatus(newHealth = {}) {
    health = { ...health, ...newHealth };
    ensureNextTarget();
  }

  function setNextAutoTarget(target) {
    nextAutoTarget = target;
    ensureNextTarget();
  }

  function chooseNextTarget() {
    const available = availableTargets();
    if (available.length === 0) {
      return null;
    }

    ensureNextTarget();
    const chosen = nextAutoTarget || available[0];

    if (available.length > 1) {
      const alternate = chosen === 'claude' ? 'guest' : 'claude';
      nextAutoTarget = available.includes(alternate) ? alternate : chosen;
    }

    return chosen;
  }

  function resetOrder() {
    ensureNextTarget();
  }

  return {
    setHealth: setHealthStatus,
    setNextAutoTarget,
    chooseNextTarget,
    resetOrder,
    getNextAutoTarget: () => nextAutoTarget,
    getAvailableTargets: () => availableTargets().slice(),
  };
}
